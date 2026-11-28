// Asistente: medir → elegir → probar → verificar → guardar, paso a paso.
// Usa el mismo análisis que la página «Analizar» (trabajador con Pyodide) y la
// misma conexión y comandos que el panel.
import { FABRICA, comandosEntre, leerAjustes, escribirPerfil } from "../panel/dsp.js";
import { Serie } from "../panel/serie.js";

const $ = (id) => document.getElementById(id);
const REFUERZO_AVISO = 6;
const N_PASOS = 6;

// ------------------------------------------------------------------ textos
const T = {
  es: {
    titulo: "· Asistente", otro: "English", panel: "Panel", ayuda: "Cómo funciona",
    conectado: "Conectado", sin: "Sin conectar", atras: "Atrás", siguiente: "Siguiente", fin: "Terminar",
    nPasos: ["Preparar", "Sin corrección", "Medir", "Elegir y probar", "Verificar", "Guardar"],
    p1: "1. Prepara la medida",
    p1Intro: "Vamos a medir un altavoz, proponerte una corrección, probarla y comprobar que funciona. Cada altavoz se mide por separado.",
    nombre: "Nombre del altavoz", canal: "Altavoz que vas a medir", izquierdo: "Izquierdo", derecho: "Derecho",
    tamano: "Tamaño del altavoz", pequeno: "Pequeño (menos de 8 cm)", mediano: "Mediano (8 a 16 cm)", grande: "Grande o de graves (más de 16 cm)",
    notaTamano: "Sirve para no mandarle graves que no puede dar. Es orientativo: con un altavoz pequeño la medida empieza en 80 Hz; con uno mediano, en 40 Hz; con uno grande, en 20 Hz.",
    c1: "El micrófono está a 1 cm del centro del cono del altavoz elegido, sin tocarlo.",
    c2: "El móvil no está conectado por Bluetooth a TuneAmp32.",
    c3: "El volumen del amplificador está bajo.",
    c4: "La habitación está en silencio y el micrófono conectado al ordenador por USB.",
    falta1: "Escribe un nombre y marca las cuatro casillas.",
    p2: "2. Deja el altavoz sin corrección",
    p2Intro: "Para medir el altavoz tal cual es, el ESP32 tiene que estar sin corrección. Conéctalo por USB y pulsa el botón.",
    conectar: "Conectar y quitar la corrección", reconectar: "Volver a conectar",
    p2Nota: "No se guarda nada: los ajustes guardados del ESP32 no cambian. Al pasar al paso siguiente, la página suelta el puerto USB para que lo use el programa de medida.",
    listo2: "Listo: el ESP32 está sin corrección.", falta2: "Conecta el ESP32 y quita la corrección.",
    p3: "3. Mide el altavoz",
    p3Intro: "Por ahora la medida se hace con un programa del ordenador. Abre PowerShell en la carpeta de TuneAmp32 y copia estos comandos.",
    p3a: "Primero, comprueba el nivel (10 s)",
    p3aNota: "Repítelo subiendo poco a poco el volumen del amplificador hasta que diga «CORRECTO». Si dice «DEMASIADO ALTO», usa el nivel que te sugiere aquí:",
    nivel: "Nivel de la señal (dBFS)",
    p3b: "Después, la medida (69 s)", p3bNota: "Con el mismo volumen y sin mover el micrófono:",
    p3c: "Por último, carga la grabación", copiar: "Copiar", copiado: "Copiado",
    dondeWav: (n) => `Está en la carpeta medidas\\grabaciones de TuneAmp32, con el nombre ${n}.wav`,
    archivo: "Grabación (WAV)", falta3: "Carga la grabación de la medida.",
    cargandoPython: "Preparando el análisis (la primera vez descarga unos 15 MB)…", cargandoNumpy: "Cargando numpy…",
    analizando: "Analizando (unos segundos)…", hecho: (s) => `Analizada en ${s} s.`, malWav: "No se ha podido analizar",
    p4: "4. Elige la corrección y pruébala",
    hayJoroba: (f, db) => `Tu altavoz exagera los graves alrededor de ${f} Hz (+${db} dB): suena retumbón.`,
    noJoroba: "Tu altavoz no tiene una zona retumbona marcada.",
    graveHasta: (f) => ` Su grave llega hasta unos ${f} Hz.`,
    nada: "Ya es plano en la zona medida: no hace falta corregirlo.",
    detalles: "Ver los datos de la medida", resonancia: "Resonancia", joroba: "Joroba", f3: "F3 (grave −3 dB)",
    ruido: "Señal/ruido", rebotes: "Rebotes de la sala", sinJoroba: "No hay", noCae: "Más abajo de lo medido",
    sinAvisos: "La medida parece correcta.", avisosEs: "Los avisos del análisis están en español.",
    p4a: "Opciones (★ la recomendada)", p4b: "Pruébala con música",
    p4bNota: "Conecta el móvil por Bluetooth, pon música conocida a volumen bajo y pulsa «Probar». Puedes cambiar de opción y volver a probar. Para seguir, deja cargada la que más te guste.",
    probar: "Probar esta opción", quitar: "Escuchar sin corrección",
    recomendada: "★ Recomendada", f3prevista: "Grave hasta", jorobaQueda: "Joroba que queda", grave: "Refuerzo del grave",
    potencia: (x) => `×${x} de potencia`, noRecomendable: "No recomendable",
    falta4: "Prueba una opción y déjala cargada en el ESP32.",
    p5: "5. Comprueba que funciona",
    p5Intro: "Desconecta otra vez el Bluetooth del móvil, deja el micrófono donde estaba y mide de nuevo, ahora con la corrección puesta:",
    falta5: "Carga la grabación de la verificación.",
    p6: "6. Guárdala",
    p6Intro: "Si te gusta cómo suena, guárdala en el ESP32: se mantendrá al apagarlo. Descarga también el perfil para guardarlo o compartirlo.",
    guardar: "Guardar en el ESP32", bajar: "Descargar perfil",
    p6Nota: "¿El otro altavoz? Vuelve al paso 1 y elige el otro canal. Para retocar a oído, usa el Panel.",
    medida: "Medida", prevista: "Prevista", correccion: "Corrección", antes: "Antes", despues: "Después (medida)",
    verBien: (e) => `✓ La corrección funciona: la medida coincide con lo previsto (${e} dB de diferencia media).`,
    verRegular: (e) => `La medida se parece a lo previsto, con ${e} dB de diferencia media. Puede deberse a que el micrófono o el volumen han cambiado.`,
    verMal: (e) => `⚠ La medida no coincide con lo previsto (${e} dB de diferencia media). Comprueba que la corrección sigue cargada, que el micrófono no se ha movido y que el volumen es el mismo, y repite.`,
    pideRefuerzo: "Esta opción refuerza el grave más de 6 dB: puede dañar un altavoz que no lo aguante. Baja el volumen. ¿Continuar?",
    pideDesaconsejada: (m) => `Opción no recomendable: ${m}. ¿Continuar de todos modos?`,
    cargada: "Cargada en el ESP32 (sin guardar).", guardada: "Guardada en el ESP32.", quitada: "Sin corrección (sin guardar).",
    fallo: "El ESP32 no ha aceptado el cambio.", noResponde: "El ESP32 no responde como TuneAmp32.",
    ocupado: "No se puede abrir el puerto: ciérralo en el panel, en PowerShell o en el monitor serie.",
    caido: "Se ha perdido la conexión con el ESP32.", reiniciado: "El ESP32 se ha reiniciado: se ha perdido lo que no estaba guardado.",
    noSerie: "Este navegador no tiene Web Serial. Usa Chrome o Edge en un ordenador.",
    cancelar: "Cancelar", continuar: "Continuar", frec: "Frecuencia",
  },
  en: {
    titulo: "· Assistant", otro: "Español", panel: "Panel", ayuda: "How it works",
    conectado: "Connected", sin: "Not connected", atras: "Back", siguiente: "Next", fin: "Finish",
    nPasos: ["Prepare", "No correction", "Measure", "Choose and try", "Verify", "Save"],
    p1: "1. Prepare the measurement",
    p1Intro: "We will measure a speaker, propose a correction, try it and check that it works. Each speaker is measured on its own.",
    nombre: "Speaker name", canal: "Speaker to measure", izquierdo: "Left", derecho: "Right",
    tamano: "Speaker size", pequeno: "Small (under 8 cm)", mediano: "Medium (8 to 16 cm)", grande: "Large or woofer (over 16 cm)",
    notaTamano: "So it is not sent bass it cannot play. A rough guide: a small speaker is measured from 80 Hz, a medium one from 40 Hz, a large one from 20 Hz.",
    c1: "The microphone is 1 cm from the centre of the chosen speaker's cone, not touching it.",
    c2: "The phone is not connected to TuneAmp32 over Bluetooth.",
    c3: "The amplifier volume is low.",
    c4: "The room is quiet and the microphone is connected to the computer over USB.",
    falta1: "Enter a name and tick the four boxes.",
    p2: "2. Leave the speaker without correction",
    p2Intro: "To measure the speaker as it is, the ESP32 must have no correction. Connect it over USB and press the button.",
    conectar: "Connect and remove correction", reconectar: "Connect again",
    p2Nota: "Nothing is saved: the ESP32's stored settings do not change. When you move on, the page releases the USB port so the measuring program can use it.",
    listo2: "Done: the ESP32 has no correction.", falta2: "Connect the ESP32 and remove the correction.",
    p3: "3. Measure the speaker",
    p3Intro: "For now the measurement is made by a program on the computer. Open PowerShell in the TuneAmp32 folder and copy these commands.",
    p3a: "First, check the level (10 s)",
    p3aNota: "Repeat it, raising the amplifier volume little by little, until it says «CORRECTO». If it says «DEMASIADO ALTO», enter the level it suggests here:",
    nivel: "Signal level (dBFS)",
    p3b: "Then the measurement (69 s)", p3bNota: "Same volume, without moving the microphone:",
    p3c: "Finally, load the recording", copiar: "Copy", copiado: "Copied",
    dondeWav: (n) => `It is in the medidas\\grabaciones folder of TuneAmp32, named ${n}.wav`,
    archivo: "Recording (WAV)", falta3: "Load the measurement recording.",
    cargandoPython: "Preparing the analysis (about 15 MB the first time)…", cargandoNumpy: "Loading numpy…",
    analizando: "Analyzing (a few seconds)…", hecho: (s) => `Analyzed in ${s} s.`, malWav: "Could not analyze",
    p4: "4. Choose the correction and try it",
    hayJoroba: (f, db) => `Your speaker exaggerates the bass around ${f} Hz (+${db} dB): it sounds boomy.`,
    noJoroba: "Your speaker has no marked boomy area.",
    graveHasta: (f) => ` Its bass reaches about ${f} Hz.`,
    nada: "It is already flat in the measured range: no correction needed.",
    detalles: "Show measurement data", resonancia: "Resonance", joroba: "Hump", f3: "F3 (bass −3 dB)",
    ruido: "Signal/noise", rebotes: "Room reflections", sinJoroba: "None", noCae: "Below the measured range",
    sinAvisos: "The measurement looks right.", avisosEs: "Analysis warnings are in Spanish.",
    p4a: "Options (★ recommended)", p4b: "Try it with music",
    p4bNota: "Connect your phone over Bluetooth, play familiar music quietly and press «Try». You can switch options and try again. To continue, leave your favourite loaded.",
    probar: "Try this option", quitar: "Listen without correction",
    recomendada: "★ Recommended", f3prevista: "Bass down to", jorobaQueda: "Remaining hump", grave: "Bass boost",
    potencia: (x) => `×${x} power`, noRecomendable: "Not recommended",
    falta4: "Try an option and leave it loaded in the ESP32.",
    p5: "5. Check that it works",
    p5Intro: "Disconnect the phone's Bluetooth again, leave the microphone where it was and measure again, now with the correction on:",
    falta5: "Load the verification recording.",
    p6: "6. Save it",
    p6Intro: "If you like how it sounds, save it to the ESP32: it is kept when powered off. Also download the profile to keep or share it.",
    guardar: "Save to ESP32", bajar: "Download profile",
    p6Nota: "The other speaker? Go back to step 1 and choose the other channel. To fine-tune by ear, use the Panel.",
    medida: "Measured", prevista: "Predicted", correccion: "Correction", antes: "Before", despues: "After (measured)",
    verBien: (e) => `✓ The correction works: the measurement matches the prediction (${e} dB average difference).`,
    verRegular: (e) => `The measurement is close to the prediction, with ${e} dB average difference. The microphone or volume may have changed.`,
    verMal: (e) => `⚠ The measurement does not match the prediction (${e} dB average difference). Check that the correction is still loaded, the microphone has not moved and the volume is the same, and repeat.`,
    pideRefuerzo: "This option boosts bass by more than 6 dB: it can damage a speaker that cannot take it. Turn the volume down. Continue?",
    pideDesaconsejada: (m) => `Not recommended: ${m}. Continue anyway?`,
    cargada: "Loaded into the ESP32 (not saved).", guardada: "Saved to the ESP32.", quitada: "No correction (not saved).",
    fallo: "The ESP32 rejected the change.", noResponde: "The ESP32 does not answer as TuneAmp32.",
    ocupado: "The port cannot be opened: close it in the panel, PowerShell or the serial monitor.",
    caido: "Connection to the ESP32 was lost.", reiniciado: "The ESP32 restarted: unsaved settings were lost.",
    noSerie: "This browser has no Web Serial. Use Chrome or Edge on a computer.",
    cancelar: "Cancel", continuar: "Continue", frec: "Frequency",
  },
};
let idioma = "es";
try { idioma = localStorage.getItem("idioma") ?? (navigator.language.startsWith("es") ? "es" : "en"); } catch { /* da igual */ }
if (!T[idioma]) idioma = "es";
const t = (k, ...x) => { const v = T[idioma][k]; return typeof v === "function" ? v(...x) : v; };
const fmt = (x, d = 1) => x.toLocaleString(idioma, { minimumFractionDigits: d, maximumFractionDigits: d });
const igual = (a, b) => !!a && !!b && comandosEntre(a, b).length === 0;

// ------------------------------------------------------------------ estado
const E = { paso: 1, datos: null, elegida: 0, verif: null, enPlaca: null, probada: null };
const serie = new Serie({
  alRecibir: (l) => { if (E.enPlaca && l.startsWith("TuneAmp32 - ")) { E.enPlaca = null; E.probada = null; avisar(t("reiniciado")); pintar(); } },
  alCerrar: () => { E.enPlaca = null; pintar(); },
});

// Lo que se recuerda entre visitas (comodidad; si falla, no pasa nada)
function recordar() {
  try { localStorage.setItem("asistente", JSON.stringify({ nombre: $("nombre").value, canal: $("canal").value, tamano: $("tamano").value, dbfs: $("dbfs")?.value })); } catch { /* da igual */ }
}
function recuperar() {
  try {
    const r = JSON.parse(localStorage.getItem("asistente") ?? "{}");
    if (r.nombre) $("nombre").value = r.nombre;
    if (r.canal) $("canal").value = r.canal;
    if (r.tamano) $("tamano").value = r.tamano;
    if (r.dbfs) $("dbfs").value = r.dbfs;
  } catch { /* da igual */ }
}

function avisar(x) { $("aviso").textContent = x ?? ""; $("aviso").hidden = !x; }

let responder = null;
function preguntar(texto) {
  return new Promise((resolver) => {
    const d = $("dialogo");
    $("pregunta").textContent = texto;
    responder = (si) => { responder = null; if (d.open) d.close(); resolver(si); };
    d.showModal();
  });
}
$("si").onclick = () => responder?.(true);
$("no").onclick = () => responder?.(false);
$("dialogo").oncancel = (e) => { e.preventDefault(); responder?.(false); };

// ------------------------------------------------------------------ nombres y comandos
function base() {
  const n = $("nombre").value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "altavoz";
  return `${n}_${$("canal").value}`;
}
const fmin = () => +$("tamano").value;
function dbfs() { const v = Math.round(+$("dbfs").value); return Number.isFinite(v) ? Math.min(-6, Math.max(-60, v)) : -30; }
function comandos() {
  const c = `--canal ${$("canal").value} --dbfs ${dbfs()} --fmin ${fmin()}`;
  $("cmdNivel").textContent = `python medidas\\medir.py --usb --nivel ${c}`;
  $("cmdMedir").textContent = `python medidas\\medir.py --usb --nombre ${base()} ${c}`;
  $("cmdVerificar").textContent = `python medidas\\medir.py --usb --nombre ${base()}_verif ${c}`;
  $("dondeWav").textContent = t("dondeWav", base());
  $("dondeWav5").textContent = t("dondeWav", base() + "_verif");
}
for (const b of document.querySelectorAll(".copia")) {
  b.onclick = async () => {
    try { await navigator.clipboard.writeText($(b.dataset.de).textContent); b.textContent = t("copiado"); setTimeout(() => { b.textContent = t("copiar"); }, 1500); }
    catch { /* el usuario puede seleccionarlo a mano */ }
  };
}

// ------------------------------------------------------------------ placa
async function conectar() {
  avisar();
  if (serie.abierto) return true;
  try {
    const conocidos = await Serie.conocidos();
    await serie.abrir(conocidos.length === 1 ? conocidos[0] : null);
  } catch (e) { if (e.name !== "NotFoundError") avisar(t("ocupado")); return false; }
  try {
    const ver = () => serie.orden("ver", (l) => leerAjustes(l) !== null);
    E.enPlaca = leerAjustes(await ver().catch(ver));
    return true;
  } catch { await serie.cerrar(); avisar(t("noResponde")); return false; }
}

async function enviar(destino) {
  try {
    for (const orden of comandosEntre(E.enPlaca, destino)) {
      const r = leerAjustes(await serie.orden(orden));
      if (!r) throw new Error("respuesta");
      E.enPlaca = r;
    }
    return igual(E.enPlaca, destino);
  } catch {
    try { E.enPlaca = leerAjustes(await serie.orden("ver", (l) => leerAjustes(l) !== null)); } catch { /* da igual */ }
    return false;
  }
}

async function soltar() { if (serie.abierto) { await serie.cerrar(); } }

$("conectar").onclick = async () => {
  if (!await conectar()) return pintar();
  $("estadoPlaca2").textContent = await enviar(FABRICA) ? "✓ " + t("listo2") : "⚠ " + t("fallo");
  pintar();
};

function ajustesElegidos() {
  const a = E.datos.opciones[E.elegida].ajustes, p = {};
  for (const k of Object.keys(FABRICA)) p[k] = a[k];
  return p;
}

for (const n of [4, 6]) $("reconectar" + n).onclick = async () => { await conectar(); pintar(); };

$("probar").onclick = async () => {
  if (!await conectar()) return pintar();
  const o = E.datos.opciones[E.elegida];
  if (o.desaconsejada.length && !await preguntar(t("pideDesaconsejada", o.desaconsejada.join("; ")))) return;
  if (o.ajustes.grave_db > REFUERZO_AVISO && !(E.enPlaca?.grave_db > REFUERZO_AVISO) && !await preguntar(t("pideRefuerzo"))) return;
  const ok = await enviar(ajustesElegidos());
  E.probada = ok ? E.elegida : null;
  $("estadoPlaca4").textContent = ok ? "✓ " + t("cargada") : "⚠ " + t("fallo");
  pintar();
};
$("quitar").onclick = async () => {
  if (!await conectar()) return pintar();
  const ok = await enviar(FABRICA);
  E.probada = null;
  $("estadoPlaca4").textContent = ok ? "✓ " + t("quitada") : "⚠ " + t("fallo");
  pintar();
};
$("guardar").onclick = async () => {
  if (!await conectar()) return pintar();
  if (!await enviar(ajustesElegidos())) { $("estadoPlaca6").textContent = "⚠ " + t("fallo"); return; }
  try { await serie.orden("guardar", (l) => l === "ok guardado"); $("estadoPlaca6").textContent = "✓ " + t("guardada"); }
  catch { $("estadoPlaca6").textContent = "⚠ " + t("fallo"); }
  pintar();
};
$("bajar").onclick = () => {
  const o = E.datos.opciones[E.elegida];
  const perfil = JSON.parse(escribirPerfil(`${$("nombre").value} (${t($("canal").value === "I" ? "izquierdo" : "derecho")}) — ${o.nombre}`, ajustesElegidos()));
  perfil.curva = { f: E.datos.f, db: E.datos.curva };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(perfil, null, 2) + "\n"], { type: "application/json" }));
  a.download = `${base()}_perfil.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// ------------------------------------------------------------------ análisis (Pyodide)
let trabajador = null, pendiente = null, salida = null;
function analizar(wav, f_min) {
  if (!trabajador) {
    trabajador = new Worker("../analizar/trabajador.js");
    trabajador.onmessage = (e) => {
      const m = e.data;
      if (m.tipo === "estado") { if (salida) $(salida).textContent = t(m.clave); return; }
      const p = pendiente; pendiente = null;
      if (m.tipo === "resultado") p?.bien(m); else p?.mal(new Error(m.mensaje));
    };
    trabajador.onerror = (e) => { const p = pendiente; pendiente = null; p?.mal(new Error(e.message)); };
  }
  return new Promise((bien, mal) => { pendiente = { bien, mal }; trabajador.postMessage({ id: 1, wav, f_min }, [wav]); });
}

async function cargarWav(entrada, estado, alTerminar) {
  const f = $(entrada).files[0];
  if (!f) return;
  avisar();
  salida = estado;
  $(entrada).disabled = true;
  try {
    const m = await analizar(await f.arrayBuffer(), fmin());
    $(estado).textContent = t("hecho", fmt(m.ms / 1000, 1));
    alTerminar(m.datos);
  } catch (e) {
    $(estado).textContent = "";
    avisar(`${t("malWav")}: ${e.message}`);
  } finally {
    $(entrada).disabled = false;
    pintar();
  }
}
$("wav").onchange = () => cargarWav("wav", "estado", (d) => {
  E.datos = d; E.verif = null; E.probada = null;
  E.elegida = Math.max(0, d.opciones.findIndex((o) => o.recomendada));
});
$("wav5").onchange = () => cargarWav("wav5", "estado5", (d) => { E.verif = d; });

// Diferencia media entre la verificación y lo previsto, en la zona fiable
function comparar() {
  const o = E.datos.opciones[E.elegida], F = E.datos.f, a = E.verif.curva, p = o.prevista;
  const dif = a.map((v, i) => v - p[i]);
  const ref = dif.filter((_, i) => F[i] >= 250 && F[i] <= 600).sort((x, y) => x - y);
  const med = ref[Math.floor(ref.length / 2)] ?? 0;
  const lo = Math.max(70, fmin() * 1.3, o.ajustes.pasoalto * 1.3);
  const zona = dif.map((v, i) => [F[i], Math.abs(v - med)]).filter(([f]) => f >= lo && f <= 600);
  return { error: zona.reduce((s, [, v]) => s + v, 0) / Math.max(zona.length, 1), desplaz: med };
}

// ------------------------------------------------------------------ gráfica
function grafica(svgId, leyendaId, F, curvas, fminGris) {
  const svg = $(svgId), W = svg.clientWidth || 800, H = svg.clientHeight || 340;
  const M = { i: 40, d: 12, a: 10, b: 34 }, Y = [-35, 12];
  const x = (f) => M.i + (W - M.i - M.d) * Math.log(f / 20) / Math.log(100);
  const y = (v) => M.a + (H - M.a - M.b) * (Y[1] - Math.min(Y[1], Math.max(Y[0], v))) / (Y[1] - Y[0]);
  let s = "";
  if (fminGris > 20) s += `<rect x="${x(20)}" y="${M.a}" width="${x(fminGris) - x(20)}" height="${H - M.a - M.b}" fill="var(--malla)" opacity=".6"/>`;
  s += `<rect x="${x(1000)}" y="${M.a}" width="${x(2000) - x(1000)}" height="${H - M.a - M.b}" fill="var(--malla)" opacity=".6"/>`;
  const marcas = W < 520 ? [20, 50, 100, 200, 500, 1000, 2000] : [20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 2000];
  for (const f of marcas) {
    s += `<line x1="${x(f)}" x2="${x(f)}" y1="${M.a}" y2="${H - M.b}" stroke="var(--malla)"/>`;
    s += `<text x="${x(f)}" y="${H - M.b + 16}" text-anchor="${f === 2000 ? "end" : "middle"}">${f >= 1000 ? f / 1000 + "k" : f}</text>`;
  }
  for (let v = -30; v <= 10; v += 10) {
    s += `<line x1="${M.i}" x2="${W - M.d}" y1="${y(v)}" y2="${y(v)}" stroke="var(${v === 0 ? "--eje" : "--malla"})"/>`;
    s += `<text x="${M.i - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  s += `<text x="${(W + M.i) / 2}" y="${H - 3}" text-anchor="middle">Hz</text><text x="4" y="${M.a + 4}">dB</text>`;
  for (const c of curvas) {
    const pts = F.map((f, i) => `${x(f).toFixed(1)},${y(c.v[i]).toFixed(1)}`).join(" ");
    s += `<polyline points="${pts}" fill="none" stroke="var(${c.c})" stroke-width="2" stroke-linejoin="round"${c.raya ? ' stroke-dasharray="6 4"' : ""}/>`;
  }
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("aria-label", curvas.map((c) => t(c.k)).join(", "));
  svg.innerHTML = s;
  $(leyendaId).innerHTML = curvas.map((c) => `<span><i class="${c.raya ? "raya" : ""}" style="border-color:var(${c.c})"></i>${t(c.k)}</span>`).join("");
}

// ------------------------------------------------------------------ pasos
function falta() {
  switch (E.paso) {
    case 1: return $("nombre").value.trim() && [...document.querySelectorAll(".hecho")].every((c) => c.checked) ? null : t("falta1");
    case 2: return igual(E.enPlaca, FABRICA) ? null : t("falta2");
    case 3: return E.datos ? null : t("falta3");
    case 4: return E.probada === E.elegida && igual(E.enPlaca, ajustesElegidos()) ? null : t("falta4");
    case 5: return E.verif ? null : t("falta5");
    default: return null;
  }
}

$("siguiente").onclick = async () => {
  if (falta()) return;
  if (E.paso === N_PASOS) { location.reload(); return; }
  // Al ir a medir, se suelta el puerto para el programa de medida
  if (E.paso === 2 || E.paso === 4) await soltar();
  E.paso++;
  avisar();
  pintar();
  window.scrollTo(0, 0);
};
$("atras").onclick = () => { if (E.paso > 1) { E.paso--; avisar(); pintar(); window.scrollTo(0, 0); } };
for (const id of ["nombre", "canal", "tamano"]) $(id).addEventListener("input", () => { recordar(); comandos(); pintar(); });
for (const c of document.querySelectorAll(".hecho")) c.onchange = () => pintar();

function pintarDiagnostico() {
  const d = E.datos.diagnostico;
  let r = d.joroba ? t("hayJoroba", fmt(d.joroba.f, 0), fmt(d.joroba.db)) : t("noJoroba");
  if (d.f3) r += t("graveHasta", fmt(d.f3, 0));
  if (E.datos.nada) r += " " + t("nada");
  $("resumen").textContent = r;
  const lista = $("avisos");
  lista.replaceChildren();
  const avisos = E.datos.avisos;
  if (!avisos.length) { const li = document.createElement("li"); li.className = "bien"; li.textContent = t("sinAvisos"); lista.append(li); }
  for (const a of avisos) { const li = document.createElement("li"); li.textContent = a; lista.append(li); }
  if (avisos.length && idioma !== "es") { const li = document.createElement("li"); li.className = "bien"; li.textContent = t("avisosEs"); lista.append(li); }
  const hz = (x) => x == null ? t("noCae") : `${fmt(x, 0)} Hz`;
  $("diagnostico").innerHTML = "";
  for (const [k, v] of [["resonancia", hz(d.fc)], ["joroba", d.joroba ? `+${fmt(d.joroba.db)} dB · ${fmt(d.joroba.f, 0)} Hz` : t("sinJoroba")],
    ["f3", hz(d.f3)], ["ruido", `${fmt(E.datos.snr_db, 0)} dB`], ["rebotes", `${fmt(E.datos.rebotes_db, 0)} dB`]]) {
    const dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = t(k); dd.textContent = v;
    $("diagnostico").append(dt, dd);
  }
  const caja = $("opciones");
  caja.replaceChildren();
  E.datos.opciones.forEach((o, i) => {
    const b = document.createElement("button");
    b.className = "opcion"; b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(i === E.elegida));
    const nombre = o.refuerzo_db === 0 ? (idioma === "es" ? o.nombre : "Remove the hump only") : (idioma === "es" ? o.nombre : `Bass +${o.refuerzo_db} dB`);
    const linea = (txt, cls) => { const s = document.createElement("span"); if (cls) s.className = cls; s.textContent = txt; b.append(s); };
    const n = document.createElement("b"); n.textContent = nombre; b.append(n);
    if (o.recomendada) linea(t("recomendada"), "gris");
    linea(`${t("f3prevista")}: ${o.f3_prevista == null ? "—" : fmt(o.f3_prevista, 0) + " Hz"}`);
    linea(`${t("jorobaQueda")}: ${o.joroba_prevista_db == null ? "—" : fmt(o.joroba_prevista_db) + " dB"}`);
    linea(`${t("grave")}: +${fmt(o.refuerzo_max_db)} dB (${t("potencia", fmt(o.potencia_x))})`);
    for (const m of o.desaconsejada) linea(`⚠ ${t("noRecomendable")}: ${m}`, "mal");
    b.onclick = () => { E.elegida = i; pintar(); };
    caja.append(b);
  });
  const o = E.datos.opciones[E.elegida];
  grafica("grafico4", "leyenda4", E.datos.f, [{ k: "medida", c: "--s1", v: E.datos.curva }, { k: "prevista", c: "--s2", v: o.prevista },
    { k: "correccion", c: "--s3", v: o.correccion, raya: true }], fmin());
}

function pintarVerificacion() {
  $("verificacion").hidden = !E.verif;
  if (!E.verif) return;
  const { error, desplaz } = comparar();
  const e = fmt(error);
  $("veredicto").textContent = error < 1 ? t("verBien", e) : error < 2 ? t("verRegular", e) : t("verMal", e);
  const o = E.datos.opciones[E.elegida];
  grafica("grafico5", "leyenda5", E.datos.f, [{ k: "antes", c: "--s1", v: E.datos.curva },
    { k: "prevista", c: "--s2", v: o.prevista, raya: true }, { k: "despues", c: "--s3", v: E.verif.curva.map((v) => v - desplaz) }], fmin());
}

function pintar() {
  const nombres = t("nPasos");
  $("pasos").innerHTML = nombres.map((n, i) => `<li class="${i + 1 === E.paso ? "actual" : i + 1 < E.paso ? "hecho" : ""}"${i + 1 === E.paso ? ' aria-current="step"' : ""}><b>${i + 1}</b>${n}</li>`).join("");
  for (const s of document.querySelectorAll(".paso")) s.hidden = +s.dataset.paso !== E.paso;
  const si = serie.abierto && !!E.enPlaca;
  $("conexion").className = "chip" + (si ? " si" : "");
  $("conexion").textContent = t(si ? "conectado" : "sin");
  for (const id of ["conectar", "probar", "quitar", "guardar", "reconectar4", "reconectar6"]) $(id).disabled = !Serie.disponible();
  $("reconectar4").hidden = $("reconectar6").hidden = si;
  if (E.datos && E.paso >= 4) pintarDiagnostico();
  if (E.paso === 5) pintarVerificacion();
  const f = falta();
  $("falta").textContent = f ?? "";
  $("siguiente").disabled = !!f;
  $("siguiente").textContent = t(E.paso === N_PASOS ? "fin" : "siguiente");
  $("atras").disabled = E.paso === 1;
}

function traducir() {
  document.documentElement.lang = idioma;
  for (const e of document.querySelectorAll("[data-t]")) e.textContent = t(e.dataset.t);
  $("idioma").textContent = t("otro");
  if (!Serie.disponible()) avisar(t("noSerie"));
  comandos();
  pintar();
}
$("idioma").onclick = () => {
  idioma = idioma === "es" ? "en" : "es";
  try { localStorage.setItem("idioma", idioma); } catch { /* da igual */ }
  traducir();
};
let ancho = 0;
new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w !== ancho) { ancho = w; pintar(); } }).observe(document.querySelector("main"));

// Campo de nivel: se crea aquí para tenerlo junto a su explicación
const campoNivel = document.createElement("label");
campoNivel.className = "campo";
campoNivel.innerHTML = `<span data-t="nivel"></span><span class="fila"><input type="number" id="dbfs" value="-30" min="-60" max="-6" step="1"> dBFS</span>`;
$("cmdNivel").parentElement.after(campoNivel);
$("dbfs").addEventListener("input", () => { recordar(); comandos(); });
recuperar();
traducir();
