"""Mide desde el PC: reproduce la sesión y graba a la vez con el micrófono.
Al terminar, analiza la grabación y abre el informe. La señal puede llegar
al ESP32 por Bluetooth o, con --usb, generarla él mismo (no hace falta
Bluetooth en el PC).

Necesita:  pip install sounddevice pyserial      (además de numpy y matplotlib)

Por USB:
  python medir.py --usb --nivel --canal I
  python medir.py --usb --nombre mi_altavoz_I --canal I
      --dbfs -30   nivel de pico de la señal (de -60 a -6). Empieza bajo.
      --fmin 30    frecuencia más grave que suena (de 16 a 200 Hz). Con
                   altavoces pequeños, 60 o más.
      --puerto COM3  (por defecto, el primero que parezca un ESP32)

Uso:
  python medir.py --lista
      Muestra los dispositivos de audio.
  python medir.py --nivel [--canal I] [--atenuacion 12]
      Comprueba el volumen con un barrido corto (unos 10 s). Si satura,
      sube --atenuacion (dB que se baja la señal desde el PC) y usa la
      misma en todas las medidas que vayas a comparar.
  python medir.py --nombre jvc_cerca_I [--tipo cerca] [--canal I]
      Medida completa (unos 72 s): primero un tono de 1 s para comprobar
      que suena (si no, se para y dice qué revisar); luego graba, analiza
      y abre el informe.

Opciones de dispositivos (basta un trozo del nombre):
  --salida "TuneAmp32"        altavoz Bluetooth del ESP32
  --entrada "Wireless Microphone"  receptor del DJI Mic

Antes de medir, el volumen de Windows para la salida Bluetooth al 100 %:
el nivel se ajusta con el mando del amplificador.
"""
import argparse
import os
import sys
import time

import numpy as np

from comun import AMPLITUD, CARPETA, FS, barrido, escribir_wav_flotante
from generar_senales import sesion

try:
    import sounddevice as sd
except ImportError:
    sys.exit("Falta sounddevice. Instálalo con:  python -m pip install sounddevice")

API_PREFERIDA = "Windows DirectSound"   # nombres completos y conversión de frecuencia


def listar():
    apis = sd.query_hostapis()
    for i, d in enumerate(sd.query_devices()):
        api = apis[d["hostapi"]]["name"]
        tipo = ("entrada" if d["max_input_channels"] else "") + \
               (" salida" if d["max_output_channels"] else "")
        print(f"{i:3d}  {d['name']}  [{api}]  ({tipo.strip()})")


def buscar(trozo, entrada):
    """Índice del primer dispositivo cuyo nombre contiene «trozo»,
    prefiriendo DirectSound."""
    apis = sd.query_hostapis()
    candidatos = []
    for i, d in enumerate(sd.query_devices()):
        canales = d["max_input_channels"] if entrada else d["max_output_channels"]
        if canales and trozo.lower() in d["name"].lower():
            candidatos.append((apis[d["hostapi"]]["name"] != API_PREFERIDA, i))
    if not candidatos:
        tipo = "entrada" if entrada else "salida"
        sys.exit(f"No encuentro un dispositivo de {tipo} con «{trozo}». "
                 "Mira la lista con --lista y usa --entrada / --salida.")
    return min(candidatos)[1]


def reproducir_y_grabar(senal, salida, entrada, cola=2.0):
    """Reproduce la señal estéreo por «salida» mientras graba «entrada»."""
    canales_in = min(2, sd.query_devices(entrada)["max_input_channels"])
    trozos = []
    error = []

    def al_grabar(datos, frames, tiempo, estado):
        if estado:
            error.append(str(estado))
        trozos.append(datos.copy())

    with sd.InputStream(device=entrada, samplerate=FS, channels=canales_in,
                        dtype="float32", callback=al_grabar):
        sd.sleep(500)
        sd.play(senal.astype(np.float32), FS, device=salida, blocking=True)
        sd.sleep(int(cola * 1000))
    if error:
        print("Aviso de la tarjeta de sonido:", ", ".join(sorted(set(error))))
    return np.concatenate(trozos)


def generar_y_grabar(a, entrada, corta, cola=2.0):
    """El ESP32 genera la señal (orden por USB) mientras se graba «entrada».
    Si algo falla o se pulsa Ctrl+C, se le manda parar."""
    from dsp import abrir, buscar_puerto

    canal = {"I": "izquierdo", "D": "derecho", "ambos": "ambos"}[a.canal]
    canales_in = min(2, sd.query_devices(entrada)["max_input_channels"])
    trozos, error = [], []

    def al_grabar(datos, frames, tiempo, estado):
        if estado:
            error.append(str(estado))
        trozos.append(datos.copy())

    with abrir(a.puerto or buscar_puerto()) as s:
        def linea_con(textos, plazo):
            fin, resto = time.time() + plazo, b""
            siguiente = time.time() + 1
            while time.time() < fin:
                if time.time() >= siguiente:         # para que el ESP32 no se pare
                    s.write(b"sigo\n")
                    siguiente += 1
                resto += s.read(256)
                *lineas, resto = resto.split(b"\n")
                for l in lineas:
                    l = l.decode("utf-8", errors="replace").strip()
                    if l.startswith(("error:", *textos)):
                        return l
            raise TimeoutError("el ESP32 no responde")

        with sd.InputStream(device=entrada, samplerate=FS, channels=canales_in,
                            dtype="float32", callback=al_grabar):
            sd.sleep(500)
            acabada = False
            try:
                s.write(f"{'barrido' if corta else 'medir'} {canal} {a.dbfs:.1f} {a.fmin:.0f}\n".encode())
                r = linea_con(("ok midiendo",), 3)
                if r.startswith("error:"):
                    sys.exit(f"El ESP32 dice: {r}")
                r = linea_con(("medida ",), 85)
                acabada = True
            except TimeoutError as e:
                sys.exit(f"Medida fallida: {e}. ¿Tiene el firmware con «medir»?")
            finally:
                if not acabada:
                    s.write(b"parar\n")
                    s.flush()
            sd.sleep(int(cola * 1000))
    if not r.startswith("medida terminada"):
        sys.exit(f"El ESP32 dice: {r}")
    if "CORTES" in r:
        sys.exit("La señal se ha cortado: repite la medida (desconecta el Bluetooth del móvil).")
    if error:
        print("Aviso de la tarjeta de sonido:", ", ".join(sorted(set(error))))
    return np.concatenate(trozos)


def estereo(x, canal):
    cero = np.zeros_like(x)
    izq, der = {"I": (x, cero), "D": (cero, x), "ambos": (x, x)}[canal]
    return np.stack([izq, der], axis=1)


def comprobar_nivel_usb(a, entrada):
    print(f"Barrido de prueba a {a.dbfs:.0f} dBFS desde {a.fmin:.0f} Hz (unos 10 s)...")
    g = generar_y_grabar(a, entrada, corta=True, cola=1.0)
    decir_nivel(g, f"prueba --dbfs {max(a.dbfs - 10, -60):.0f} (o baja el mando).",
                f"prueba --dbfs {min(a.dbfs + 6, -6):.0f} o sube el mando poco a poco.")


def comprobar_nivel(salida, entrada, canal, atenuacion):
    s = np.concatenate([np.zeros(FS // 2), AMPLITUD * barrido(), np.zeros(FS // 2)])
    s *= 10 ** (-atenuacion / 20)
    print("Barrido de prueba (unos 10 s)...")
    g = reproducir_y_grabar(estereo(s, canal), salida, entrada, cola=1.0)
    decir_nivel(g, f"prueba --atenuacion {atenuacion + 10:.0f} (o baja el mando).",
                f"prueba --atenuacion {max(atenuacion - 15, 0):.0f} o sube el mando.")


def decir_nivel(g, si_alto, si_bajo):
    pico = float(np.max(np.abs(g)))
    pico_db = 20 * np.log10(max(pico, 1e-9))
    ruido = g[: FS // 4]
    ruido_db = 20 * np.log10(max(float(np.sqrt(np.mean(ruido ** 2))), 1e-9))
    print(f"Pico: {pico_db:.1f} dBFS   ruido de fondo: {ruido_db:.1f} dBFS")
    if pico_db > -3:
        print(f"→ DEMASIADO ALTO: {si_alto}")
    elif pico_db < -30:
        print(f"→ MUY BAJO: {si_bajo}")
    elif pico_db < -18:
        print("→ Algo bajo pero sirve. Ideal entre -12 y -6 dBFS.")
    else:
        print("→ CORRECTO. No toques el mando entre las medidas que vayas a comparar.")


LISTA = """Revisa antes de repetir:
  1. Amplificador encendido y conectado, mando en su marca.
  2. Cable de la cápsula conectado al amplificador (canal correcto).
  3. ESP32 alimentado y «TuneAmp32» en «Conectado – Música» en Windows.
  4. Volumen de Windows para «TuneAmp32» en su valor de siempre.
  5. Móvil sin Bluetooth (que no le quite la conexión al PC).
  6. Receptor y transmisor del DJI encendidos; micro a 1 cm del cono."""


def comprobar_sonido(salida, entrada, canal, atenuacion):
    """Tono de 300 Hz de 1 s: comprueba que el micrófono lo oye antes de
    grabar una medida larga. Devuelve False si no llega sonido."""
    n = FS
    t = np.arange(n) / FS
    tono = AMPLITUD * 10 ** (-atenuacion / 20) * np.sin(2 * np.pi * 300 * t)
    tono *= np.minimum(1, np.minimum(t, t[::-1]) / 0.02)
    g = reproducir_y_grabar(estereo(tono, canal), salida, entrada, cola=1.5)
    x = g[:, int(np.argmax(np.sum(g ** 2, axis=0)))]
    b = FS // 10
    bloques = x[: len(x) // b * b].reshape(-1, b)
    espectros = np.abs(np.fft.rfft(bloques * np.hanning(b), axis=1)) ** 2
    f = np.fft.rfftfreq(b, 1 / FS)
    banda = (f > 280) & (f < 320)
    nivel = 10 * np.log10(np.sum(espectros[:, banda], axis=1) + 1e-20)
    snr = float(np.max(nivel) - np.median(nivel))
    pico = 20 * np.log10(max(float(np.max(np.abs(x))), 1e-9))
    if snr < 20:
        print(f"✗ NO LLEGA SONIDO: el tono de prueba apenas se oye ({snr:.0f} dB sobre el ruido).")
        print(LISTA)
        return False
    if pico < -35:
        print(f"✗ Suena demasiado bajo (pico {pico:.1f} dBFS). Revisa el volumen de Windows para "
              "«TuneAmp32» (se puede quedar bajo al reconectar el Bluetooth) y el mando "
              "del amplificador, o baja --atenuacion.")
        return False
    if pico > -1:
        print(f"✗ El micrófono satura (pico {pico:.1f} dBFS): sube --atenuacion o baja el mando.")
        return False
    print(f"✓ Suena (tono {snr:.0f} dB sobre el ruido).")
    return True


def medir(nombre, tipo, canal, salida, entrada, ventana, atenuacion, comprobar=True):
    if comprobar and not comprobar_sonido(salida, entrada, canal, atenuacion):
        sys.exit(1)

    s = sesion() * 10 ** (-atenuacion / 20)
    print(f"Midiendo «{nombre}» ({len(s) / FS:.0f} s, atenuación {atenuacion:.0f} dB). "
          "Silencio, por favor...")
    g = reproducir_y_grabar(estereo(s, canal), salida, entrada)
    guardar_y_analizar(g, nombre, tipo, ventana)


def medir_usb(a, entrada):
    print(f"Midiendo «{a.nombre}» por USB (69 s, {a.dbfs:.0f} dBFS, desde {a.fmin:.0f} Hz). "
          "Silencio, por favor...")
    g = generar_y_grabar(a, entrada, corta=False)
    guardar_y_analizar(g, a.nombre, a.tipo, a.ventana, a.fmin)


def guardar_y_analizar(g, nombre, tipo, ventana, f_min=0.0):
    from analizar import analizar, guardar, texto_resumen

    carpeta = CARPETA / "grabaciones"
    carpeta.mkdir(exist_ok=True)
    ruta = carpeta / f"{nombre}.wav"
    escribir_wav_flotante(ruta, g)
    print(f"Grabación guardada en {ruta}. Analizando...")
    r = analizar(ruta, nombre, tipo, ventana, None, 1000.0, f_min)
    destino = guardar(r)
    print()
    print(texto_resumen(r))
    print(f"\nResultados en {destino}")
    if hasattr(os, "startfile"):
        os.startfile(destino / "informe.pdf")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lista", action="store_true")
    ap.add_argument("--nivel", action="store_true")
    ap.add_argument("--nombre")
    ap.add_argument("--tipo", choices=("cerca", "lejos", "sala"), default="cerca")
    ap.add_argument("--canal", choices=("I", "D", "ambos"), default="I")
    ap.add_argument("--salida", default="TuneAmp32")
    ap.add_argument("--entrada", default="Wireless Microphone")
    ap.add_argument("--ventana", type=float, default=5.0)
    ap.add_argument("--sin-comprobar", action="store_true",
                    help="no hacer la prueba de sonido de 1 s antes de medir")
    ap.add_argument("--atenuacion", type=float, default=0.0,
                    help="dB que se baja la señal desde el PC (para no saturar el micrófono)")
    ap.add_argument("--usb", action="store_true", help="la señal la genera el ESP32 (sin Bluetooth)")
    ap.add_argument("--dbfs", type=float, default=-30.0, help="con --usb: nivel de pico (-60 a -6)")
    ap.add_argument("--fmin", type=float, default=30.0, help="con --usb: frecuencia mínima (16 a 200 Hz)")
    ap.add_argument("--puerto", default=None, help="con --usb: puerto serie del ESP32")
    a = ap.parse_args()
    if a.lista:
        listar()
        return
    if a.usb:
        entrada = buscar(a.entrada, True)
        print(f"Entrada: {sd.query_devices(entrada)['name']}")
        if a.nivel:
            comprobar_nivel_usb(a, entrada)
        elif a.nombre:
            medir_usb(a, entrada)
        else:
            ap.error("usa --nivel o --nombre")
        return
    salida, entrada = buscar(a.salida, False), buscar(a.entrada, True)
    print(f"Salida:  {sd.query_devices(salida)['name']}")
    print(f"Entrada: {sd.query_devices(entrada)['name']}")
    if a.nivel:
        comprobar_nivel(salida, entrada, a.canal, a.atenuacion)
    elif a.nombre:
        medir(a.nombre, a.tipo, a.canal, salida, entrada, a.ventana, a.atenuacion,
              not a.sin_comprobar)
    else:
        ap.error("usa --lista, --nivel o --nombre")


if __name__ == "__main__":
    main()
