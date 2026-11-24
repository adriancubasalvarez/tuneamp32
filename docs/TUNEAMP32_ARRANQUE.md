# TuneAmp32 — Documento de arranque para Claude Code

> Para Claude Code. Abierto en `D:\INTERNET RADIO ESP32`. Léelo entero antes de proponer nada.
> Escrito el 24-nov-2026 a partir de una conversación en claude.ai con Adrián.

## Reglas de trabajo (las mismas de Radio Mundial)

1. **Primero propón un plan y espera mi autorización explícita** antes de escribir código o tocar archivos. Una fase cada vez.
2. **Responde siempre en español.**
3. **Cada vez que aparezcan siglas, escribe su significado** la primera vez en cada respuesta.
4. **No inventes pines ni datos del hardware.** Si no está en el código o en la documentación, pregúntame.
5. Cambios pequeños y verificables: cada fase debe compilar y probarse en la placa real.
6. **`main` de Radio Mundial no se toca:** hay gente replicando la radio.

## Qué es TuneAmp32

Un amplificador Bluetooth con ESP32 que **se afina a los altavoces que le conectes**. Ciclo completo:

**medir con un micro barato → el script propone la corrección → se carga en el ESP32 → se vuelve a medir y se verifica.**

Nace del boombox de Radio Mundial (rama `boombox`). Lo separamos en un proyecto propio para no mezclarlo con la radio.

**Diferencia frente a lo que existe:**
- Placas ADAU1701 tipo Wondom JAB5 (~70 €): hay que diseñar la ecualización a mano con SigmaStudio y REW (Room EQ Wizard).
- Louder-ESP32 (~24 $): tiene DSP (Digital Signal Processor), pero no trae herramienta de medida.
- miniDSP 2x4 HD (~270 €): caro.

Ninguno cierra el ciclo medir → corregir → verificar. Con las JVC, la medida con DSP coincidió con la predicción a menos de 0,5 dB.

## Qué existe ya (rama `boombox`, commit 7ca010a)

| Carpeta | Contenido | Estado |
|---|---|---|
| `boombox/prueba_bt/` | Firmware ESP32 clásico: receptor A2DP (Advanced Audio Distribution Profile) → DSP → I2S (Inter-IC Sound) → PCM5102A. Biquads (ganancia, paso alto, joroba, grave), refuerzo de grave dinámico, limitador, comandos serie, NVS (Non-Volatile Storage). | Probado. Flasheado el 24-nov desde Arduino IDE. |
| `boombox/medidas/` | `generar_senales.py`, `medir.py`, `analizar.py`, `comparar.py`, `disenar_eq.py`, `dsp.py`, `procedimiento.py` y `resultados/` de las JVC | Probado |
| `carcasa/boombox/` | Piezas de referencia (cavidad en huevo, altavoz maniquí, bloque del amplificador) | Se queda en Radio Mundial |

Valores de fábrica del DSP (medidos para las cápsulas JVC CS-J520X): ganancia −7 dB, paso alto 65 Hz, joroba −9,8 dB a 167 Hz (Q 2,1), grave +9 dB a 75 Hz (Q 0,9), limitador con techo −1 dBFS.

## Hardware de referencia (montaje probado el 24-nov)

- **ESP32 DevKit 30 pines** (ESP32-WROOM-32, CH340), en una placa de bornas.
- **DAC PCM5102A**, placa morada GY-PCM5102. Puentes: H1L (FLT), H2L (DEMP) y H4L (FMT) al pad derecho (GND); H3L (XSMT) al izquierdo (3,3 V); SCK puenteado a GND.
- **Cables:**

  | DAC | ESP32 | Color |
  |---|---|---|
  | BCK | GPIO 26 | amarillo |
  | DIN | GPIO 22 | morado |
  | LCK | GPIO 25 | verde |
  | GND | GND | negro |
  | VIN | VIN | rojo (medido: 4,76 V con USB-C) |

- **Amplificador TPA3116D2** a 24 V directos. Salidas a altavoz con RCA de chasis.
  - Ojo: es salida en puente (BTL, Bridge-Tied Load). Ningún borne es masa: no unir negativos entre sí ni a GND.
- **Alimentación:** 24 V → jack DC → interruptor → amplificador + reductor con salida USB-C → ESP32 → VIN del DAC.
- **Aislador de masa FeinTech ATG00101** entre el jack del DAC y el amplificador, si aparece ruido. Audio solo por él, sin otra unión de GND.
- Documentación: `DAC_PCM5102A_Radio_Mundial.pdf` (montaje B, páginas 6–7).

## Compilación: lo aprendido el 24-nov

- PlatformIO: `espressif32@6.12.0` = núcleo Arduino-ESP32 **2.0.17** (no 3.x). Partición `huge_app.csv`.
- Librerías: `arduino-audio-tools` **v1.3.0** y `ESP32-A2DP` **v1.8.12**.
- Arduino IDE funciona con: placa "ESP32 Dev Module", Partition Scheme "Huge APP (3MB No OTA/1MB SPIFFS)", las librerías instaladas desde .ZIP con esas versiones y un `.ino` vacío junto a `main.cpp`, `dsp.cpp` y `dsp.h`.
- El nuevo repositorio debería compilar con **los dos** (PlatformIO y Arduino IDE) sin tocar nada. Por ejemplo `firmware/tuneamp32/tuneamp32.ino` + `src/` y un `platformio.ini` que apunte ahí. A decidir en R1.

## Decisiones tomadas

- Nombre: **TuneAmp32** (repositorio `adriancubasalvarez/tuneamp32`, en minúsculas). Adrián lo crea vacío en GitHub (sin README ni licencia); comprobar que existe antes de subir nada.
- Proyecto separado de Radio Mundial.

## Decisiones pendientes (pregúntamelas al empezar)

1. ¿Conservar el historial de git de `prueba_bt` y `medidas` (recomendado, p. ej. con `git filter-repo`) o empezar de cero?
2. ¿Repositorio público desde el principio o privado hasta tener la guía?
3. Licencia: ¿la misma que Radio Mundial (GPL para el código + licencia de contenido)?
4. Carpeta local: propuesta `D:\TUNEAMP32`, junto a `D:\INTERNET RADIO ESP32`.

## Flujo para quien lo replique

1. **Montar** (~25–30 €), con guía y PDF de conexionado.
2. **Instalar el firmware desde la web** (ESP Web Tools), sin IDE.
3. **Escuchar ya** con un perfil "neutro": solo paso alto y limitador, seguro para cualquier altavoz.
4. **Medir:** el PC o el móvil por Bluetooth al TuneAmp32, micro a 1 cm del cono (campo cercano), botón "Medir".
5. **Diagnóstico y propuesta:** curva, joroba, F3 (frecuencia de −3 dB) y corrección con curva prevista. Ajustes con predicción en vivo.
6. **Cargar** al ESP32 por Web Serial (puerto USB desde el navegador) + `guardar`.
7. **Verificar:** volver a medir y ver el antes y después.
8. **Compartir el perfil** (JSON) en una biblioteca por modelo de altavoz. Quien tenga el mismo altavoz se salta la medida.

## Plataforma web (GitHub Pages, sin servidores ni cuentas)

- **Inicio:** qué es, vídeo y el antes/después de las JVC.
- **Montaje:** guía, lista de compra y PDF.
- **Instalar:** ESP Web Tools.
- **Medir:** Web Audio (API de sonido del navegador) para reproducir y grabar. Análisis con los scripts actuales en el navegador mediante Pyodide (Python dentro de la web), sin reescribirlos.
- **Ajustar:** panel con mandos, curva prevista y envío por Web Serial.
- **Perfiles:** archivos JSON en el repositorio, añadidos por contribución en GitHub y revisados por Adrián.
- **Manual:** en español e inglés.

**Límites:**
- Web Serial y la medida, solo en Chrome/Edge de escritorio.
- El micro del móvil recorta los graves (recomendar micro USB o de solapa).
- El campo cercano solo vale para grave y medio-grave.

## Fases propuestas

| Fase | Qué |
|---|---|
| **R1 – Mudanza** | Crear `D:\TUNEAMP32`, traer `prueba_bt` y `medidas` (con historial si se decide), estructura `firmware/`, `medidas/`, `hardware/`, `docs/`. README bilingüe. Compila con PlatformIO y Arduino IDE. En `boombox` de Radio Mundial, nota que apunte al nuevo repositorio. |
| **R4 – Instalador web** | `.bin` + manifest para ESP Web Tools en `docs/`. |
| **R3 – Panel de ajustes** | Web Serial: ver, ajustar, guardar. Formato de perfil JSON y comando para cargarlo en el firmware. |
| **R6 – Medida en el navegador** | Web Audio + Pyodide con `analizar.py` / `disenar_eq.py`. |
| **R7 – Biblioteca de perfiles** | Carpeta `perfiles/`, formato, cómo contribuir. |
| **R2 – Guía** | "Afina tu amplificador a tus altavoces", escrita en paralelo. |
| **R5 – Micro genérico** | `medir.py` con cualquier micro USB, no solo el DJI. |

Orden sugerido: R1 → R4 → R3 → R6 → R7, con R2 en paralelo.

## Cómo empezar

Primera respuesta esperada de Claude Code: hacerme las 4 decisiones pendientes y proponer el detalle de **R1**, sin tocar nada todavía.
