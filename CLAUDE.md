# TuneAmp32: contexto para Claude Code

Lee `docs/TUNEAMP32_ARRANQUE.md` entero antes de proponer nada.

1. Primero propón un plan y espera la autorización explícita. Una fase cada vez.
2. Responde siempre en español.
3. Escribe el significado de cada sigla la primera vez en cada respuesta.
4. No inventes pines ni datos del hardware: si no están en el código o la documentación, pregunta.
5. Cambios pequeños y verificables: cada fase compila y se prueba en la placa real.
6. `main` de Radio Mundial no se toca.

Estado: R4a (instalador web: `python firmware/publicar.py` → docs/firmware, página docs/instalar) hecha; publicada en https://adriancubasalvarez.github.io/tuneamp32/ (GitHub Pages desde main/docs). R4b (identidad «Estudio nocturno»: docs/panel/panel.css común, docs/comun/marco.js con logo, menú y tema; portada docs/index.html con antes/después real) hecha. W1b (ayuda en docs/ayuda) hecha. W3a (el ESP32 genera la señal, `medir.py --usb`) hecha y verificada el 28-nov: coincide con la medida por Bluetooth y la corrección JVC se cumple con 0,5 dB de error medio. W2a (análisis y propuesta universales: `analisis.py`, `propuesta.py`, `disenar_eq.py`, `pruebas_propuesta.py`) hecha y verificada en la JVC derecha el 28-nov (F3 90 Hz, 0,4 dB de error). W2b (página docs/analizar con Pyodide: mismo resultado que el PC; tras cambiar analisis.py o propuesta.py hay que ejecutar `python medidas/publicar_web.py`) hecha. W2c (asistente paso a paso en docs/asistente, entrada principal) hecha. W3b (el asistente mide solo: micro por Web Audio, nivel automático, órdenes medir/barrido por Web Serial; modo manual en un desplegable) hecha; falta la prueba real en Chrome. R1 hecha y probada en la placa con DAC. W1 (panel en docs/panel) escrita; falta probarla en Chrome con la placa. Probar: `python -m http.server 8032 --bind 127.0.0.1 -d docs` y abrir http://localhost:8032/ (asistente). Protección de acceso Bluetooth: aplazada.
Objetivo: mejorar cualquier altavoz. De fábrica, sin corrección y sin paso alto (R1c); las JVC son el ejemplo 1 (`docs/perfiles/`). La protección se elige al medir cada altavoz (W2/W3), sin rangos fijos de las JVC.
