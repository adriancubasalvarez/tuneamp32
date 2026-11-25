# TuneAmp32

[English](README.md) · **Español**

Amplificador Bluetooth con ESP32 que **se afina a tus altavoces**: medir con un micro barato → propuesta de corrección → cargarla en el ESP32 → volver a medir y verificar.

> **Estado: en desarrollo.** Código recién traído de Radio Mundial; probado en la placa. Herramientas web en marcha (`docs/panel`).

> ⚠️ **Los valores de fábrica son para las JVC CS-J520X** (refuerzo de grave de hasta +9 dB). Con cualquier otro altavoz, manda `dsp off` por el puerto serie **antes de poner música**, `guardar` para conservarlo, y mide primero. `dsp off` también quita el paso alto de protección. Habrá un perfil neutro.

| Carpeta | Contenido |
|---|---|
| [`firmware/tuneamp32`](firmware/tuneamp32) | Receptor Bluetooth + DSP (Digital Signal Processor): PlatformIO y Arduino IDE |
| [`medidas`](medidas) | Scripts de medida y corrección, resultados de las JVC |
| [`hardware`](hardware) | Conexionado |
| [`carcasa/altavoz_gota_jvc`](carcasa/altavoz_gota_jvc) | Altavoz de gota JVC, archivos 3D |
| [`docs`](docs) | Documentos del proyecto |

## Compilar

- **PlatformIO:** `pio run -t upload` dentro de `firmware/tuneamp32`.
- **Arduino IDE:** abre `firmware/tuneamp32/tuneamp32.ino`; placa «ESP32 Dev Module», partición «Huge APP». Instala desde .ZIP [arduino-audio-tools v1.3.0](https://github.com/pschatzmann/arduino-audio-tools/releases/tag/v1.3.0) y [ESP32-A2DP v1.8.12](https://github.com/pschatzmann/ESP32-A2DP/releases/tag/v1.8.12).

Empareja con **TuneAmp32** por Bluetooth. Puerto serie a 115200 baudios: escribe `ayuda` para ver los comandos.

## Licencia y créditos

Código: [GPL-3.0](LICENSE). Contenido y diseños 3D: [CC BY-NC-SA 4.0](LICENSE-CONTENIDO.md). Nace de [Radio Mundial](https://github.com/adriancubasalvarez/radio-mundial). Usa las librerías de Phil Schatzmann.
