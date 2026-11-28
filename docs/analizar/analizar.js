import { FABRICA, comandosEntre, leerAjustes, escribirPerfil } from "../panel/dsp.js";
import { Serie } from "../panel/serie.js";

const $ = (id) => document.getElementById(id);
const REFUERZO_AVISO = 6;

// ------------------------------------------------------------------ textos
const T = {
  es: {
    titulo: "· Analizar", otro: "English", panel: "Panel", ayuda: "Cómo funciona",
    conectar: "Conectar", desconectar: "Desconectar", conectado: "Conectado", sin: "Sin conectar",
    paso1: "1. Carga una medida", archivo: "Grabación (WAV)", fmin: "Frecuencia mínima de la medida",
    explica1: "Mide el altavoz con el micro a 1 cm del centro del cono. De momento la medida se hace desde el PC, con la placa conectada por USB:",
    explicaFmin: "La que usaste con --fmin al medir por USB. Si mediste por Bluetooth o con el móvil (las señales de 16 Hz), pon 0.",
    cargandoPython: "Preparando Python en el navegador (la primera vez descarga unos 15 MB)…",
    cargandoNumpy: "Cargando numpy…", analizando: "Analizando (unos segundos)…",
    hecho: (s) => `Analizada en ${s} s.`, malWav: "No se ha podido analizar", sinWorker: "Este navegador no puede ejecutar el análisis.",
    paso2: "2. Diagnóstico", resonancia: "Resonancia", joroba: "Joroba", f3: "F3 (grave −3 dB)", ruido: "Señal/ruido",
    rebotes: "Rebotes de la sala", sinJoroba: "No hay", noCae: "Más abajo de lo medido",
    nada: "No hace falta corregir: el altavoz ya es plano en la zona medida.", sinAvisos: "La medida parece correcta.",
    avisosEs: "Los avisos del análisis están en español.",
    paso3: "3. Elige una corrección", recomendada: "★ Recomendada", f3prevista: "F3 prevista", jorobaQueda: "Joroba que queda",
    grave: "Refuerzo del grave", potencia: (x) => `×${x} de potencia`, noRecomendable: "No recomendable",
    medida: "Medida", prevista: "Prevista", correccion: "Corrección", frec: "Frecuencia", tabla: "Ver como tabla",
    notaGrafica: "Niveles relativos (0 dB = zona plana). En gris, lo que la medida no cubre. La medida en campo cercano vale hasta unos 1000 Hz.",
    paso4: "4. Pruébala en el altavoz",
    explica4: "Baja el volumen antes de probar. «Probar» la carga en el ESP32 sin guardarla: si lo apagas, vuelve a lo anterior. Después, vuelve a medir para verificar.",
    probar: "Probar en el altavoz", guardar: "Guardar en el ESP32", quitar: "Quitar la corrección", bajar: "Descargar perfil",
    comandos: "Comandos para el puerto serie", cancelar: "Cancelar", continuar: "Continuar",
    pideRefuerzo: "Esta opción refuerza el grave más de 6 dB: puede dañar un altavoz que no lo aguante. Baja el volumen. ¿Continuar?",
    pideDesaconsejada: (m) => `Opción no recomendable: ${m}. ¿Continuar de todos modos?`,
    conecta: "Conecta antes el ESP32 (botón Conectar).", cargada: "Cargada en el ESP32 (sin guardar).", guardada: "Guardada en el ESP32.",
    quitada: "Corrección quitada (sin guardar).", fallo: "El ESP32 no ha aceptado el cambio.", noResponde: "El ESP32 no responde como TuneAmp32.",
    ocupado: "No se puede abrir el puerto. Cierra el panel o el monitor serie que lo use.", caido: "Se ha perdido la conexión con el ESP32.",
    noSerie: "Este navegador no tiene Web Serial: puedes analizar, pero para probar en el altavoz usa Chrome o Edge en un ordenador.",
  },
  en: {
    titulo: "· Analyze", otro: "Español", panel: "Panel", ayuda: "How it works",
    conectar: "Connect", desconectar: "Disconnect", conectado: "Connected", sin: "Not connected",
    paso1: "1. Load a measurement", archivo: "Recording (WAV)", fmin: "Lowest frequency of the measurement",
    explica1: "Measure the speaker with the mic 1 cm from the centre of the cone. For now the measurement is made from the PC, with the board on USB:",
    explicaFmin: "The one you used with --fmin when measuring over USB. If you measured over Bluetooth or with a phone (the 16 Hz signals), enter 0.",
    cargandoPython: "Preparing Python in the browser (about 15 MB the first time)…",
    cargandoNumpy: "Loading numpy…", analizando: "Analyzing (a few seconds)…",
    hecho: (s) => `Analyzed in ${s} s.`, malWav: "Could not analyze", sinWorker: "This browser cannot run the analysis.",
    paso2: "2. Diagnosis", resonancia: "Resonance", joroba: "Hump", f3: "F3 (bass −3 dB)", ruido: "Signal/noise",
    rebotes: "Room reflections", sinJoroba: "None", noCae: "Below the measured range",
    nada: "No correction needed: the speaker is already flat in the measured range.", sinAvisos: "The measurement looks right.",
    avisosEs: "Analysis warnings are in Spanish.",
    paso3: "3. Choose a correction", recomendada: "★ Recommended", f3prevista: "Predicted F3", jorobaQueda: "Remaining hump",
    grave: "Bass boost", potencia: (x) => `×${x} power`, noRecomendable: "Not recommended",
    medida: "Measured", prevista: "Predicted", correccion: "Correction", frec: "Frequency", tabla: "View as table",
    notaGrafica: "Relative levels (0 dB = flat region). Grey: not covered by the measurement. Near-field measurement is valid up to about 1000 Hz.",
    paso4: "4. Try it on the speaker",
    explica4: "Turn the volume down first. «Try» loads it into the ESP32 without saving: powering off restores the previous settings. Then measure again to verify.",
    probar: "Try on the speaker", guardar: "Save to ESP32", quitar: "Remove correction", bajar: "Download profile",
    comandos: "Serial commands", cancelar: "Cancel", continuar: "Continue",
    pideRefuerzo: "This option boosts bass by more than 6 dB: it can damage a speaker that cannot take it. Turn the volume down. Continue?",
    pideDesaconsejada: (m) => `Not recommended: ${m}. Continue anyway?`,
    conecta: "Connect the ESP32 first (Connect button).", cargada: "Loaded into the ESP32 (not saved).", guardada: "Saved to the ESP32.",
    quitada: "Correction removed (not saved).", fallo: "The ESP32 rejected the change.", noResponde: "The ESP32 does not answer as TuneAmp32.",
    ocupado: "The port cannot be opened. Close the panel or serial monitor using it.", caido: "Connection to the ESP32 was lost.",
    noSerie: "This browser has no Web Serial: you can analyze, but to try it on the speaker use Chrome or Edge on a computer.",
  },
};
let idioma = "es";
try { idioma = localStorage.getItem("idioma") ?? (navigator.language.startsWith("es") ? "es" : "en"); } catch { /* da igual */ }
if (!T[idioma]) idioma = "es";
const t = (k, ...x) => { const v = T[idioma][k]; return typeof v === "function" ? v(...x) : v; };
const fmt = (x, d = 1) => x.toLocaleString(idioma, { minimumFractionDigits: d, maximumFractionDigits: d });

// ------------------------------------------------------------------ estado
let datos = null, elegida = 0, nombreWav = "", enPlaca = null;
let trabajador = null, pendiente = null;

const serie = new Serie({
  alRecibir: (l) => { if (enPlaca && l.startsWith("TuneAmp32 - ")) enPlaca = null; },
  alCerrar: () => { if (enPlaca) avisar(t("caido")); enPlaca = null; pintarConexion(); },
});

function avisar(x) { $("aviso").textContent = x ?? ""; $("aviso").hidden = !x; }

// Pregunta con el cuadro de diálogo. Responden los botones (o Escape = no);
// no se usa el evento «close», que algunos navegadores retrasan.
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

// ------------------------------------------------------------------ análisis
function analizar(wav, f_min) {
  if (!trabajador) {
    trabajador = new Worker("trabajador.js");
    trabajador.onmessage = (e) => {
      const m = e.data;
      if (m.tipo === "estado") { $("estado").textContent = t(m.clave); return; }
      const p = pendiente;
      pendiente = null;
      if (m.tipo === "resultado") p?.bien(m); else p?.mal(new Error(m.mensaje));
    };
    trabajador.onerror = (e) => { const p = pendiente; pendiente = null; p?.mal(new Error(e.message || t("sinWorker"))); };
  }
  return new Promise((bien, mal) => {
    pendiente = { bien, mal };
    trabajador.postMessage({ id: 1, wav, f_min }, [wav]);
  });
}

async function cargar() {
  const f = $("wav").files[0];
  if (!f) return;
  const f_min = Math.min(200, Math.max(0, +$("fmin").value || 0));
  avisar();
  $("wav").disabled = $("fmin").disabled = true;
  try {
    const m = await analizar(await f.arrayBuffer(), f_min);
    datos = m.datos;
    nombreWav = f.name.replace(/\.wav$/i, "");
    elegida = Math.max(0, datos.opciones.findIndex((o) => o.recomendada));
    $("estado").textContent = t("hecho", fmt(m.ms / 1000, 1));
    $("resultado").hidden = false;
    pintar();
  } catch (e) {
    $("estado").textContent = "";
    avisar(`${t("malWav")}: ${e.message}`);
  } finally {
    $("wav").disabled = $("fmin").disabled = false;
  }
}
$("wav").onchange = cargar;
$("fmin").onchange = () => { if ($("wav").files[0]) cargar(); };

// ------------------------------------------------------------------ pintar
function pintar() {
  if (!datos) return;
  const d = datos.diagnostico;
  const hz = (x) => x == null ? t("noCae") : `${fmt(x, 0)} Hz`;
  $("diagnostico").innerHTML = "";
  for (const [k, v] of [
    ["resonancia", hz(d.fc)],
    ["joroba", d.joroba ? `+${fmt(d.joroba.db)} dB · ${fmt(d.joroba.f, 0)} Hz` : t("sinJoroba")],
    ["f3", hz(d.f3)],
    ["ruido", `${fmt(datos.snr_db, 0)} dB`],
    ["rebotes", `${fmt(datos.rebotes_db, 0)} dB`],
  ]) {
    const dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = t(k); dd.textContent = v;
    $("diagnostico").append(dt, dd);
  }
  const lista = $("avisos");
  lista.replaceChildren();
  const avisos = [...datos.avisos];
  if (datos.nada) avisos.unshift(t("nada"));
  if (!avisos.length) {
    const li = document.createElement("li"); li.className = "bien"; li.textContent = t("sinAvisos"); lista.append(li);
  }
  for (const a of avisos) { const li = document.createElement("li"); li.textContent = a; lista.append(li); }
  if (datos.avisos.length && idioma !== "es") { const li = document.createElement("li"); li.className = "bien"; li.textContent = t("avisosEs"); lista.append(li); }

  const caja = $("opciones");
  caja.replaceChildren();
  datos.opciones.forEach((o, i) => {
    const b = document.createElement("button");
    b.className = "opcion"; b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(i === elegida));
    const nombre = o.refuerzo_db === 0 ? (idioma === "es" ? o.nombre : "Remove the hump only") : (idioma === "es" ? o.nombre : `Bass +${o.refuerzo_db} dB`);
    const a = o.ajustes;
    b.innerHTML = `<b></b><span class="gris"></span><span></span><span></span><span></span><span class="gris"></span>`;
    const [n, rec, f3, jq, gr, aj] = b.children;
    n.textContent = nombre;
    rec.textContent = o.recomendada ? t("recomendada") : "";
    f3.textContent = `${t("f3prevista")}: ${o.f3_prevista == null ? "—" : fmt(o.f3_prevista, 0) + " Hz"}`;
    jq.textContent = `${t("jorobaQueda")}: ${o.joroba_prevista_db == null ? "—" : fmt(o.joroba_prevista_db) + " dB"}`;
    gr.textContent = `${t("grave")}: +${fmt(o.refuerzo_max_db)} dB (${t("potencia", fmt(o.potencia_x))})`;
    aj.textContent = `${fmt(a.ganancia, 0)} dB · HP ${fmt(a.pasoalto, 0)} Hz`;
    for (const m of o.desaconsejada) {
      const s = document.createElement("span"); s.className = "mal"; s.textContent = `⚠ ${t("noRecomendable")}: ${m}`; b.append(s);
    }
    b.onclick = () => { elegida = i; pintar(); };
    caja.append(b);
  });
  dibujar();
  $("comandos").textContent = comandosEntre(null, ajustes()).join("\n");
  pintarConexion();
}

function ajustes() {
  const a = datos.opciones[elegida].ajustes, p = {};
  for (const k of Object.keys(FABRICA)) p[k] = a[k];
  return p;
}

// ------------------------------------------------------------------ gráfico
let curvas = [], escala = null, cursor = null;

function dibujar() {
  const o = datos.opciones[elegida], F = datos.f;
  curvas = [{ k: "medida", c: "--s1", v: datos.curva }, { k: "prevista", c: "--s2", v: o.prevista },
            { k: "correccion", c: "--s3", v: o.correccion, raya: true }];
  const svg = $("grafico"), W = svg.clientWidth || 800, H = svg.clientHeight || 360;
  const M = { i: 40, d: 12, a: 10, b: 34 }, Y = [-35, 12];
  const x = (f) => M.i + (W - M.i - M.d) * Math.log(f / 20) / Math.log(100);
  const y = (v) => M.a + (H - M.a - M.b) * (Y[1] - Math.min(Y[1], Math.max(Y[0], v))) / (Y[1] - Y[0]);
  escala = { x, y, M, W, H };
  let s = "";
  const fmin = datos.diagnostico.f_min;
  if (fmin > 20) s += `<rect x="${x(20)}" y="${M.a}" width="${x(fmin) - x(20)}" height="${H - M.a - M.b}" fill="var(--malla)" opacity=".6"/>`;
  if (datos.f_max < 2000) s += `<rect x="${x(datos.f_max)}" y="${M.a}" width="${x(2000) - x(datos.f_max)}" height="${H - M.a - M.b}" fill="var(--malla)" opacity=".6"/>`;
  const marcas = W < 520 ? [20, 50, 100, 200, 500, 1000, 2000] : [20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000];
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
  s += `<g id="cursor"></g>`;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("aria-label", t("paso3"));
  svg.innerHTML = s;
  $("leyenda").innerHTML = curvas.map((c) => `<span><i class="${c.raya ? "raya" : ""}" style="border-color:var(${c.c})"></i>${t(c.k)}</span>`).join("");
  $("tabla").innerHTML = `<tr><th>${t("frec")}</th>${curvas.map((c) => `<th>${t(c.k)} (dB)</th>`).join("")}</tr>` +
    [30, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 800, 1000].map((f) => {
      const i = F.findIndex((z) => z >= f * 0.995);
      return `<tr><td>${f} Hz</td>${curvas.map((c) => `<td>${fmt(c.v[i])}</td>`).join("")}</tr>`;
    }).join("");
  if (cursor !== null) mostrarCursor(cursor);
}

function mostrarCursor(i) {
  cursor = i;
  const { x, y, M, W, H } = escala, F = datos.f, X = x(F[i]);
  $("cursor").innerHTML = `<line x1="${X}" x2="${X}" y1="${M.a}" y2="${H - M.b}" stroke="var(--suave)"/>` +
    curvas.map((c) => `<circle cx="${X}" cy="${y(c.v[i])}" r="4" fill="var(${c.c})" stroke="var(--sup)" stroke-width="2"/>`).join("");
  const g = $("globo");
  g.hidden = false;
  g.innerHTML = `<b>${fmt(F[i], 0)} Hz</b>` + curvas.map((c) => `<br><i style="background:var(${c.c})"></i>${t(c.k)} <b>${fmt(c.v[i])} dB</b>`).join("");
  g.style.top = "12px";
  g.style.left = (X + 14 + g.offsetWidth > W ? X - 14 - g.offsetWidth : X + 14) + "px";
}
$("grafico").onpointermove = (e) => {
  if (!datos) return;
  const { M, W } = escala, r = $("grafico").getBoundingClientRect();
  const k = Math.min(1, Math.max(0, (e.clientX - r.left - M.i) / (W - M.i - M.d)));
  mostrarCursor(Math.min(datos.f.length - 1, Math.round(48 * Math.log2(100) * k)));
};
$("grafico").onpointerleave = $("grafico").onblur = () => { cursor = null; $("globo").hidden = true; const c = $("cursor"); if (c) c.innerHTML = ""; };
$("grafico").onkeydown = (e) => {
  const d = { ArrowRight: 4, ArrowLeft: -4 }[e.key];
  if (!d || !datos) return;
  e.preventDefault();
  mostrarCursor(Math.min(datos.f.length - 1, Math.max(0, (cursor ?? 110) + d)));
};
new ResizeObserver(() => datos && dibujar()).observe($("marco"));

// ------------------------------------------------------------------ placa
function pintarConexion() {
  const si = serie.abierto && !!enPlaca;
  $("conexion").className = "chip" + (si ? " si" : "");
  $("conexion").textContent = t(si ? "conectado" : "sin");
  $("conectar").textContent = t(serie.abierto ? "desconectar" : "conectar");
  $("conectar").disabled = !Serie.disponible();
  for (const id of ["probar", "guardar", "quitar"]) $(id).disabled = !si;
}

$("conectar").onclick = async () => {
  if (serie.abierto) { enPlaca = null; await serie.cerrar(); return; }
  avisar();
  try { await serie.abrir(); } catch (e) { if (e.name !== "NotFoundError") avisar(t("ocupado")); return; }
  try {
    const ver = () => serie.orden("ver", (l) => leerAjustes(l) !== null);
    enPlaca = leerAjustes(await ver().catch(ver));
  } catch { await serie.cerrar(); avisar(t("noResponde")); }
  pintarConexion();
};

async function enviar(destino, mensaje) {
  if (!enPlaca) { $("estadoPlaca").textContent = t("conecta"); return false; }
  try {
    for (const orden of comandosEntre(enPlaca, destino)) {
      const r = leerAjustes(await serie.orden(orden));
      if (!r) throw new Error("respuesta");
      enPlaca = r;
    }
    if (comandosEntre(enPlaca, destino).length) throw new Error("distinto");
    $("estadoPlaca").textContent = "✓ " + t(mensaje);
    return true;
  } catch {
    $("estadoPlaca").textContent = "⚠ " + t("fallo");
    try { enPlaca = leerAjustes(await serie.orden("ver", (l) => leerAjustes(l) !== null)); } catch { /* da igual */ }
    return false;
  }
}

$("probar").onclick = async () => {
  const o = datos.opciones[elegida];
  if (o.desaconsejada.length && !await preguntar(t("pideDesaconsejada", o.desaconsejada.join("; ")))) return;
  if (o.ajustes.grave_db > REFUERZO_AVISO && !(enPlaca?.grave_db > REFUERZO_AVISO) && !await preguntar(t("pideRefuerzo"))) return;
  await enviar(ajustes(), "cargada");
};
$("guardar").onclick = async () => {
  if (!await enviar(ajustes(), "cargada")) return;
  try { await serie.orden("guardar", (l) => l === "ok guardado"); $("estadoPlaca").textContent = "✓ " + t("guardada"); }
  catch { $("estadoPlaca").textContent = "⚠ " + t("fallo"); }
};
$("quitar").onclick = () => enviar(FABRICA, "quitada");
$("bajar").onclick = () => {
  const o = datos.opciones[elegida];
  const nombre = `${nombreWav} — ${o.nombre}`;
  // El perfil lleva también la curva medida, para verla en el panel
  const perfil = JSON.parse(escribirPerfil(nombre, ajustes()));
  perfil.curva = { f: datos.f, db: datos.curva };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(perfil, null, 2) + "\n"], { type: "application/json" }));
  a.download = (nombreWav.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "perfil") + `_${o.refuerzo_db}db.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// ------------------------------------------------------------------ idioma
function traducir() {
  document.documentElement.lang = idioma;
  for (const e of document.querySelectorAll("[data-t]")) e.textContent = t(e.dataset.t);
  $("idioma").textContent = t("otro");
  if (!Serie.disponible()) avisar(t("noSerie"));
  pintarConexion();
  pintar();
}
$("idioma").onclick = () => {
  idioma = idioma === "es" ? "en" : "es";
  try { localStorage.setItem("idioma", idioma); } catch { /* da igual */ }
  traducir();
};
traducir();
