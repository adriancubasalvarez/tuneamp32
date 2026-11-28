"""Pruebas del análisis y de la propuesta con altavoces simulados.

Cada caso pasa la señal de medida real (generar_senales.py) por un altavoz
de mentira, analiza la «grabación» y comprueba el diagnóstico. Después
aplica la corrección propuesta al altavoz simulado, lo vuelve a «medir» y
comprueba que sale lo previsto (el ciclo medir → corregir → verificar).

Uso:  python pruebas_propuesta.py          (unos minutos; no necesita nada conectado)
"""
import sys
import tempfile
import pathlib

import numpy as np

import analisis as A
import propuesta as P
from comun import FS, escribir_wav_flotante
from generar_senales import sesion

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
CARPETA = pathlib.Path(tempfile.mkdtemp(prefix="tuneamp32_"))
N = 1 << 22                                      # FFT para filtrar la sesión entera
FREC = np.fft.rfftfreq(N, 1 / FS)
S = np.fft.rfft(sesion(), N)
RUIDO = np.random.default_rng(3).normal(0, 3e-5, N)


def s_(f):
    return 2j * np.pi * np.maximum(f, 1e-3)


def caja_cerrada(fc, q):
    s, w = s_(FREC), 2 * np.pi * fc
    return s ** 2 / (s ** 2 + s * w / q + w ** 2)


def reflex(fb, f3):
    """Cono de una caja bass reflex: paso alto de 4º orden (Butterworth en f3)
    con el hueco del puerto en fb."""
    s, w3, wb = s_(FREC), 2 * np.pi * f3, 2 * np.pi * fb
    d = (s ** 2 + 0.7654 * w3 * s + w3 ** 2) * (s ** 2 + 1.8478 * w3 * s + w3 ** 2)
    return s ** 2 * (s ** 2 + wb / 7 * s + wb ** 2) / d


def paso_bajo(fc):
    s, w = s_(FREC), 2 * np.pi * fc
    return w ** 2 / (s ** 2 + s * w / 0.7071 + w ** 2)


def dsp(ajustes):
    """La corrección del firmware a 44,1 kHz evaluada en las frecuencias de la FFT."""
    eq = P.cadena_db(ajustes, f=np.minimum(np.maximum(FREC, 1.0), 22000.0))
    return 10 ** ((eq + ajustes["ganancia"]) / 20)


def grabar(h, nombre, f_min=0.0, rebotes=False, distorsion=0.0):
    y = np.fft.irfft(S * h, N)
    if distorsion:                                # el cono no da más de sí en el grave
        lento = np.fft.irfft(np.fft.rfft(y, N) * paso_bajo(50), N)
        y = y + distorsion * lento ** 3 / np.max(np.abs(lento)) ** 2
    if rebotes:                                   # micrófono lejos: la sala pesa tanto como el altavoz
        for k, (ms, g) in enumerate([(3.1, .7), (5.3, .6), (8.9, .5), (13, .45), (21, .4), (34, .3)]):
            y = y + g * np.roll(y, int(ms * FS / 1000)) * (-1) ** k
    if f_min:                                     # la señal no sonó por debajo de f_min
        y = np.fft.irfft(np.fft.rfft(y, N) * (FREC >= f_min * 2 ** (-1 / 3)), N)
    y = 0.3 * y / np.max(np.abs(y)) + RUIDO
    ruta = CARPETA / f"{nombre}.wav"
    escribir_wav_flotante(ruta, y[: len(y) - FS])
    return ruta


def analizar(h, nombre, f_min=0.0, **k):
    r = A.analizar(grabar(h, nombre, f_min, **k), nombre, "cerca", 5.0, None, 1000.0, f_min)
    c = P.curva(A.F_SALIDA, r["nivel"], [(t["f"], t["nivel_db"]) for t in r["tonos"]])
    d = P.diagnostico(c, r["caja"]["fc"], max(r["f_min"], 20.0), r["zona_ref"][1],
                      r["f_distorsion"], r["reflex"])
    return r, c, d


fallos = []


def comprobar(cond, texto):
    print(("  ✓ " if cond else "  ✗ ") + texto)
    if not cond:
        fallos.append(texto)


def verificar(h, nombre, opcion, f_min=0.0):
    """Aplica la opción al altavoz simulado, lo vuelve a medir y compara."""
    r, c2, _ = analizar(h * dsp(opcion["ajustes"]), nombre + "_dsp", f_min)
    b = (P.F >= max(60, f_min * 1.3, opcion["ajustes"]["pasoalto"] * 1.3)) & (P.F <= 600)
    # Las dos curvas van referidas a su zona plana: se igualan por la mediana
    dif = c2 - opcion["prevista"]
    dif -= np.median(dif[(P.F >= 250) & (P.F <= 600)])
    e = float(np.mean(np.abs(dif[b])))
    comprobar(e < 1.0, f"la medida con la corrección coincide con la prevista ({e:.2f} dB de media)")


def caso(nombre, h, f_min=0.0, **k):
    print(f"\n== {nombre}")
    r, c, d = analizar(h, nombre, f_min, **k)
    o = P.proponer(c, d)
    print("   " + P.resumen_texto(d, o).replace("\n", "\n   "))
    if r["avisos"]:
        print("   avisos: " + " | ".join(r["avisos"]))
    return r, c, d, o


def recomendada(o):
    return next(x for x in o if x["recomendada"])


# 1. Caja cerrada seca (Q 0,5): sin joroba, el grave se puede reforzar
h = caja_cerrada(90, 0.5)
r, c, d, o = caso("cerrada seca fc 90 Q 0,5", h)
comprobar(d["joroba"] is None, "no ve joroba")
comprobar(abs(r["caja"]["fc"] / 90 - 1) < 0.1 and abs(r["caja"]["qtc"] - 0.5) < 0.1, "acierta fc y Q")
comprobar(all(x["refuerzo_db"] > 0 for x in o), "no propone «solo quitar la joroba»")
comprobar(recomendada(o)["f3_prevista"] < d["f3"] * 0.85, "la recomendada baja la F3")
verificar(h, "seca", recomendada(o))

# 2. Caja cerrada retumbona (Q 1,5)
h = caja_cerrada(110, 1.5)
r, c, d, o = caso("cerrada retumbona fc 110 Q 1,5", h)
comprobar(d["joroba"] is not None and abs(d["joroba"]["f"] / 110 - 1) < 0.25, "ve la joroba cerca de 110 Hz")
comprobar(o[0]["refuerzo_db"] == 0 and o[0]["joroba_prevista_db"] < 1.5, "«solo quitar la joroba» la deja por debajo de 1,5 dB")
verificar(h, "retumbona", recomendada(o))

# 3. Altavoz pequeño que corta alto (fc 260 Q 1)
h = caja_cerrada(260, 1.0)
r, c, d, o = caso("pequeño fc 260 Q 1", h)
comprobar(abs(r["caja"]["fc"] / 260 - 1) < 0.12, "acierta la resonancia alta")
comprobar(recomendada(o)["ajustes"]["pasoalto"] > 100, "pone el paso alto alto, acorde con el altavoz")
verificar(h, "pequeno", recomendada(o))

# 4. Grave que ya llega hondo: nada que corregir
h = caja_cerrada(22, 0.6)
r, c, d, o = caso("ya plano (fc 22)", h)
comprobar(P.nada_que_corregir(d), "dice que no hace falta corregir")

# 5. Bass reflex
h = reflex(55, 60)
r, c, d, o = caso("bass reflex (puerto a 55 Hz)", h)
comprobar(r["reflex"] is not None, "detecta el bass reflex")
comprobar(all(x["refuerzo_db"] == 0 for x in o), "no propone reforzar el grave")

# 6. Micrófono lejos del cono
h = caja_cerrada(90, 0.7)
r, c, d, o = caso("micro lejos (mucha sala)", h, rebotes=True)
comprobar(any("habitación" in a for a in r["avisos"]), "avisa de que el micro no está pegado")

# 7. Medida que empieza en 70 Hz (altavoz pequeño, --fmin 70)
h = caja_cerrada(100, 0.7)
r, c, d, o = caso("medida desde 70 Hz", h, f_min=70)
comprobar(any(x["desaconsejada"] for x in o if x["refuerzo_db"] == 9), "desaconseja reforzar por debajo de lo medido")
verificar(h, "fmin70", recomendada(o), f_min=70)

# 8. Cono al límite en el grave (distorsión)
h = caja_cerrada(70, 0.7)
r, c, d, o = caso("distorsiona en el grave", h, distorsion=2.0)
comprobar(r["f_distorsion"] is not None, "detecta la distorsión")
comprobar(any(x["desaconsejada"] for x in o), "desaconseja algún refuerzo")

print(f"\n{'TODO BIEN' if not fallos else f'{len(fallos)} FALLOS'}" + "".join(f"\n  · {x}" for x in fallos))
sys.exit(1 if fallos else 0)
