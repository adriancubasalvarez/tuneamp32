# TuneAmp32: contexto para Claude Code

Lee `docs/TUNEAMP32_ARRANQUE.md` entero antes de proponer nada.

1. Primero propón un plan y espera la autorización explícita. Una fase cada vez.
2. Responde siempre en español.
3. Escribe el significado de cada sigla la primera vez en cada respuesta.
4. No inventes pines ni datos del hardware: si no están en el código o la documentación, pregunta.
5. Cambios pequeños y verificables: cada fase compila y se prueba en la placa real.
6. `main` de Radio Mundial no se toca.

Estado: W1b (ayuda en docs/ayuda) hecha. W3a (el ESP32 genera la señal, `medir.py --usb`) hecha; falta la prueba acústica con micro. Siguiente: W2, análisis en el navegador. R1 hecha y probada en la placa con DAC. W1 (panel en docs/panel) escrita; falta probarla en Chrome con la placa. Probar: `python -m http.server 8032 --bind 127.0.0.1 -d docs` y abrir http://localhost:8032/panel/. Protección de acceso Bluetooth: aplazada.
Objetivo: mejorar cualquier altavoz. De fábrica, sin corrección y sin paso alto (R1c); las JVC son el ejemplo 1 (`docs/perfiles/`). La protección se elige al medir cada altavoz (W2/W3), sin rangos fijos de las JVC.
