# TuneAmp32

**English** · [Español](README.es.md)

An ESP32 Bluetooth amplifier that **tunes itself to your speakers**: measure with an inexpensive microphone → get a proposed correction → load it into the ESP32 → measure again to verify.

> **Status: in development.** Code just moved here from Radio Mundial; tested on the board. Web tools in progress (`docs/panel`).

> **For any speaker.** From the factory TuneAmp32 applies **no correction** (only −1 dB of gain and a limiter). There is no high-pass either, so **start with the volume low**, especially with small speakers. Saved settings from an older version take priority: send `fabrica` and then `guardar`.
>
> **Example 1:** [JVC CS-J520X in a teardrop pod](docs/perfiles/jvc_cs-j520x_gota.json), by Adrián. Use it only with that speaker.

| Folder | Contents |
|---|---|
| [`firmware/tuneamp32`](firmware/tuneamp32) | Bluetooth receiver + DSP (Digital Signal Processor): PlatformIO and Arduino IDE |
| [`medidas`](medidas) | Measuring and correction scripts, JVC results |
| [`hardware`](hardware) | Wiring |
| [`carcasa/altavoz_gota_jvc`](carcasa/altavoz_gota_jvc) | JVC teardrop speaker, 3D files |
| [`docs`](docs) | Web tools (panel, analyze), speaker profiles and project documents |

New here? Read [How it works](docs/ayuda/index.html) (open it in your browser).

## Build

- **PlatformIO:** `pio run -t upload` inside `firmware/tuneamp32`.
- **Arduino IDE:** open `firmware/tuneamp32/tuneamp32.ino`; board "ESP32 Dev Module", partition "Huge APP". Install [arduino-audio-tools v1.3.0](https://github.com/pschatzmann/arduino-audio-tools/releases/tag/v1.3.0) and [ESP32-A2DP v1.8.12](https://github.com/pschatzmann/ESP32-A2DP/releases/tag/v1.8.12) from .ZIP.

Pair with **TuneAmp32** over Bluetooth. Serial at 115200 baud: type `ayuda` for the commands.

## License and credits

Code: [GPL-3.0](LICENSE). Content and 3D designs: [CC BY-NC-SA 4.0](LICENSE-CONTENIDO.md). Born from [Radio Mundial](https://github.com/adriancubasalvarez/radio-mundial). Uses the libraries by Phil Schatzmann.
