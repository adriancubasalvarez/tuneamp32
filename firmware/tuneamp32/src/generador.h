// =====================================================================
// Generador de la señal de medida: la misma sesión que crea
// medidas/generar_senales.py, pero hecha en el propio ESP32. Así se puede
// medir sin Bluetooth en el PC.
//
//   2 s de silencio, 3 barridos exponenciales de 16 Hz a 22 kHz (8 s y 3 s
//   de silencio cada uno), 1 s de silencio, 17 tonos de 30 a 190 Hz (1,5 s
//   y 0,3 s de silencio cada uno) y 2 s de silencio.
//
// «f_min» protege a los altavoces pequeños: el barrido conserva su ritmo
// (para que el análisis no cambie), pero está en silencio hasta esa
// frecuencia, y los tonos más graves no suenan.
//
// No depende de ninguna librería: se puede compilar y comprobar en el PC.
// =====================================================================
#pragma once

#include <stddef.h>
#include <stdint.h>

enum class Canal : uint8_t { izquierdo, derecho, ambos };

class Generador {
 public:
  static constexpr float NIVEL_MIN = -60.0f, NIVEL_MAX = -6.0f;   // pico, dBFS
  static constexpr float FMIN_MIN = 16.0f, FMIN_MAX = 200.0f;     // Hz

  // «corta»: un solo barrido, para comprobar el nivel (9 s)
  void empezar(int fs, Canal canal, float nivel_dbfs, float f_min, bool corta);
  // Rellena «tramas» tramas estéreo de 16 bits. Devuelve false al terminar.
  bool generar(int16_t* salida, size_t tramas);
  // Termina en silencio en unos 20 ms (sin golpe)
  void parar() { parando_ = true; }
  float duracion() const;          // segundos

 private:
  void siguiente();
  void nuevoTramo(uint32_t muestras, float frecuencia, bool barrido);
  float muestra();

  int fs_ = 44100;
  Canal canal_ = Canal::ambos;
  bool corta_ = false, parando_ = false, fin_ = true;
  float amplitud_ = 0, f_min_ = 16, apagado_ = 1;
  int paso_ = 0;                   // tramo de la sesión
  uint32_t n_ = 0, i_ = 0;         // muestras del tramo y muestra actual
  bool suena_ = false, barrido_ = false;
  double fase_ = 0, incremento_ = 0, razon_ = 1;
  uint32_t ini_ = 0, fin_fundido_ = 0, mudo_ = 0, rampa_ = 0;
  uint32_t azar_ = 1;
};
