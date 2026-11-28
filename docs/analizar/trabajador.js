// Trabajador: ejecuta el análisis en Python (Pyodide) sin bloquear la página.
// El cálculo es el de medidas/analisis.py y medidas/propuesta.py, copiado a
// py/ con medidas/publicar_web.py.

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
importScripts(PYODIDE + "pyodide.js");

const PUENTE = `
import json, numpy as np
import analisis as A, propuesta as P

def _f(x):
    return None if x is None else float(x)

def analizar_web(ruta, f_min):
    r = A.analizar(ruta, "medida", "cerca", 5.0, None, 1000.0, f_min)
    c = P.curva(A.F_SALIDA, r["nivel"], [(t["f"], t["nivel_db"]) for t in r["tonos"]])
    d = P.diagnostico(c, r["caja"]["fc"], max(r["f_min"], 20.0), r["zona_ref"][1],
                      r["f_distorsion"], r["reflex"])
    opciones = P.proponer(c, d)
    for o in opciones:
        o["prevista"] = np.round(o["prevista"], 2).tolist()
        o["correccion"] = np.round(o["correccion"], 2).tolist()
    m = A.F_SALIDA <= 2000
    return json.dumps(dict(
        f=np.round(P.F, 3).tolist(), curva=np.round(c, 2).tolist(),
        f_salida=np.round(A.F_SALIDA[m], 3).tolist(), nivel=np.round(r["nivel"][m], 2).tolist(),
        ruido=np.round(r["ruido"][m], 2).tolist(),
        diagnostico=d, opciones=opciones, nada=P.nada_que_corregir(d), avisos=r["avisos"],
        fs=r["fs"], pico_dbfs=r["pico_dbfs"], snr_db=r["snr_db"], deriva_ppm=r["deriva_ppm"],
        barridos=len(r["picos"]), rebotes_db=r["rebotes_db"], caja=r["caja"],
        f_min=r["f_min"], f_max=r["f_max"],
        tonos=[dict(f=t["f"], nivel=t["nivel_db"], thd=t["thd"]) for t in r["tonos"]]),
        default=_f)
`;

let listo = null;

async function preparar() {
  postMessage({ tipo: "estado", clave: "cargandoPython" });
  const py = await loadPyodide({ indexURL: PYODIDE });
  postMessage({ tipo: "estado", clave: "cargandoNumpy" });
  await py.loadPackage("numpy");
  const lista = (await (await fetch("py/lista.txt", { cache: "no-cache" })).text()).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  py.FS.mkdirTree("/tuneamp32");
  for (const nombre of lista) {
    const texto = await (await fetch("py/" + nombre, { cache: "no-cache" })).text();
    py.FS.writeFile("/tuneamp32/" + nombre, texto);
  }
  py.runPython("import sys; sys.path.insert(0, '/tuneamp32')");
  py.runPython(PUENTE);
  return py;
}

onmessage = async (e) => {
  const { id, wav, f_min } = e.data;
  try {
    listo ??= preparar();
    const py = await listo;
    postMessage({ tipo: "estado", clave: "analizando" });
    py.FS.writeFile("/tmp/medida.wav", new Uint8Array(wav));
    const t0 = performance.now();
    const texto = py.globals.get("analizar_web")("/tmp/medida.wav", f_min);
    py.FS.unlink("/tmp/medida.wav");
    postMessage({ tipo: "resultado", id, datos: JSON.parse(texto), ms: performance.now() - t0 });
  } catch (err) {
    listo = listo && (await listo.catch(() => null)) ? listo : null;   // reintentar la carga si falló
    const texto = String(err?.message ?? err);
    // SystemExit de Python: el mensaje para la persona es la última línea
    postMessage({ tipo: "error", id, mensaje: texto.trim().split("\n").pop() });
  }
};
