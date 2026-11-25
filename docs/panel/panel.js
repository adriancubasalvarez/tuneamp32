import { PARAMS, FABRICA, cadenaDb, comandosEntre, leerAjustes, leerEstado,
         leerPerfil, escribirPerfil } from "./dsp.js";
import { Serie } from "./serie.js";

const $ = (id) => document.getElementById(id);
const REFUERZO_AVISO = 6;                 // dB: por encima se pide confirmación

// ------------------------------------------------------------------ textos
const T = {
  es: {
    panel: "· Panel", otro: "English", conectar: "Conectar", desconectar: "Desconectar",
    conectado: "Conectado", sin: "Sin conectar", curva: "Curva de corrección",
    ejemplos: "Ejemplos", elige: "Elige un ejemplo…", verMedida: "Ver la medida del ejemplo", medida: "Medida", correccion: "Corrección", prevista: "Prevista",
    notaCurva: "Niveles relativos, sin la ganancia previa y con el refuerzo de grave completo. Los ejemplos son para ese altavoz concreto: en otro pueden sonar mal o dañarlo.",
    tabla: "Ver como tabla", frec: "Frecuencia", ePico: "Pico de salida", eGrave: "Grave reducido", eLim: "Limitador", eRec: "Recortes", eCarga: "Carga del DSP",
    g_general: "General", g_joroba: "Joroba (resonancia)", g_grave: "Refuerzo de grave", g_proteccion: "Protección",
    dsp: "Corrección activa", limitador: "Limitador y grave dinámico", ganancia: "Ganancia previa", pasoalto: "Paso alto (0 = quitado)",
    joroba_f: "Frecuencia", joroba_db: "Nivel", joroba_q: "Q (anchura)", grave_f: "Frecuencia", grave_db: "Nivel", grave_q: "Q (anchura)",
    gravesmax: "Grave máximo", techo: "Techo de salida",
    guardar: "Guardar en el ESP32", deshacer: "Deshacer cambios", fabrica: "Sin corrección (fábrica)", bajar: "Descargar perfil", subir: "Cargar perfil",
    registro: "Mensajes del ESP32", cancelar: "Cancelar", continuar: "Continuar", sinGuardar: "Cambios sin guardar", guardado: "Guardado en el ESP32",
    noSerie: "Este navegador no tiene Web Serial. Usa Chrome o Edge en un ordenador; aquí puedes ver curvas y perfiles.",
    noResponde: "El ESP32 no responde como TuneAmp32. Comprueba el firmware y que has elegido el puerto correcto.",
    ocupado: "No se puede abrir el puerto. Cierra el monitor serie u otro programa que lo use.",
    caido: "Se ha perdido la conexión con el ESP32.", reinicio: "El ESP32 se ha reiniciado: se han vuelto a leer sus ajustes.",
    fallo: "El ESP32 no ha aceptado el cambio; se muestran sus ajustes reales.", noGuardado: "No se ha podido guardar.",
    malPerfil: "El archivo no es un perfil válido de TuneAmp32", perfilOk: "Perfil cargado", nombrePerfil: "Nombre del perfil (altavoz):",
    pideRefuerzo: "Un refuerzo de grave de más de 6 dB puede dañar un altavoz que no lo aguante. ¿Continuar?",
    pideSin: "Esto quita el paso alto que protege el altavoz y puede sonar más fuerte. Baja el volumen antes. ¿Continuar?",
    pideLim: "Sin limitador se desactiva también la reducción automática del grave. ¿Continuar?",
    margenMal: (x) => `La corrección sube hasta ${x} dB por encima del máximo: el limitador actuará a volumen alto. Baja la ganancia previa.`,
    margenBien: (x) => `Margen: ${x} dB antes de llegar al máximo digital.`,
  },
  en: {
    panel: "· Panel", otro: "Español", conectar: "Connect", desconectar: "Disconnect",
    conectado: "Connected", sin: "Not connected", curva: "Correction curve",
    ejemplos: "Examples", elige: "Choose an example…", verMedida: "Show the example measurement", medida: "Measured", correccion: "Correction", prevista: "Predicted",
    notaCurva: "Relative levels, without pre-gain and with full bass boost. Examples are for that exact speaker: on another one they may sound bad or damage it.",
    tabla: "View as table", frec: "Frequency", ePico: "Output peak", eGrave: "Bass reduction", eLim: "Limiter", eRec: "Clipped samples", eCarga: "DSP load",
    g_general: "General", g_joroba: "Hump (resonance)", g_grave: "Bass boost", g_proteccion: "Protection",
    dsp: "Correction on", limitador: "Limiter and dynamic bass", ganancia: "Pre-gain", pasoalto: "High-pass (0 = off)",
    joroba_f: "Frequency", joroba_db: "Level", joroba_q: "Q (width)", grave_f: "Frequency", grave_db: "Level", grave_q: "Q (width)",
    gravesmax: "Bass maximum", techo: "Output ceiling",
    guardar: "Save to ESP32", deshacer: "Undo changes", fabrica: "No correction (factory)", bajar: "Download profile", subir: "Load profile",
    registro: "ESP32 messages", cancelar: "Cancel", continuar: "Continue", sinGuardar: "Unsaved changes", guardado: "Saved to ESP32",
    noSerie: "This browser has no Web Serial. Use Chrome or Edge on a computer; here you can still view curves and profiles.",
    noResponde: "The ESP32 does not answer as TuneAmp32. Check the firmware and the chosen port.",
    ocupado: "The port cannot be opened. Close the serial monitor or any program using it.",
    caido: "Connection to the ESP32 was lost.", reinicio: "The ESP32 restarted: its settings were read again.",
    fallo: "The ESP32 rejected the change; its real settings are shown.", noGuardado: "Could not save.",
    malPerfil: "Not a valid TuneAmp32 profile", perfilOk: "Profile loaded", nombrePerfil: "Profile name (speaker):",
    pideRefuerzo: "More than 6 dB of bass boost can damage a speaker that cannot take it. Continue?",
    pideSin: "This removes the high-pass that protects the speaker and may sound louder. Turn the volume down first. Continue?",
    pideLim: "Without the limiter, automatic bass reduction is off too. Continue?",
    margenMal: (x) => `The correction rises up to ${x} dB above full scale: the limiter will act at high volume. Lower the pre-gain.`,
    margenBien: (x) => `Headroom: ${x} dB before digital full scale.`,
  },
};
let idioma = "es";
try { idioma = localStorage.getItem("idioma") ?? (navigator.language.startsWith("es") ? "es" : "en"); } catch { /* sin almacenamiento */ }
if (!T[idioma]) idioma = "es";
const t = (k, ...x) => { const v = T[idioma][k]; return typeof v === "function" ? v(...x) : v; };
const fmt = (x, d = 1) => (Object.is(Math.round(x * 10 ** d), -0) ? 0 : x).toLocaleString(idioma, { minimumFractionDigits: d, maximumFractionDigits: d });

// ------------------------------------------------------------------ estado
let p = { ...FABRICA };                   // lo que se ve
let enPlaca = null;                       // lo último que ha confirmado el ESP32
let base = null;                          // a donde vuelve «Deshacer»
let medida = null;
let nombrePerfil = "";
let consulta = null, envio = null, sucio = false, enviando = null, releer = false;

const serie = new Serie({ alRecibir: recibir, alCerrar: cerrado });

function avisar(texto) { $("aviso").textContent = texto ?? ""; $("aviso").hidden = !texto; }

function preguntar(texto) {
  return new Promise((resolver) => {
    const d = $("dialogo");
    $("pregunta").textContent = texto;
    d.returnValue = "no";
    d.onclose = () => resolver(d.returnValue === "si");
    d.showModal();
  });
}
$("si").onclick = () => $("dialogo").close("si");
$("no").onclick = () => $("dialogo").close("no");

// Pregunta por todo lo arriesgado que hay al pasar de «de» a «a»
async function confirmar(de, a) {
  if (a.grave_db > REFUERZO_AVISO && !(de.grave_db > REFUERZO_AVISO) && !await preguntar(t("pideRefuerzo"))) return false;
  const protege = (x) => x.dsp && x.pasoalto > 0;
  if (protege(de) && !protege(a) && !await preguntar(t("pideSin"))) return false;
  if (de.limitador && !a.limitador && !await preguntar(t("pideLim"))) return false;
  return true;
}

// ------------------------------------------------------------------ mandos
function crearMandos() {
  const caja = $("mandos");
  caja.replaceChildren();
  for (const grupo of ["general", "joroba", "grave", "proteccion"]) {
    const s = document.createElement("section");
    s.className = "tarjeta";
    const h = document.createElement("h2");
    h.textContent = t("g_" + grupo);
    s.append(h);
    const sw = { general: "dsp", proteccion: "limitador" }[grupo];
    if (sw) {
      const l = document.createElement("label");
      l.className = "check";
      const i = document.createElement("input");
      i.type = "checkbox"; i.id = "p_" + sw;
      i.onchange = () => cambiar({ [sw]: i.checked });
      l.append(i, t(sw));
      s.append(l);
    }
    for (const [k, d] of Object.entries(PARAMS)) {
      if (d.grupo !== grupo) continue;
      const m = document.createElement("div");
      m.className = "mando";
      const l = document.createElement("label");
      l.htmlFor = "n_" + k; l.textContent = t(k);
      const f = document.createElement("div");
      f.className = "fila";
      const r = document.createElement("input"), n = document.createElement("input");
      r.type = "range"; n.type = "number"; r.id = "r_" + k; n.id = "n_" + k;
      r.setAttribute("aria-label", `${t("g_" + grupo)}: ${t(k)}`);
      n.min = d.min; n.max = d.max; n.step = d.paso;
      if (d.u === "Hz") {                 // barra logarítmica; el 0 (quitado), al principio
        const lo = Math.max(d.min, 20);
        r.min = 0; r.max = 1000; r.step = 1;
        r.aPos = (v) => v < lo ? 0 : Math.round(1000 * Math.log(v / lo) / Math.log(d.max / lo));
        r.aVal = (x) => d.min === 0 && x <= 0 ? 0 : lo * (d.max / lo) ** (x / 1000);
      } else {
        r.min = d.min; r.max = d.max; r.step = d.paso;
        r.aPos = r.aVal = (v) => v;
      }
      const poner = (v) => {
        if (!Number.isFinite(v)) { pintar(); return; }
        cambiar({ [k]: +Math.min(d.max, Math.max(d.min, v)).toFixed(d.dec) });
      };
      // Al arrastrar solo se envía si no hace falta preguntar nada
      r.oninput = () => { const v = +Math.min(d.max, Math.max(d.min, r.aVal(+r.value))).toFixed(d.dec); arrastrar(k, v); };
      r.onchange = () => poner(r.aVal(+r.value));
      n.onchange = () => poner(n.value === "" ? NaN : +n.value);
      const u = document.createElement("span");
      u.className = "u"; u.textContent = d.u;
      f.append(r, n, u);
      m.append(l, f);
      s.append(m);
    }
    caja.append(s);
  }
}

// Vista previa mientras se arrastra: se ve, pero no llega al ESP32 hasta soltar
function arrastrar(k, v) { pintar({ ...p, [k]: v }); }

async function cambiar(cambios) {
  const nuevo = { ...p, ...cambios };
  if (!await confirmar(p, nuevo)) { pintar(); return false; }
  p = { ...p, ...cambios };               // p ha podido cambiar durante la pregunta
  sucio = true;
  pintar();
  programarEnvio();
  return true;
}

function programarEnvio() {
  if (!serie.abierto || !enPlaca) return;
  clearTimeout(envio);
  envio = setTimeout(enviar, 120);
}

async function enviar() {
  if (enviando || !serie.abierto || !enPlaca) return enviando;
  enviando = (async () => {
    await null;                           // que «enviando» quede asignado antes de terminar
    try {
      while (serie.abierto) {
        const [orden] = comandosEntre(enPlaca, p);
        if (!orden) break;
        const antes = JSON.stringify(enPlaca);
        const r = leerAjustes(await serie.orden(orden));
        if (!r) throw new Error("respuesta");
        enPlaca = r;
        if (JSON.stringify(r) === antes) throw new Error("sin efecto");   // evita un bucle
      }
      avisar();
    } catch {
      if (serie.abierto) { avisar(t("fallo")); await leerPlaca(false).catch(() => {}); }
    } finally {
      enviando = null;
      pintar();
    }
  })();
  return enviando;
}

async function leerPlaca(comoBase = true) {
  const r = leerAjustes(await serie.orden("ver", (l) => leerAjustes(l) !== null));
  enPlaca = r;
  p = { ...r };
  if (comoBase) { base = { ...r }; sucio = false; }
  pintar();
}

// ------------------------------------------------------------------ conexión
$("conectar").onclick = async () => {
  if (serie.abierto) { enPlaca = null; await serie.cerrar(); return; }
  avisar();
  try { await serie.abrir(); } catch (e) {
    if (e.name !== "NotFoundError") avisar(t("ocupado"));   // NotFoundError: cancelado
    return;
  }
  try {
    try { await leerPlaca(); } catch { await leerPlaca(); }  // segundo intento, por si arrancaba
  } catch {
    await serie.cerrar();
    avisar(t("noResponde"));
    return;
  }
  consulta = setInterval(async () => {
    if (document.hidden || enviando) return;
    if (releer) {
      releer = false;
      try { await leerPlaca(); avisar(t("reinicio")); } catch { /* ya lo dirá la conexión */ }
      return;
    }
    serie.orden("estado", (l) => leerEstado(l) !== null).catch(() => {});
  }, 1000);
  pintar();
};

function cerrado() {
  clearInterval(consulta);
  clearTimeout(envio);
  if (enPlaca) avisar(t("caido"));
  enPlaca = base = null;
  releer = false;
  for (const id of ["ePico", "eGrave", "eLim", "eRec", "eCarga"]) $(id).textContent = "–";
  pintar();
}

function recibir(l) {
  const e = leerEstado(l);
  if (e) {
    $("ePico").textContent = e.pico <= -170 ? "–" : fmt(e.pico) + " dBFS";
    $("eGrave").textContent = fmt(e.grave) + " dB";
    $("eLim").textContent = fmt(e.limitador) + " dB";
    $("eRec").textContent = e.recortes;
    $("eCarga").textContent = fmt(e.carga) + " %";
    return;
  }
  if (enPlaca && l.startsWith("TuneAmp32 - ")) releer = true;
  const r = $("registro");
  r.textContent = (r.textContent + l + "\n").slice(-8000);
  r.scrollTop = r.scrollHeight;
}

// ------------------------------------------------------------------ botones
$("guardar").onclick = async () => {
  clearTimeout(envio);
  if (enviando) await enviando;
  await enviar();
  if (!enPlaca || comandosEntre(enPlaca, p).length) return;
  try {
    await serie.orden("guardar", (l) => l === "ok guardado");
    base = { ...enPlaca };
    sucio = false;
    avisar();
    pintar();
    $("pendiente").textContent = "✓ " + t("guardado");
  } catch { avisar(t("noGuardado")); }
};
$("deshacer").onclick = () => base && cambiar(base);
$("fabrica").onclick = async () => { if (await cambiar(FABRICA)) quitarMedida(); };
$("bajar").onclick = () => {
  const nombre = prompt(t("nombrePerfil"), nombrePerfil);
  if (nombre === null) return;
  nombrePerfil = nombre.trim();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([escribirPerfil(nombrePerfil, p)], { type: "application/json" }));
  a.download = (nombrePerfil.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "perfil") + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("subir").onclick = () => $("archivo").click();
$("archivo").onchange = async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = "";
  if (!f) return;
  let r;
  try {
    if (f.size > 100000) throw new Error("formato");
    r = leerPerfil(await f.text());
  } catch (e) { avisar(`${t("malPerfil")} (${e instanceof SyntaxError ? "JSON" : e.message}).`); return; }
  avisar();
  if (await cambiar(r.ajustes)) {
    quitarMedida();
    nombrePerfil = r.nombre;
    $("pendiente").textContent = `${t("perfilOk")}: ${r.nombre || f.name}`;
  }
};

// Ejemplos: perfiles publicados en docs/perfiles/
let ejemplos = [], actual = "";
function quitarMedida() { medida = null; actual = ""; $("ejemplo").value = ""; pintar(); }
function listarEjemplos() {
  const s = $("ejemplo"), v = s.value;
  s.replaceChildren(new Option(t("elige"), ""), ...ejemplos.map((e, i) => new Option(`${i + 1}. ${e.nombre}`, e.archivo)));
  s.value = v;
}
$("ejemplo").onchange = async () => {
  const archivo = $("ejemplo").value;

  if (!archivo) { quitarMedida(); return; }
  let r, m = null;
  try {
    r = leerPerfil(await (await fetch("../perfiles/" + archivo)).text());
    if (r.medida) m = await (await fetch("../perfiles/" + r.medida)).json();
  } catch { quitarMedida(); avisar(t("malPerfil")); return; }
  if (!await cambiar(r.ajustes)) { $("ejemplo").value = actual; return; }
  actual = archivo;
  medida = m;
  nombrePerfil = r.nombre;
  pintar();
  $("pendiente").textContent = `${t("perfilOk")}: ${r.nombre}`;
};
$("idioma").onclick = () => {
  idioma = idioma === "es" ? "en" : "es";
  try { localStorage.setItem("idioma", idioma); } catch { /* da igual */ }
  traducir();
};
$("verMedida").onchange = () => pintar();
window.addEventListener("beforeunload", (e) => { if (serie.abierto && sucio) e.preventDefault(); });

// ------------------------------------------------------------------ gráfico
const F = Array.from({ length: 320 }, (_, i) => 20 * 2 ** (i / 48)).filter((f) => f <= 2000);
const Y = [-35, 12];
let curvas = [], escala = null, cursor = null;

function interpolar(f) {
  const x = medida.f;
  let i = 1;
  while (i < x.length - 1 && x[i] < f) i++;
  const k = Math.log(f / x[i - 1]) / Math.log(x[i] / x[i - 1]);
  return medida.db[i - 1] + Math.min(1, Math.max(0, k)) * (medida.db[i] - medida.db[i - 1]);
}

function dibujar(q) {
  const eq = cadenaDb(q, F);
  curvas = [];
  if (medida && $("verMedida").checked) {
    const m = F.map(interpolar);
    curvas.push({ k: "medida", c: "--s1", v: m }, { k: "prevista", c: "--s2", v: m.map((x, i) => x + eq[i]) });
  }
  curvas.push({ k: "correccion", c: "--s3", v: eq, raya: true });

  const svg = $("grafico"), W = svg.clientWidth || 800, H = svg.clientHeight || 360;
  const M = { i: 40, d: 12, a: 10, b: 34 };
  const x = (f) => M.i + (W - M.i - M.d) * Math.log(f / 20) / Math.log(100);
  const y = (d) => M.a + (H - M.a - M.b) * (Y[1] - Math.min(Y[1], Math.max(Y[0], d))) / (Y[1] - Y[0]);
  escala = { x, y, M, W, H };
  let s = "";
  const marcas = W < 520 ? [20, 50, 100, 200, 500, 1000, 2000] : [20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000];
  for (const f of marcas) {
    s += `<line x1="${x(f)}" x2="${x(f)}" y1="${M.a}" y2="${H - M.b}" stroke="var(--malla)"/>`;
    s += `<text x="${x(f)}" y="${H - M.b + 16}" text-anchor="${f === 2000 ? "end" : "middle"}">${f >= 1000 ? f / 1000 + "k" : f}</text>`;
  }
  for (let d = -30; d <= 10; d += 10) {
    s += `<line x1="${M.i}" x2="${W - M.d}" y1="${y(d)}" y2="${y(d)}" stroke="var(${d === 0 ? "--eje" : "--malla"})"/>`;
    s += `<text x="${M.i - 6}" y="${y(d) + 4}" text-anchor="end">${d}</text>`;
  }
  s += `<text x="${(W + M.i) / 2}" y="${H - 3}" text-anchor="middle">Hz</text><text x="4" y="${M.a + 4}">dB</text>`;
  for (const c of curvas) {
    const pts = F.map((f, i) => `${x(f).toFixed(1)},${y(c.v[i]).toFixed(1)}`).join(" ");
    s += `<polyline points="${pts}" fill="none" stroke="var(${c.c})" stroke-width="2" stroke-linejoin="round"${c.raya ? ' stroke-dasharray="6 4"' : ""}/>`;
  }
  s += `<g id="cursor"></g>`;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("aria-label", t("curva"));
  svg.innerHTML = s;
  $("leyenda").innerHTML = curvas.map((c) => `<span><i class="${c.raya ? "raya" : ""}" style="border-color:var(${c.c})"></i>${t(c.k)}</span>`).join("");
  $("tabla").innerHTML = `<tr><th>${t("frec")}</th>${curvas.map((c) => `<th>${t(c.k)} (dB)</th>`).join("")}</tr>` +
    [20, 30, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 800, 1000, 2000].map((f) => {
      let i = F.findIndex((z) => z >= f * 0.995);
      if (i < 0) i = F.length - 1;
      return `<tr><td>${f} Hz</td>${curvas.map((c) => `<td>${fmt(c.v[i])}</td>`).join("")}</tr>`;
    }).join("");
  if (cursor !== null) mostrarCursor(cursor);

  const exceso = Math.max(0, ...eq) + q.ganancia;
  $("margen").textContent = exceso > 0.05 ? "⚠ " + t("margenMal", fmt(exceso)) : t("margenBien", fmt(Math.max(0, -exceso)));
}

function mostrarCursor(i) {
  cursor = i;
  const { x, y, M, W, H } = escala, X = x(F[i]);
  $("cursor").innerHTML = `<line x1="${X}" x2="${X}" y1="${M.a}" y2="${H - M.b}" stroke="var(--suave)"/>` +
    curvas.map((c) => `<circle cx="${X}" cy="${y(c.v[i])}" r="4" fill="var(${c.c})" stroke="var(--sup)" stroke-width="2"/>`).join("");
  const g = $("globo");
  g.hidden = false;
  g.innerHTML = `<b>${fmt(F[i], 0)} Hz</b>` + curvas.map((c) => `<br><i style="background:var(${c.c})"></i>${t(c.k)} <b>${fmt(c.v[i])} dB</b>`).join("");
  g.style.top = "12px";
  g.style.left = (X + 14 + g.offsetWidth > W ? X - 14 - g.offsetWidth : X + 14) + "px";
}
function quitarCursor() { cursor = null; $("globo").hidden = true; const c = $("cursor"); if (c) c.innerHTML = ""; }
$("grafico").onpointermove = (e) => {
  const { M, W } = escala, r = $("grafico").getBoundingClientRect();
  const k = Math.min(1, Math.max(0, (e.clientX - r.left - M.i) / (W - M.i - M.d)));
  mostrarCursor(Math.min(F.length - 1, Math.round(48 * Math.log2(100) * k)));
};
$("grafico").onpointerleave = $("grafico").onblur = quitarCursor;
$("grafico").onkeydown = (e) => {
  const d = { ArrowRight: 4, ArrowLeft: -4 }[e.key];
  if (!d) return;
  e.preventDefault();
  mostrarCursor(Math.min(F.length - 1, Math.max(0, (cursor ?? 110) + d)));
};

// ------------------------------------------------------------------ pintar
function pintar(q = p) {
  for (const k of Object.keys(PARAMS)) {
    const r = $("r_" + k);
    $("n_" + k).value = q[k];
    // Redondear la barra al arrastrar la haría saltar: solo se mueve si cambia el valor
    if (+Math.min(PARAMS[k].max, Math.max(PARAMS[k].min, r.aVal(+r.value))).toFixed(PARAMS[k].dec) !== q[k]) r.value = r.aPos(q[k]);
  }
  $("p_dsp").checked = q.dsp;
  $("p_limitador").checked = q.limitador;
  const si = serie.abierto && !!enPlaca;
  $("conexion").className = "chip" + (si ? " si" : "");
  $("conexion").textContent = t(si ? "conectado" : "sin");
  $("conectar").textContent = t(serie.abierto ? "desconectar" : "conectar");
  $("conectar").disabled = !Serie.disponible();
  $("guardar").disabled = !si;
  $("deshacer").disabled = !si || !base || comandosEntre(base, p).length === 0;
  $("pendiente").textContent = si && sucio ? t("sinGuardar") : "";
  $("filaMedida").hidden = !medida;
  dibujar(q);
}

function traducir() {
  document.documentElement.lang = idioma;
  for (const e of document.querySelectorAll("[data-t]")) e.textContent = t(e.dataset.t);
  $("idioma").textContent = t("otro");
  crearMandos();
  listarEjemplos();
  pintar();
  if (!Serie.disponible()) avisar(t("noSerie"));
}

new ResizeObserver(() => dibujar(p)).observe($("marco"));
traducir();
fetch("../perfiles/indice.json").then((r) => r.json()).then((j) => { ejemplos = j; listarEjemplos(); }).catch(() => {});
