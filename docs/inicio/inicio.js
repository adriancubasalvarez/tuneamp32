// Portada: idioma y la curva real antes/después, animada.
const $ = (id) => document.getElementById(id);
let idioma = "es";
try { idioma = localStorage.getItem("idioma") ?? (navigator.language.startsWith("es") ? "es" : "en"); } catch { /* da igual */ }
if (idioma !== "en") idioma = "es";

function traducir() {
  document.documentElement.lang = idioma;
  for (const e of document.querySelectorAll("[data-es]")) e.textContent = e.dataset[idioma];
  $("idioma").textContent = idioma === "es" ? "English" : "Español";
  document.title = idioma === "es" ? "TuneAmp32 · Tu amplificador, afinado a tus altavoces" : "TuneAmp32 · Your amplifier, tuned to your speakers";
  pintarCifras();
}
$("idioma").onclick = () => {
  idioma = idioma === "es" ? "en" : "es";
  try { localStorage.setItem("idioma", idioma); } catch { /* da igual */ }
  traducir();
};

// ------------------------------------------------------------------ curva
let datos = null, k = 0, objetivo = 0, animacion = null;
const W = 600, H = 300, M = { i: 34, d: 10, a: 12, b: 26 }, Y = [-30, 10];
const x = (f) => M.i + (W - M.i - M.d) * Math.log(f / 30) / Math.log(1000 / 30);
const y = (v) => M.a + (H - M.a - M.b) * (Y[1] - Math.min(Y[1], Math.max(Y[0], v))) / (Y[1] - Y[0]);
const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;

function camino(v) { return datos.f.map((f, i) => `${i ? "L" : "M"}${x(f).toFixed(1)},${y(v[i]).toFixed(1)}`).join(""); }

function dibujar() {
  if (!datos) return;
  const mezcla = datos.antes.map((a, i) => a + (datos.despues[i] - a) * k);
  let s = "";
  for (const f of [30, 50, 100, 200, 500, 1000]) {
    s += `<line x1="${x(f)}" x2="${x(f)}" y1="${M.a}" y2="${H - M.b}" stroke="var(--malla)"/>`;
    s += `<text x="${x(f)}" y="${H - 8}" text-anchor="middle">${f >= 1000 ? "1k" : f}</text>`;
  }
  for (const v of [-30, -20, -10, 0, 10]) {
    s += `<line x1="${M.i}" x2="${W - M.d}" y1="${y(v)}" y2="${y(v)}" stroke="var(${v === 0 ? "--eje" : "--malla"})"/>`;
    s += `<text x="${M.i - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  s += `<text x="${W - M.d}" y="${H - 8}" text-anchor="end" opacity=".7">Hz</text><text x="2" y="${M.a + 2}" opacity=".7">dB</text>`;
  // la curva de antes queda tenue al pasar a después
  s += `<path d="${camino(datos.antes)}" fill="none" stroke="var(--suave)" stroke-width="1.5" stroke-dasharray="4 4" opacity="${(0.8 * k).toFixed(2)}"/>`;
  s += `<path d="${camino(mezcla)}" fill="none" stroke="var(--ambar)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  const svg = $("curva");
  svg.innerHTML = s;
  svg.setAttribute("aria-label", idioma === "es"
    ? "Respuesta del altavoz antes y después de la corrección: la joroba de 172 Hz desaparece y el grave llega más abajo."
    : "Speaker response before and after correction: the 172 Hz hump disappears and the bass goes deeper.");
}

function pintarCifras() {
  if (!datos) return;
  const despues = objetivo === 1;
  $("cJoroba").textContent = despues ? (idioma === "es" ? "Plana" : "Flat") : `+${datos.joroba[1].toLocaleString(idioma)} dB`;
  $("cF3").textContent = `${despues ? datos.f3[1] : datos.f3[0]} Hz`;
  $("verAntes").setAttribute("aria-checked", String(!despues));
  $("verDespues").setAttribute("aria-checked", String(despues));
}

function ir(a) {
  objetivo = a;
  pintarCifras();
  cancelAnimationFrame(animacion);
  if (quieto) { k = a; dibujar(); return; }
  const k0 = k, t0 = performance.now(), dur = 1100;
  const paso = (t) => {
    const u = Math.min(1, (t - t0) / dur), e = u < .5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
    k = k0 + (a - k0) * e;
    dibujar();
    if (u < 1) animacion = requestAnimationFrame(paso);
  };
  animacion = requestAnimationFrame(paso);
}
$("verAntes").onclick = () => ir(0);
$("verDespues").onclick = () => ir(1);

fetch("inicio/jvc.json").then((r) => r.json()).then((d) => {
  datos = d;
  dibujar();
  pintarCifras();
  // Al verla por primera vez, pasa sola de antes a después
  const o = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { o.disconnect(); setTimeout(() => { if (objetivo === 0 && k === 0) ir(1); }, 900); }
  }, { threshold: 0.5 });
  o.observe($("curva"));
}).catch(() => {});
traducir();
