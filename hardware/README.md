# Hardware

| DAC PCM5102A (GY-PCM5102) | ESP32 DevKit 30 pines | Color |
|---|---|---|
| BCK | GPIO 26 | amarillo |
| DIN | GPIO 22 | morado |
| LCK | GPIO 25 | verde |
| GND | GND | negro |
| VIN | VIN (5 V) | rojo |

Puentes: **H1L, H2L y H4L** al pad derecho (GND); **H3L** al izquierdo (3,3 V); **SCK** a GND.

> **El TPA3116D2 tiene salida en puente (BTL, Bridge-Tied Load).** Ningún borne de altavoz es masa: no unas los negativos entre sí ni a GND.

- [`DAC_PCM5102A_Radio_Mundial.pdf`](DAC_PCM5102A_Radio_Mundial.pdf): para TuneAmp32 vale el **montaje B, páginas 6 y 7** (el A es para la radio). Las soldaduras están en las páginas 1 a 3.
- `antiguo/`: conexionado de la primera prueba, con **otro módulo DAC y otros colores**. Solo como historia: no lo sigas.

**Alimentación, por aclarar:** el PDF desaconseja alimentar el ESP32 con un reductor normal desde la fuente del amplificador (causó un pitido el 15-nov). El montaje del 24-nov sí usa un reductor con salida USB-C, con un aislador de masa en la línea de audio si aparece ruido.
