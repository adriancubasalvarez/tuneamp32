"""Copia a la web (docs/analizar/py/) el código de cálculo que usa la página
«Analizar» con Pyodide. Así la web y el PC usan exactamente el mismo cálculo.

Uso:
  python publicar_web.py              copia los archivos
  python publicar_web.py --comprobar  solo comprueba que son iguales (para las pruebas)
"""
import pathlib
import shutil
import sys

ARCHIVOS = ("comun.py", "analisis.py", "propuesta.py")
ORIGEN = pathlib.Path(__file__).resolve().parent
DESTINO = ORIGEN.parent / "docs" / "analizar" / "py"


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    comprobar = "--comprobar" in sys.argv
    distintos = []
    DESTINO.mkdir(parents=True, exist_ok=True)
    for nombre in ARCHIVOS:
        a, b = ORIGEN / nombre, DESTINO / nombre
        if b.exists() and a.read_bytes() == b.read_bytes():
            continue
        if comprobar:
            distintos.append(nombre)
        else:
            shutil.copyfile(a, b)
            print(f"copiado {nombre}")
    (DESTINO / "lista.txt").write_bytes(("\n".join(ARCHIVOS) + "\n").encode())
    if distintos:
        sys.exit("La web tiene una copia vieja de: " + ", ".join(distintos) +
                 ". Ejecuta  python publicar_web.py")
    print("La web tiene el mismo cálculo que el PC.")


if __name__ == "__main__":
    main()
