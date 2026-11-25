#include "generador.h"

#include <math.h>

// Los mismos valores que medidas/comun.py
static constexpr double F1 = 16.0, F2 = 22000.0, T_BARRIDO = 8.0;
static constexpr float HUECO_BARRIDO = 3.0f, SILENCIO_INICIAL = 2.0f, SILENCIO_FINAL = 2.0f;
static constexpr float SILENCIO_ANTES_TONOS = 1.0f, T_TONO = 1.5f, HUECO_TONO = 0.3f;
static constexpr int N_BARRIDOS = 3, N_TONOS = 17;
static constexpr double DOS_PI = 6.283185307179586;
static constexpr float PI_F = 3.14159265f;

static uint32_t muestras(float s, int fs) { return (uint32_t)lrintf(s * (float)fs); }

void Generador::empezar(int fs, Canal canal, float nivel_dbfs, float f_min, bool corta) {
  fs_ = fs;
  canal_ = canal;
  corta_ = corta;
  if (nivel_dbfs > NIVEL_MAX) nivel_dbfs = NIVEL_MAX;
  if (nivel_dbfs < NIVEL_MIN) nivel_dbfs = NIVEL_MIN;
  amplitud_ = powf(10.0f, nivel_dbfs / 20.0f) * 32768.0f;
  f_min_ = f_min < FMIN_MIN ? FMIN_MIN : f_min > FMIN_MAX ? FMIN_MAX : f_min;
  parando_ = fin_ = false;
  apagado_ = 1;
  paso_ = -1;
  siguiente();
}

float Generador::duracion() const {
  if (corta_) return 0.5f + (float)T_BARRIDO + 0.5f;
  return SILENCIO_INICIAL + N_BARRIDOS * ((float)T_BARRIDO + HUECO_BARRIDO) +
         SILENCIO_ANTES_TONOS + N_TONOS * (T_TONO + HUECO_TONO) + SILENCIO_FINAL;
}

void Generador::nuevoTramo(uint32_t n, float frecuencia, bool es_barrido) {
  n_ = n;
  i_ = 0;
  barrido_ = es_barrido;
  suena_ = es_barrido || frecuencia > 0;
  mudo_ = rampa_ = 0;
  fase_ = 0;
  if (es_barrido) {
    // fase(t) = 2·pi·F1·L·(e^(t/L) - 1): sus incrementos crecen siempre en la
    // misma proporción, así que basta una multiplicación por muestra.
    const double L = T_BARRIDO / log(F2 / F1);
    razon_ = exp(1.0 / (fs_ * L));
    incremento_ = DOS_PI * F1 * L * (razon_ - 1.0);
    ini_ = muestras(0.05f, fs_);
    fin_fundido_ = muestras(0.01f, fs_);
    if (f_min_ > F1 * 1.001) {
      // Silencio hasta 1/3 de octava por debajo de f_min y subida suave
      const double t_min = L * log((double)f_min_ / F1);
      const double t_ini = t_min - L * log(2.0) / 3.0;
      mudo_ = t_ini > 0 ? (uint32_t)(t_ini * fs_) : 0;
      rampa_ = (uint32_t)(t_min * fs_) - mudo_;
    }
  } else if (suena_) {
    razon_ = 1.0;
    incremento_ = DOS_PI * frecuencia / fs_;
    ini_ = fin_fundido_ = muestras(0.02f, fs_);
  }
}

void Generador::siguiente() {
  paso_++;
  if (corta_) {
    if (paso_ == 1) nuevoTramo(muestras((float)T_BARRIDO, fs_), 0, true);
    else if (paso_ <= 2) nuevoTramo(muestras(0.5f, fs_), 0, false);
    else fin_ = true;
    return;
  }
  int p = paso_;
  if (p == 0) return nuevoTramo(muestras(SILENCIO_INICIAL, fs_), 0, false);
  p -= 1;
  if (p < 2 * N_BARRIDOS) {
    if (p % 2 == 0) return nuevoTramo(muestras((float)T_BARRIDO, fs_), 0, true);
    return nuevoTramo(muestras(HUECO_BARRIDO, fs_), 0, false);
  }
  p -= 2 * N_BARRIDOS;
  if (p == 0) return nuevoTramo(muestras(SILENCIO_ANTES_TONOS, fs_), 0, false);
  p -= 1;
  if (p < 2 * N_TONOS) {
    if (p % 2) return nuevoTramo(muestras(HUECO_TONO, fs_), 0, false);
    const float f = 30.0f * powf(2.0f, (p / 2) / 6.0f);
    return nuevoTramo(muestras(T_TONO, fs_), f >= f_min_ * 0.999f ? f : 0, false);
  }
  p -= 2 * N_TONOS;
  if (p == 0) return nuevoTramo(muestras(SILENCIO_FINAL, fs_), 0, false);
  fin_ = true;
}

float Generador::muestra() {
  if (!suena_) return 0;
  float env = 1;
  if (i_ < ini_) env = 0.5f - 0.5f * cosf(PI_F * i_ / ini_);
  else if (i_ >= n_ - fin_fundido_) env = 0.5f + 0.5f * cosf(PI_F * (i_ - (n_ - fin_fundido_)) / fin_fundido_);
  if (i_ < mudo_) env = 0;
  else if (i_ < mudo_ + rampa_) env *= 0.5f - 0.5f * cosf(PI_F * (i_ - mudo_) / rampa_);
  const float x = env > 0 ? env * sinf((float)fase_) : 0;
  fase_ += incremento_;
  if (fase_ >= DOS_PI) fase_ -= DOS_PI;
  incremento_ *= razon_;
  if (env == 0) return 0;
  // Ruido de redondeo triangular (TPDF), como en los WAV de los scripts
  azar_ = azar_ * 1664525u + 1013904223u;
  const float r1 = (azar_ >> 16) / 65536.0f;
  azar_ = azar_ * 1664525u + 1013904223u;
  return amplitud_ * x + r1 - (azar_ >> 16) / 65536.0f;
}

bool Generador::generar(int16_t* salida, size_t tramas) {
  for (size_t k = 0; k < tramas; k++) {
    while (!fin_ && i_ >= n_) siguiente();
    if (fin_) {
      salida[2 * k] = salida[2 * k + 1] = 0;
      continue;
    }
    float x = muestra() * apagado_;
    i_++;
    if (parando_) {
      apagado_ -= 50.0f / fs_;             // 20 ms
      if (apagado_ <= 0) { apagado_ = 0; fin_ = true; }
    }
    if (x > 32767) x = 32767;
    if (x < -32768) x = -32768;
    const int16_t s = (int16_t)lrintf(x);
    salida[2 * k] = canal_ == Canal::derecho ? 0 : s;
    salida[2 * k + 1] = canal_ == Canal::izquierdo ? 0 : s;
  }
  return !fin_;
}
