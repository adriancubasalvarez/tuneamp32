"""Propone la corrección DSP de un altavoz a partir de una medida en campo
cercano ya analizada (analizar.py o medir.py) y predice cómo quedará.

Uso:
  python disenar_eq.py mi_altavoz_I              opciones y la recomendada (★)
  python disenar_eq.py mi_altavoz_I --opcion 3   guarda la opción 3

Sirve para cualquier altavoz: el cálculo está en propuesta.py. Se proponen
varias opciones, de solo quitar la joroba a reforzar el grave +9 dB, cada
una con un paso alto de protección si refuerza.

Resultados en resultados/<medida>_eq/:
  prediccion.png    curva medida, corrección y curva prevista
  parametros.json   los valores de los filtros y el diagnóstico
  comandos.txt      los comandos para el puerto serie del ESP32
  perfil.json       el perfil para el panel web
"""
import argparse
import json
import sys

import numpy as np

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

import propuesta as P
from comun import CARPETA

RESULTADOS = CARPETA / "resultados"


def cargar(nombre):
    """Curva y diagnóstico a partir de los archivos de analizar.py."""
    carpeta = RESULTADOS / nombre
    if not (carpeta / "respuesta.csv").exists():
        sys.exit(f"No encuentro {carpeta}: analiza antes la medida (tipo cerca).")
    r = np.genfromtxt(carpeta / "respuesta.csv", delimiter=",", names=True)
    tonos = []
    if (carpeta / "tonos.csv").exists():
        t = np.atleast_1d(np.genfromtxt(carpeta / "tonos.csv", delimiter=",", names=True))
        tonos = [(float(x["frecuencia_Hz"]), float(x["nivel_dB"])) for x in t]
    j = json.loads((carpeta / "resumen.json").read_text(encoding="utf-8"))
    if j.get("tipo") != "cerca" or not j.get("caja"):
        sys.exit("La propuesta necesita una medida en campo cercano (tipo cerca).")
    c = P.curva(r["frecuencia_Hz"], r["nivel_dB"], tonos)
    f_min = max(float(j.get("f_min", 20.0)), 20.0)
    f_ref = (j.get("zona_ref") or [250.0, 600.0])[1]
    d = P.diagnostico(c, j["caja"]["fc"], f_min, f_ref, j.get("f_distorsion"), j.get("reflex"))
    return c, d


def grafico(nombre, c, d, o, ruta):
    fig, ax = plt.subplots(figsize=(10, 5.5))
    ax.semilogx(P.F, c, color="#1f77b4", lw=2, label="medida")
    ax.semilogx(P.F, o["correccion"], color="#2ca02c", lw=1.2, ls="--", label="corrección del DSP")
    ax.semilogx(P.F, o["prevista"], color="#d62728", lw=2.4, label="prevista con el DSP")
    if d["f_min"] > 20:
        ax.axvspan(20, d["f_min"], color="#ccc", alpha=0.4, lw=0, label="sin medida")
    ax.axhline(0, color="#444", lw=0.6)
    ax.set_xlim(20, 2000)
    ax.set_ylim(-35, 12)
    ax.set_xticks([20, 30, 50, 70, 100, 150, 200, 300, 500, 1000, 2000])
    ax.set_xticklabels(["20", "30", "50", "70", "100", "150", "200", "300", "500", "1k", "2k"])
    ax.grid(True, which="both", alpha=0.3)
    ax.set_xlabel("Frecuencia (Hz)")
    ax.set_ylabel("Nivel relativo (dB)")
    ax.set_title(f"Corrección prevista — {nombre} — {o['nombre']}")
    a = o["ajustes"]
    ax.text(0.02, 0.97, f"paso alto {a['pasoalto']:.0f} Hz\n"
            f"joroba {a['joroba_db']:+.1f} dB a {a['joroba_f']:.0f} Hz (Q {a['joroba_q']:.2f})\n"
            f"grave {a['grave_db']:+.1f} dB a {a['grave_f']:.0f} Hz (Q {a['grave_q']:.2f})\n"
            f"ganancia previa {a['ganancia']:.0f} dB", transform=ax.transAxes, va="top",
            fontsize=9, family="monospace", bbox=dict(fc="white", ec="#ccc"))
    ax.legend(loc="lower right", fontsize=8)
    fig.tight_layout()
    fig.savefig(ruta, dpi=130)
    plt.close(fig)


def comandos(a):
    return [f"ganancia {a['ganancia']:.1f}", f"pasoalto {a['pasoalto']:.0f}",
            f"joroba {a['joroba_f']:.0f} {a['joroba_db']:.1f} {a['joroba_q']:.2f}",
            f"grave {a['grave_f']:.0f} {a['grave_db']:.1f} {a['grave_q']:.2f}", "dsp on"]


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("medida")
    ap.add_argument("--opcion", type=int, help="número de la opción que se guarda (por defecto, ★)")
    a = ap.parse_args()

    c, d = cargar(a.medida)
    opciones = P.proponer(c, d)
    print(P.resumen_texto(d, opciones).replace("\n  ", "\n  "))
    if a.opcion is None:
        o = next(x for x in opciones if x["recomendada"])
    elif 1 <= a.opcion <= len(opciones):
        o = opciones[a.opcion - 1]
    else:
        sys.exit(f"Hay {len(opciones)} opciones: usa --opcion 1 a {len(opciones)}.")

    carpeta = RESULTADOS / f"{a.medida}_eq"
    carpeta.mkdir(parents=True, exist_ok=True)
    limpio = {k: v for k, v in o.items() if k not in ("prevista", "correccion")}
    (carpeta / "parametros.json").write_text(json.dumps(
        dict(medida=a.medida, diagnostico=d, opcion=limpio), indent=2, ensure_ascii=False),
        encoding="utf-8")
    (carpeta / "comandos.txt").write_text("\n".join(comandos(o["ajustes"])) + "\n", encoding="utf-8")
    (carpeta / "perfil.json").write_text(json.dumps(dict(
        formato="tuneamp32-perfil", version=1, nombre=f"{a.medida} — {o['nombre']}",
        ajustes=o["ajustes"]), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    grafico(a.medida, c, d, o, carpeta / "prediccion.png")
    print(f"\nGuardada «{o['nombre']}» en {carpeta}")
    print("Comandos para el ESP32 (python dsp.py --archivo .../comandos.txt):\n  " +
          "\n  ".join(comandos(o["ajustes"])))


if __name__ == "__main__":
    main()
