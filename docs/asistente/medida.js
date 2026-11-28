// Medir desde el navegador: el ESP32 genera la señal (órdenes «barrido» y
// «medir» por Web Serial) mientras la página graba el micrófono sin procesar.
// El resultado es un WAV en memoria, el mismo que haría medidas/medir.py.

export const NIVEL_MIN = -60, NIVEL_MAX = -6;       // dBFS de pico, como el firmware
const OBJETIVO = -9;                                // pico buscado en la grabación
const BANDA = [-14, -5];                            // pico aceptable
const SUBIDA_MAX = 10;                              // dB por intento
const COLA_S = 2;                                   // grabación tras el final de la señal

// ---------------------------------------------------------------- micrófono

const PROCESADOR = `
class Grabador extends AudioWorkletProcessor {
  process(entradas) {
    const e = entradas[0];
    if (e && e.length) this.port.postMessage(e.map((c) => c.slice(0)));
    return true;
  }
}
registerProcessor("grabador", Grabador);`;

export async function microfonos() {
  const lista = await navigator.mediaDevices.enumerateDevices();
  return lista.filter((d) => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications");
}

// Pide permiso (una vez) para que aparezcan los nombres de los micrófonos
export async function permiso() {
  const s = await navigator.mediaDevices.getUserMedia({ audio: true });
  s.getTracks().forEach((p) => p.stop());
}

export class Grabadora {
  async abrir(deviceId) {
    this.flujo = await navigator.mediaDevices.getUserMedia({ audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      channelCount: { ideal: 2 } } });
    const pista = this.flujo.getAudioTracks()[0];
    const c = pista.getSettings?.() ?? {};
    // Lo que el navegador no ha podido quitar (alteraría la medida)
    this.procesado = ["echoCancellation", "noiseSuppression", "autoGainControl"].filter((k) => c[k] === true);
    this.nombre = pista.label;
    this.ctx = new AudioContext({ sampleRate: 48000 });
    const url = URL.createObjectURL(new Blob([PROCESADOR], { type: "text/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    this.fuente = this.ctx.createMediaStreamSource(this.flujo);
    this.nodo = new AudioWorkletNode(this.ctx, "grabador");
    this.silencio = this.ctx.createGain();
    this.silencio.gain.value = 0;                  // para que el navegador la procese
    this.fuente.connect(this.nodo).connect(this.silencio).connect(this.ctx.destination);
    this.trozos = null;
    this.nodo.port.onmessage = (e) => this.trozos?.push(e.data);
    await this.ctx.resume();
  }

  empezar() { this.trozos = []; }

  terminar() {
    const t = this.trozos ?? [];
    this.trozos = null;
    const canales = Math.max(1, ...t.map((x) => x.length));
    const n = t.reduce((s, x) => s + x[0].length, 0);
    const datos = Array.from({ length: canales }, () => new Float32Array(n));
    let p = 0;
    for (const x of t) {
      for (let c = 0; c < canales; c++) datos[c].set(x[c] ?? x[0], p);
      p += x[0].length;
    }
    return { fs: this.ctx.sampleRate, datos };
  }

  async cerrar() {
    this.flujo?.getTracks().forEach((p) => p.stop());
    try { await this.ctx?.close(); } catch { /* ya cerrado */ }
    this.ctx = null;
  }
}

// WAV de coma flotante de 32 bits (como escribir_wav_flotante de comun.py)
export function wav({ fs, datos }) {
  const canales = datos.length, n = datos[0].length;
  const b = new ArrayBuffer(44 + n * canales * 4), v = new DataView(b);
  const txt = (p, s) => [...s].forEach((ch, i) => v.setUint8(p + i, ch.charCodeAt(0)));
  txt(0, "RIFF"); v.setUint32(4, 36 + n * canales * 4, true); txt(8, "WAVE");
  txt(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, canales, true);
  v.setUint32(24, fs, true); v.setUint32(28, fs * canales * 4, true); v.setUint16(32, canales * 4, true);
  v.setUint16(34, 32, true); txt(36, "data"); v.setUint32(40, n * canales * 4, true);
  const f = new Float32Array(b, 44);
  for (let i = 0; i < n; i++) for (let c = 0; c < canales; c++) f[i * canales + c] = datos[c][i];
  return b;
}

// Pico y ruido de fondo (primer 0,4 s, antes de que suene nada), en dBFS
export function niveles({ fs, datos }) {
  const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
  let mejor = { pico: -180, ruido: -180 };
  for (const d of datos) {
    let pico = 0, e = 0;
    const nr = Math.min(d.length, Math.round(0.4 * fs));
    for (let i = 0; i < d.length; i++) pico = Math.max(pico, Math.abs(d[i]));
    for (let i = 0; i < nr; i++) e += d[i] * d[i];
    if (db(pico) > mejor.pico) mejor = { pico: db(pico), ruido: db(Math.sqrt(e / Math.max(nr, 1)) * Math.SQRT2) };
  }
  return mejor;
}

// ---------------------------------------------------------------- medida

// Graba mientras el ESP32 genera la señal. «orden»: "medir" o "barrido".
// Llama a alAvanzar(fracción) durante la medida. «cancelar.pedido» la para.
export async function grabar(serie, grabadora, { orden, canal, nivel, fmin, alAvanzar, cancelar }) {
  const nombreCanal = { I: "izquierdo", D: "derecho" }[canal] ?? "ambos";
  grabadora.empezar();
  await new Promise((r) => setTimeout(r, 500));             // silencio inicial para el ruido de fondo
  let sigo = null, reloj = null;
  try {
    const r = await serie.orden(`${orden} ${nombreCanal} ${nivel.toFixed(1)} ${Math.round(fmin)}`, (l) => l.startsWith("ok midiendo"));
    const dur = parseFloat(r.match(/\| ([\d.]+) s \|/)?.[1] ?? "70");
    const fin = serie.oir((l) => l.startsWith("medida "), (dur + 15) * 1000);
    sigo = setInterval(() => {
      if (cancelar?.pedido) serie.mandar("parar").catch(() => {});
      else serie.mandar("sigo").catch(() => {});
    }, 1000);
    const t0 = performance.now();
    reloj = setInterval(() => alAvanzar?.(Math.min(1, (performance.now() - t0) / 1000 / (dur + COLA_S))), 250);
    const l = await fin;
    if (!l.startsWith("medida terminada")) throw new Error(l.replace(/^medida cancelada: /, ""));
    if (l.includes("CORTES")) throw new Error("cortes");
    await new Promise((r) => setTimeout(r, COLA_S * 1000));   // la cola de la sala
    alAvanzar?.(1);
    return grabadora.terminar();
  } catch (e) {
    grabadora.terminar();
    serie.mandar("parar").catch(() => {});
    throw e;
  } finally {
    clearInterval(sigo);
    clearInterval(reloj);
  }
}

// Busca el nivel de la señal para que el micrófono reciba un pico de unos -9 dBFS.
// Devuelve { nivel, pico, ruido, motivo } («motivo» si no lo ha conseguido).
export async function ajustarNivel(serie, grabadora, { canal, fmin, nivel = -40, alIntento, cancelar }) {
  let ultimo = null;
  for (let i = 0; i < 4; i++) {
    if (cancelar?.pedido) return { nivel, motivo: "cancelado" };
    const g = await grabar(serie, grabadora, { orden: "barrido", canal, nivel, fmin, cancelar });
    const { pico, ruido } = niveles(g);
    ultimo = { nivel, pico, ruido };
    alIntento?.(ultimo);
    if (pico - ruido < 15) return { ...ultimo, motivo: "nollega" };
    if (pico >= BANDA[0] && pico <= BANDA[1]) return ultimo;
    let siguiente = nivel + (OBJETIVO - pico);
    if (pico > -1) siguiente = nivel - 15;                    // satura: bajar mucho
    siguiente = Math.round(Math.min(NIVEL_MAX, Math.max(NIVEL_MIN, Math.min(siguiente, nivel + SUBIDA_MAX))));
    if (siguiente === nivel) return { ...ultimo, motivo: pico < BANDA[0] ? "bajo" : "alto" };
    nivel = siguiente;
  }
  return { ...ultimo, motivo: ultimo.pico < BANDA[0] ? "bajo" : "alto" };
}
