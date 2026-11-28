"""Prepara el firmware para el instalador web (ESP Web Tools).

  1. compila firmware/tuneamp32 con PlatformIO;
  2. copia por separado el arranque, la tabla de particiones, el selector de
     arranque y el programa, cada uno en su dirección, SIN tocar la partición
     «nvs»: así una reinstalación conserva los ajustes guardados;
  3. escribe el manifest que lee la página docs/instalar/.

Salida (la publica GitHub Pages desde docs/):
  docs/firmware/tuneamp32-<pieza>.bin
  docs/firmware/manifest.json

Uso:  python firmware/publicar.py          (necesita PlatformIO y esptool)
"""
import csv
import json
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PROYECTO = RAIZ / "firmware" / "tuneamp32"
SALIDA = RAIZ / "docs" / "firmware"
MARCO = Path.home() / ".platformio" / "packages" / "framework-arduinoespressif32"
BOOT_APP0 = MARCO / "tools" / "partitions" / "boot_app0.bin"
TABLA = MARCO / "tools" / "partitions" / "huge_app.csv"      # la de platformio.ini

CHIP, FAMILIA = "esp32", "ESP32"
ARRANQUE = 0x1000                     # en el ESP32 clásico el arranque va en 0x1000
MODO, FRECUENCIA, TAMANO = "dio", "40m", "4MB"


def version():
    texto = (PROYECTO / "src" / "version.h").read_text(encoding="utf-8")
    return re.search(r'TUNEAMP32_VERSION\s+"([^"]+)"', texto).group(1)


def ejecutar(orden, cwd=RAIZ):
    print("  $", " ".join(str(o) for o in orden))
    subprocess.run(orden, check=True, cwd=cwd)


def particiones():
    resultado = {}
    with open(TABLA, encoding="utf-8") as f:
        for fila in csv.reader(l for l in f if l.strip() and not l.startswith("#")):
            nombre, _, _, posicion, tamano = [c.strip() for c in fila[:5]]
            resultado[nombre] = (int(posicion, 0), int(tamano, 0))
    return resultado


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ver = version()
    print(f"TuneAmp32 {ver}")
    ejecutar(["pio", "run"], cwd=PROYECTO)
    build = PROYECTO / ".pio" / "build" / "esp32dev"
    tabla = particiones()

    SALIDA.mkdir(parents=True, exist_ok=True)
    piezas = [
        ("arranque", ARRANQUE, build / "bootloader.bin"),
        ("particiones", 0x8000, build / "partitions.bin"),
        ("otadata", tabla["otadata"][0], BOOT_APP0),        # arrancar siempre desde app0
        ("programa", tabla["app0"][0], build / "firmware.bin"),
    ]
    partes = []
    for nombre, posicion, origen in piezas:
        destino = SALIDA / f"tuneamp32-{nombre}.bin"
        if nombre == "arranque":
            # merge-bin escribe en la cabecera del arranque el modo, la velocidad
            # y el tamaño de la flash, como hace pio al grabar
            ejecutar([sys.executable, "-m", "esptool", "--chip", CHIP, "merge-bin", "-o", destino,
                      "--flash-mode", MODO, "--flash-freq", FRECUENCIA, "--flash-size", TAMANO,
                      "--target-offset", hex(posicion), hex(posicion), origen])
            # El archivo tiene que empezar en la propia cabecera (0xE9), sin relleno
            assert destino.read_bytes()[0] == 0xE9, "el arranque no empieza por su cabecera"
            assert destino.stat().st_size == origen.stat().st_size, "el arranque ha cambiado de tamaño"
        else:
            destino.write_bytes(origen.read_bytes())
        partes.append({"path": destino.name, "offset": posicion})
        print(f"  {hex(posicion):>9}  {destino.name} ({destino.stat().st_size / 1024:.0f} KB)")

    # Ninguna pieza puede pisar la partición nvs (los ajustes guardados)
    ini_nvs, tam_nvs = tabla["nvs"]
    for p in partes:
        fin = p["offset"] + (SALIDA / p["path"]).stat().st_size
        assert not (p["offset"] < ini_nvs + tam_nvs and fin > ini_nvs), f"{p['path']} pisa la partición nvs"
    assert (SALIDA / "tuneamp32-programa.bin").stat().st_size <= tabla["app0"][1], "el programa no cabe"

    manifest = {
        "name": "TuneAmp32",
        "version": ver,
        "new_install_prompt_erase": True,
        "builds": [{"chipFamily": FAMILIA, "parts": partes}],
    }
    (SALIDA / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
                                          encoding="utf-8")
    print(f"\nListo: docs/firmware/manifest.json (versión {ver})")


if __name__ == "__main__":
    main()
