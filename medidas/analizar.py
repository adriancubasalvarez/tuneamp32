"""Analiza una grabación de la sesión de medida y saca la respuesta del altavoz.

Uso:
  python analizar.py GRABACION.wav --nombre jvc_cerca_I --tipo cerca
  python analizar.py GRABACION.wav --nombre jvc_50cm_I  --tipo lejos [--ventana 5]
  python analizar.py GRABACION.wav --nombre jvc_sala_I  --tipo sala

Tipos de medida:
  cerca  micrófono a ~1 cm del centro del cono (campo cercano). Da el grave
         sin la influencia de la habitación; válida hasta ~1 kHz. De aquí
         salen la frecuencia de corte, el Qtc de la caja y la distorsión.
  lejos  micrófono a 50 cm en el eje. Se recorta la respuesta al impulso
         antes del primer rebote (--ventana, en ms) para quitar la sala:
         válida desde ~1000/ventana Hz hacia arriba (medios y agudos).
  sala   como «lejos» pero sin recortar: lo que se oye en esa habitación.

Resultados en resultados/<nombre>/:
  informe.pdf      resumen y gráficos
  respuesta.png    distorsion.png   impulso.png
  respuesta.csv    frecuencia y nivel (suavizado a 1/6 de octava)
  distorsion.csv   THD, 2º y 3er armónico según la frecuencia (tipo cerca)
  tonos.csv        nivel, THD y THD+N de los tonos fijos de 30 a 190 Hz
  resumen.json     los números principales

Solo necesita numpy y matplotlib. El micrófono no está calibrado: los
niveles son relativos (0 dB = nivel medio de la zona plana).
"""
import argparse
import json
import pathlib
import sys

import numpy as np

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

from analisis import F_SALIDA, analizar, modelo_paso_alto, texto_resumen  # noqa: F401
from comun import CARPETA, FS


def figura_respuesta(r):
    fig, ax = plt.subplots(figsize=(10, 5.5))
    valida = (F_SALIDA >= r["f_min"]) & (F_SALIDA <= r["f_max"])
    ax.semilogx(F_SALIDA, r["nivel"], color="#bbb", lw=1, label="fuera de la zona válida")
    ax.semilogx(F_SALIDA[valida], r["nivel"][valida], color="#1f77b4", lw=2,
                label="respuesta (1/6 de octava)")
    ax.semilogx(F_SALIDA, r["ruido"], color="#999", lw=0.8, ls=":", label="ruido de fondo")
    c = r["caja"]
    if c:
        ax.semilogx(F_SALIDA, modelo_paso_alto(F_SALIDA, c["fc"], c["qtc"]) + c["desplaz_db"], "--",
                    color="#d62728", lw=1.2,
                    label=f"caja cerrada fc = {c['fc']:.0f} Hz, Qtc = {c['qtc']:.2f}")
    if r["tonos"]:
        ax.semilogx([t["f"] for t in r["tonos"]], [t["nivel_db"] for t in r["tonos"]], "o",
                    ms=4, color="#2ca02c", label="tonos fijos")
    for i, (k, v) in enumerate(r["cortes"].items()):
        if v:
            ax.axvline(v, color="#ff7f0e", lw=0.8, ls="--")
            ax.text(v, -22 - 3 * i, f" {k} = {v:.0f} Hz", fontsize=8, color="#ff7f0e")
    ax.axhline(0, color="#444", lw=0.6)
    ax.axhline(-3, color="#444", lw=0.4, ls=":")
    ax.set_xlim(20, 20000)
    ax.set_ylim(-30, 15)
    ax.set_xlabel("Frecuencia (Hz)")
    ax.set_ylabel("Nivel relativo (dB)")
    ax.set_title(f"Respuesta en frecuencia — {r['nombre']} ({r['tipo']})")
    ax.grid(True, which="both", alpha=0.3)
    ax.set_xticks([20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000])
    ax.set_xticklabels(["20", "50", "100", "200", "500", "1k", "2k", "5k", "10k", "20k"])
    ax.legend(loc="lower right", fontsize=8)
    fig.tight_layout()
    return fig


def figura_distorsion(r):
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(10, 7.5))
    d = r["dist"]
    if d:
        m = (F_SALIDA >= 20) & (F_SALIDA <= 5000)
        a1.loglog(F_SALIDA[m], d["thd"][m], color="#d62728", lw=2, label="THD (2º a 5º armónico)")
        a1.loglog(F_SALIDA[m], 100 * 10 ** (d["h2"][m] / 20), color="#1f77b4", lw=1, label="2º armónico")
        a1.loglog(F_SALIDA[m], 100 * 10 ** (d["h3"][m] / 20), color="#2ca02c", lw=1, label="3er armónico")
        a1.loglog(F_SALIDA[m], d["limite"][m], color="#999", ls=":", label="límite por ruido")
        a1.set_xlim(20, 5000)
        a1.set_ylim(0.05, 100)
        a1.set_title("Distorsión armónica con el barrido (campo cercano)")
        a1.legend(fontsize=8)
    else:
        a1.text(0.5, 0.5, "La distorsión con el barrido se calcula solo en medidas «cerca».",
                ha="center", va="center", transform=a1.transAxes)
    a1.set_ylabel("%")
    a1.set_xlabel("Frecuencia (Hz)")
    a1.grid(True, which="both", alpha=0.3)
    if r["tonos"]:
        f = [t["f"] for t in r["tonos"]]
        x = np.arange(len(f))
        a2.bar(x - 0.2, [t["thd"] for t in r["tonos"]], 0.4, color="#d62728", label="THD")
        a2.bar(x + 0.2, [t["thd_n"] for t in r["tonos"]], 0.4, color="#ff7f0e", label="THD+N")
        a2.set_xticks(x)
        a2.set_xticklabels([f"{v:.0f}" for v in f], fontsize=8)
        a2.set_xlabel("Frecuencia del tono (Hz)")
        a2.set_ylabel("%")
        a2.set_title("Tonos fijos: distorsión y ruidos (un pico aislado suele ser algo que vibra)")
        a2.legend(fontsize=8)
        a2.grid(True, axis="y", alpha=0.3)
    fig.tight_layout()
    return fig


def figura_impulso(r):
    fig, ax = plt.subplots(figsize=(10, 4.5))
    h, p = r["h"], r["picos"][0]
    a, b = p - int(0.005 * FS), p + int(0.05 * FS)
    seg = h[a:b]
    t = (np.arange(a, b) - p) / FS * 1000
    env = 20 * np.log10(np.abs(seg) / np.max(np.abs(seg)) + 1e-9)
    ax.plot(t, env, color="#1f77b4", lw=0.8)
    if r["tipo"] == "lejos":
        ax.axvline(r["ventana_ms"], color="#d62728", ls="--", label="fin de la ventana")
        ax.legend(fontsize=8)
    ax.set_ylim(-60, 2)
    ax.set_xlabel("Tiempo desde el pico (ms)")
    ax.set_ylabel("dB")
    ax.set_title("Respuesta al impulso: los picos tras el principal son rebotes\n"
                 "(en «lejos», la ventana debe acabar antes del primero)", fontsize=10)
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    return fig


def guardar(r):
    carpeta = CARPETA / "resultados" / r["nombre"]
    carpeta.mkdir(parents=True, exist_ok=True)
    with open(carpeta / "respuesta.csv", "w", encoding="utf-8") as fh:
        fh.write("frecuencia_Hz,nivel_dB,valida\n")
        for f, n in zip(F_SALIDA, r["nivel"]):
            fh.write(f"{f:.2f},{n:.2f},{int(r['f_min'] <= f <= r['f_max'])}\n")
    if r["dist"]:
        d = r["dist"]
        with open(carpeta / "distorsion.csv", "w", encoding="utf-8") as fh:
            fh.write("frecuencia_Hz,THD_pct,H2_dB,H3_dB,limite_ruido_pct\n")
            for i, f in enumerate(F_SALIDA):
                if f <= 5000:
                    fh.write(f"{f:.2f},{d['thd'][i]:.3f},{d['h2'][i]:.1f},{d['h3'][i]:.1f},"
                             f"{d['limite'][i]:.3f}\n")
    if r["tonos"]:
        with open(carpeta / "tonos.csv", "w", encoding="utf-8") as fh:
            fh.write("frecuencia_Hz,nivel_dB,THD_pct,THD_N_pct,H2_dB,H3_dB\n")
            for t in r["tonos"]:
                fh.write(f"{t['f']:.1f},{t['nivel_db']:.2f},{t['thd']:.2f},{t['thd_n']:.2f},"
                         f"{t['h2_db']:.1f},{t['h3_db']:.1f}\n")
    resumen = {k: r[k] for k in ("nombre", "tipo", "archivo", "canal", "fs", "pico_dbfs",
                                 "deriva_ppm", "snr_db", "f_min", "f_max", "ventana_ms",
                                 "caja", "cortes", "avisos", "joroba", "rebotes_db", "reflex",
                                 "f_distorsion", "zona_ref")}
    (carpeta / "resumen.json").write_text(json.dumps(resumen, indent=2, ensure_ascii=False),
                                          encoding="utf-8")

    figs = [("respuesta", figura_respuesta(r)), ("distorsion", figura_distorsion(r)),
            ("impulso", figura_impulso(r))]
    with PdfPages(carpeta / "informe.pdf") as pdf:
        portada = plt.figure(figsize=(10, 7.5))
        portada.text(0.06, 0.94, "TuneAmp32 — medida acústica", fontsize=16,
                     weight="bold", va="top")
        portada.text(0.06, 0.88, texto_resumen(r), fontsize=10, va="top", family="monospace")
        pdf.savefig(portada)
        plt.close(portada)
        for nombre, fig in figs:
            fig.savefig(carpeta / f"{nombre}.png", dpi=130)
            pdf.savefig(fig)
            plt.close(fig)
    return carpeta


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("grabacion", type=pathlib.Path)
    ap.add_argument("--nombre", required=True, help="nombre de la medida (carpeta de resultados)")
    ap.add_argument("--tipo", choices=("cerca", "lejos", "sala"), required=True)
    ap.add_argument("--ventana", type=float, default=5.0,
                    help="ms de respuesta al impulso que se usan en «lejos» (5 por defecto)")
    ap.add_argument("--canal", type=int, default=None,
                    help="canal de la grabación (por defecto el de más nivel)")
    ap.add_argument("--fmax-cerca", type=float, default=1000.0,
                    help="límite superior de validez del campo cercano (1000 Hz)")
    ap.add_argument("--fmin", type=float, default=0.0,
                    help="frecuencia mínima con la que se generó la señal (medidas por USB)")
    a = ap.parse_args()
    r = analizar(a.grabacion, a.nombre, a.tipo, a.ventana, a.canal, a.fmax_cerca, a.fmin)
    carpeta = guardar(r)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # consola de Windows
    print(texto_resumen(r))
    print(f"\nResultados en {carpeta}")


if __name__ == "__main__":
    main()
