// Marco común de todas las páginas: tema (oscuro por defecto), logotipo y menú.
// Se carga en <head> sin «defer» para poner el tema antes de pintar nada.
(() => {
  const raiz = document.documentElement;
  let tema = "oscuro";
  try { tema = localStorage.getItem("tema") || "oscuro"; } catch { /* da igual */ }
  if (tema === "claro") raiz.dataset.tema = "claro";

  // Ruta relativa a la carpeta docs/ desde esta página
  const base = new URL("..", document.currentScript.src).href;
  const PAGINAS = [
    ["", "Inicio", "Home"], ["asistente/", "Asistente", "Assistant"], ["panel/", "Panel", "Panel"],
    ["instalar/", "Instalar", "Install"], ["ayuda/", "Cómo funciona", "How it works"],
  ];
  const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="none" stroke="currentColor" stroke-opacity=".35"/>
    <path d="M6 23 C9 23 10 12 13 11 C15.5 10.3 16 16 18 16 H26" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M6 23 C8.5 21 10 16 14 16 H26" fill="none" stroke="var(--ambar)" stroke-width="2.4" stroke-linecap="round"/></svg>`;

  function montar() {
    const cab = document.querySelector("header");
    if (!cab) return;
    const marca = cab.querySelector(".marca");
    if (marca && !marca.querySelector(".logo")) {
      // El texto «TuneAmp32» pasa a ser el logotipo; lo demás (subtítulo) se queda
      for (const n of [...marca.childNodes]) if (n.nodeType === 3) n.textContent = n.textContent.replace("TuneAmp32", "").trimStart();
      const a = document.createElement("a");
      a.className = "logo"; a.href = base;
      a.innerHTML = `${LOGO}<b>TuneAmp<i>32</i></b>`;
      marca.prepend(a);
    }
    // Menú (sustituye a los enlaces sueltos que tenía cada página)
    const aqui = location.href.replace(/index\.html$/, "").split(/[?#]/)[0];
    for (const a of cab.querySelectorAll(".acciones a.boton")) {
      if (PAGINAS.some(([p]) => a.href === base + p)) a.remove();
    }
    const nav = document.createElement("nav");
    nav.className = "menu";
    nav.setAttribute("aria-label", "TuneAmp32");
    for (const [p] of PAGINAS) {
      const a = document.createElement("a");
      a.href = base + p;
      if (aqui === base + p) a.setAttribute("aria-current", "page");
      nav.append(a);
    }
    marca.after(nav);
    // Botón de tema
    const b = document.createElement("button");
    b.className = "tema"; b.type = "button";
    b.onclick = () => {
      const claro = raiz.dataset.tema !== "claro";
      if (claro) raiz.dataset.tema = "claro"; else delete raiz.dataset.tema;
      try { localStorage.setItem("tema", claro ? "claro" : "oscuro"); } catch { /* da igual */ }
      rotular();
      window.dispatchEvent(new Event("cambiotema"));
    };
    (cab.querySelector(".acciones") ?? cab).append(b);

    function rotular() {
      const es = !raiz.lang.startsWith("en");
      nav.querySelectorAll("a").forEach((a, i) => { a.textContent = PAGINAS[i][es ? 1 : 2]; });
      const claro = raiz.dataset.tema === "claro";
      b.textContent = claro ? "☾" : "☀";
      b.title = b.ariaLabel = es ? (claro ? "Tema oscuro" : "Tema claro") : (claro ? "Dark theme" : "Light theme");
    }
    rotular();
    new MutationObserver(rotular).observe(raiz, { attributes: true, attributeFilter: ["lang"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar); else montar();
})();
