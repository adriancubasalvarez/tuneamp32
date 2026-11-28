// Cálculo de la corrección: las mismas fórmulas que firmware/tuneamp32/src/dsp.cpp
// y medidas/disenar_eq.py (biquads del «Audio EQ Cookbook» de R. Bristow-Johnson).

export const FS = 44100;

// Límites (los del firmware donde los hay), paso, decimales y unidad.
export const PARAMS = {
  ganancia:  { min: -30, max: 6,    paso: 0.5,  dec: 1, u: "dB", grupo: "general" },
  pasoalto:  { min: 0,   max: 500,  paso: 1,    dec: 0, u: "Hz", grupo: "general" },
  joroba_f:  { min: 20,  max: 2000, paso: 1,    dec: 0, u: "Hz", grupo: "joroba" },
  joroba_db: { min: -20, max: 12,   paso: 0.1,  dec: 1, u: "dB", grupo: "joroba" },
  joroba_q:  { min: 0.1, max: 10,   paso: 0.01, dec: 2, u: "",   grupo: "joroba" },
  grave_f:   { min: 20,  max: 500,  paso: 1,    dec: 0, u: "Hz", grupo: "grave" },
  grave_db:  { min: -20, max: 12,   paso: 0.1,  dec: 1, u: "dB", grupo: "grave" },
  grave_q:   { min: 0.1, max: 10,   paso: 0.01, dec: 2, u: "",   grupo: "grave" },
  gravesmax: { min: -40, max: 0,    paso: 0.5,  dec: 1, u: "dB", grupo: "proteccion" },
  techo:     { min: -20, max: 0,    paso: 0.5,  dec: 1, u: "dB", grupo: "proteccion" },
};
export const INTERRUPTORES = ["dsp", "limitador"];

// Valores de fábrica del firmware: sin corrección (para cualquier altavoz)
export const FABRICA = {
  dsp: true, limitador: true, ganancia: -1, pasoalto: 0,
  joroba_f: 150, joroba_db: 0, joroba_q: 1,
  grave_f: 80, grave_db: 0, grave_q: 1, gravesmax: -6, techo: -1,
};

export function pasoAlto(f0, q = 0.7071, fs = FS) {
  const w = 2 * Math.PI * f0 / fs, al = Math.sin(w) / (2 * q), c = Math.cos(w);
  return { b: [(1 + c) / 2, -(1 + c), (1 + c) / 2], a: [1 + al, -2 * c, 1 - al] };
}

export function pico(f0, db, q, fs = FS) {
  const A = 10 ** (db / 40), w = 2 * Math.PI * f0 / fs;
  const al = Math.sin(w) / (2 * q), c = Math.cos(w);
  return { b: [1 + al * A, -2 * c, 1 - al * A], a: [1 + al / A, -2 * c, 1 - al / A] };
}

export function respuestaDb({ b, a }, f, fs = FS) {
  const w = 2 * Math.PI * f / fs;
  const c1 = Math.cos(w), s1 = -Math.sin(w), c2 = Math.cos(2 * w), s2 = -Math.sin(2 * w);
  const mod = (k) => Math.hypot(k[0] + k[1] * c1 + k[2] * c2, k[1] * s1 + k[2] * s2);
  return 20 * Math.log10(mod(b) / mod(a));
}

// Corrección completa en dB, sin la ganancia previa y con el refuerzo de
// grave entero (a volumen alto el firmware lo reduce solo).
export function cadenaDb(p, frecuencias) {
  if (!p.dsp) return frecuencias.map(() => 0);
  const filtros = [pico(p.joroba_f, p.joroba_db, p.joroba_q),
                   pico(p.grave_f, p.grave_db, p.grave_q)];
  if (p.pasoalto > 0) filtros.push(pasoAlto(p.pasoalto));
  return frecuencias.map((f) => filtros.reduce((s, x) => s + respuestaDb(x, f), 0));
}

const num = (p, k) => p[k].toFixed(PARAMS[k].dec);

// Comando del firmware que fija cada ajuste
export function comando(k, p) {
  if (k === "dsp" || k === "limitador") return `${k} ${p[k] ? "on" : "off"}`;
  if (k.startsWith("joroba")) return `joroba ${num(p, "joroba_f")} ${num(p, "joroba_db")} ${num(p, "joroba_q")}`;
  if (k.startsWith("grave_")) return `grave ${num(p, "grave_f")} ${num(p, "grave_db")} ${num(p, "grave_q")}`;
  return `${k} ${num(p, k)}`;
}

// Los comandos que llevan de un juego de ajustes a otro.
export function comandosEntre(de, a) {
  const orden = ["limitador", "techo", "gravesmax", "ganancia", "pasoalto",
                 "joroba_f", "joroba_db", "joroba_q", "grave_f", "grave_db", "grave_q", "dsp"];
  const lista = [];
  for (const k of orden) {
    if (de && de[k] === a[k]) continue;
    const c = comando(k, a);
    if (!lista.includes(c)) lista.push(c);
  }
  return lista;
}

// Interpreta la línea «dsp on | ganancia -7.0 dB | ...». null si no lo es.
export function leerAjustes(linea) {
  const n = "(-?[\\d.]+)";
  const m = linea.match(new RegExp(
    `dsp (on|off) \\| ganancia ${n} dB \\| pasoalto ${n} Hz \\| joroba ${n} Hz ${n} dB Q ${n}` +
    ` \\| grave ${n} Hz ${n} dB Q ${n} \\| limitador (on|off), gravesmax ${n} dB, techo ${n} dB` +
    ` \\| (\\d+) Hz`));
  if (!m) return null;
  const v = (i) => parseFloat(m[i]);
  return {
    dsp: m[1] === "on", ganancia: v(2), pasoalto: v(3),
    joroba_f: v(4), joroba_db: v(5), joroba_q: v(6),
    grave_f: v(7), grave_db: v(8), grave_q: v(9),
    limitador: m[10] === "on", gravesmax: v(11), techo: v(12),
  };
}

export function leerEstado(linea) {
  const m = linea.match(/pico (-?[\d.]+) dBFS \| grave reducido hasta (-?[\d.]+) dB \| limitador hasta (-?[\d.]+) dB \| recortes (\d+) \| carga ([\d.]+) %/);
  if (!m) return null;
  return { pico: +m[1], grave: +m[2], limitador: +m[3], recortes: +m[4], carga: +m[5] };
}

// Valida un perfil JSON. Devuelve los ajustes o lanza un Error con el motivo.
export function leerPerfil(texto) {
  const j = JSON.parse(texto);
  if (j?.formato !== "tuneamp32-perfil" || j.version !== 1 || typeof j.ajustes !== "object" || !j.ajustes)
    throw new Error("formato");
  const p = {};
  for (const k of INTERRUPTORES) {
    if (typeof j.ajustes[k] !== "boolean") throw new Error(k);
    p[k] = j.ajustes[k];
  }
  for (const [k, d] of Object.entries(PARAMS)) {
    const v = j.ajustes[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < d.min || v > d.max) throw new Error(k);
    p[k] = +v.toFixed(d.dec);
  }
  const medida = typeof j.medida === "string" && /^[\w-]+\.json$/.test(j.medida) ? j.medida : null;
  // Curva medida incluida en el perfil (la añade la página «Analizar»)
  const c = j.curva;
  const curva = c && Array.isArray(c.f) && Array.isArray(c.db) && c.f.length === c.db.length &&
    c.f.length > 10 && c.f.length < 5000 && [...c.f, ...c.db].every((x) => typeof x === "number" && Number.isFinite(x)) &&
    c.f.every((x, i) => x > 0 && (i === 0 || x > c.f[i - 1])) ? { f: c.f, db: c.db } : null;
  return { nombre: String(j.nombre ?? "").slice(0, 80), ajustes: p, medida, curva };
}

export function escribirPerfil(nombre, p) {
  const ajustes = {};
  for (const k of [...INTERRUPTORES, ...Object.keys(PARAMS)]) ajustes[k] = p[k];
  return JSON.stringify({ formato: "tuneamp32-perfil", version: 1, nombre, ajustes }, null, 2) + "\n";
}
