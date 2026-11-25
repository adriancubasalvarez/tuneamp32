// =====================================================================
// TuneAmp32 — receptor Bluetooth con corrección DSP
//
// El ESP32 aparece como "TuneAmp32". Lo que llega por Bluetooth
// pasa por la corrección DSP (dsp.h) y sale por I2S (Inter-IC Sound) al
// DAC PCM5102A y de ahí al amplificador TPA3116D2.
//
// Fase A: altavoz Bluetooth. Fase B: corrección DSP con refuerzo de
// grave dinámico y limitador, ajustable por el puerto serie (115200
// baudios). Escribe «ayuda» en el monitor serie, o usa
// medidas/dsp.py desde el PC.
//
// Conexión (ver hardware/README.md):
//   DAC BCK -> GPIO 26   DAC LCK -> GPIO 25   DAC DIN -> GPIO 22
//   DAC VIN -> VIN (5 V) DAC GND -> GND
//   Puentes del DAC: H1L, H2L y H4L a GND; H3L a 3,3 V; SCK a GND
// =====================================================================
#include <Arduino.h>
#include <Preferences.h>
#include "AudioTools.h"
#include "BluetoothA2DPSink.h"
#include "dsp.h"
#include "generador.h"

// Pines I2S: ninguno es de arranque (strapping) en el ESP32
constexpr int PIN_BCK  = 26;  // reloj de bit
constexpr int PIN_LCK  = 25;  // canal izquierdo/derecho (word select)
constexpr int PIN_DIN  = 22;  // datos de audio

constexpr const char* NOMBRE_BT = "TuneAmp32";

// ---------------------------------------------------------------- DSP

AjustesDSP ajustes;                  // los que se ven y se cambian por serie
CorreccionDSP correccion;            // los usa la tarea de audio
portMUX_TYPE cerrojo = portMUX_INITIALIZER_UNLOCKED;
volatile bool ajustes_cambiados = true;
Preferences memoria;

// Flujo intermedio: recibe el audio del Bluetooth, lo corrige y lo manda
// al DAC. También se entera de la frecuencia de muestreo de la conexión.
class DspStream : public AudioStream {
 public:
  explicit DspStream(AudioStream& salida) : salida_(salida) {}

  void preparar() { mutex_ = xSemaphoreCreateMutex(); }

  void setAudioInfo(AudioInfo info) override {
    if (midiendo_) {
      if ((int)info.sample_rate == fs_) return;   // nada que cambiar
      cancelar_ = true;                           // otra frecuencia: la medida ya no vale
    }
    xSemaphoreTake(mutex_, portMAX_DELAY);
    AudioStream::setAudioInfo(info);
    salida_.setAudioInfo(info);
    fs_ = info.sample_rate;
    ajustes_cambiados = true;
    xSemaphoreGive(mutex_);
    Serial.printf("Audio: %d Hz, %d canales, %d bits\n", info.sample_rate, info.channels,
                  info.bits_per_sample);
  }

  // Audio del Bluetooth. Mientras se mide, se descarta (la música se calla).
  size_t write(const uint8_t* datos, size_t len) override {
    if (midiendo_) return len;
    xSemaphoreTake(mutex_, portMAX_DELAY);
    if (!midiendo_) escribir(datos, len);
    xSemaphoreGive(mutex_);
    return len;
  }

  // Audio del generador de medida: pasa por la misma corrección
  void escribirMedida(const uint8_t* datos, size_t len) {
    xSemaphoreTake(mutex_, portMAX_DELAY);
    escribir(datos, len);
    xSemaphoreGive(mutex_);
  }

  void empezarMedida() { cancelar_ = false; midiendo_ = true; }
  void terminarMedida() { midiendo_ = false; }
  bool midiendo() const { return midiendo_; }
  bool hayQueCancelar() const { return cancelar_; }

  int frecuencia() const { return fs_; }

  // Porcentaje del tiempo de audio que el procesador dedica al DSP (y lo reinicia)
  float carga() {
    const float c = us_audio_ > 0 ? 100.0f * (float)us_proceso_ / (float)us_audio_ : 0.0f;
    us_proceso_ = us_audio_ = 0;
    return c;
  }

 private:
  // Con el mutex cogido
  void escribir(const uint8_t* datos, size_t len) {
    if (ajustes_cambiados) {
      AjustesDSP copia;
      portENTER_CRITICAL(&cerrojo);
      copia = ajustes;
      ajustes_cambiados = false;
      portEXIT_CRITICAL(&cerrojo);
      correccion.configurar((float)fs_, copia);
    }
    // Se procesa por trozos en un búfer propio (los datos llegan como const)
    size_t hecho = 0;
    while (hecho < len) {
      size_t n = min(len - hecho, sizeof(bufer_));
      n -= n % 4;                    // tramas enteras: 2 canales × 16 bits
      if (n == 0) break;
      memcpy(bufer_, datos + hecho, n);
      const int64_t t0 = esp_timer_get_time();
      correccion.procesar(bufer_, n / 4);
      us_proceso_ += esp_timer_get_time() - t0;
      us_audio_ += (int64_t)(n / 4) * 1000000 / fs_;
      salida_.write((const uint8_t*)bufer_, n);
      hecho += n;
    }
  }

  SemaphoreHandle_t mutex_ = nullptr;
  volatile bool midiendo_ = false, cancelar_ = false;
  AudioStream& salida_;
  int fs_ = 44100;
  int16_t bufer_[512];
  volatile int64_t us_proceso_ = 0, us_audio_ = 0;
};

I2SStream i2s;                       // salida I2S hacia el DAC
DspStream dsp(i2s);
BluetoothA2DPSink a2dp(dsp);         // receptor de audio Bluetooth

// -------------------------------------------------------------- medida

// El PC tiene que mandar algo (por ejemplo «sigo») al menos cada 3 s
// mientras se mide; si no, se entiende que se ha desconectado y se para.
constexpr uint32_t ESPERA_PC_MS = 3000;
// Si entre dos bloques pasa más que esto, el búfer I2S se puede vaciar
constexpr int64_t HUECO_MAX_US = 10000;

Generador generador;                 // solo lo usa la tarea de medida
struct OrdenMedida { Canal canal; float nivel, f_min; };
TaskHandle_t tarea_medida = nullptr;
volatile bool parar_medida = false;
volatile uint32_t ultimo_pc_ms = 0;

void tareaMedida(void*) {
  static int16_t bloque[512];
  for (;;) {
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    const char* motivo = nullptr;
    int64_t hueco = 0, ultimo = 0;
    bool sigue = true;
    while (sigue) {
      if (!motivo) {
        if (parar_medida) motivo = "orden parar";
        else if (dsp.hayQueCancelar()) motivo = "el Bluetooth ha cambiado la frecuencia";
        else if (millis() - ultimo_pc_ms > ESPERA_PC_MS) motivo = "sin noticias del PC";
        if (motivo) generador.parar();
      }
      sigue = generador.generar(bloque, 256);
      const int64_t ahora = esp_timer_get_time();
      if (ultimo && ahora - ultimo > hueco) hueco = ahora - ultimo;
      dsp.escribirMedida((const uint8_t*)bloque, sizeof(bloque));
      ultimo = esp_timer_get_time();
    }
    dsp.terminarMedida();
    if (motivo) Serial.printf("medida cancelada: %s\n", motivo);
    else Serial.printf("medida terminada | hueco %.1f ms%s\n", hueco / 1000.0f,
                       hueco > HUECO_MAX_US ? " | CORTES" : "");
  }
}

// «medir izquierdo -30 30»: canal, nivel de pico (dBFS) y frecuencia mínima (Hz)
void empezarMedida(const String& linea, bool corta) {
  if (dsp.midiendo()) {
    Serial.println("error: ya se está midiendo");
    return;
  }
  char cmd[16], canal[16] = {0};
  OrdenMedida o{Canal::ambos, -30.0f, 30.0f};
  const int n = sscanf(linea.c_str(), "%15s %15s %f %f", cmd, canal, &o.nivel, &o.f_min);
  const String c(canal);
  if (c == "izquierdo") o.canal = Canal::izquierdo;
  else if (c == "derecho") o.canal = Canal::derecho;
  else if (c != "ambos" || n < 2) {
    Serial.println("error: medir izquierdo|derecho|ambos NIVEL FMIN");
    return;
  }
  if (!(o.nivel >= Generador::NIVEL_MIN && o.nivel <= Generador::NIVEL_MAX)) {
    Serial.printf("error: el nivel va de %.0f a %.0f dBFS\n", Generador::NIVEL_MIN, Generador::NIVEL_MAX);
    return;
  }
  if (!(o.f_min >= Generador::FMIN_MIN && o.f_min <= Generador::FMIN_MAX)) {
    Serial.printf("error: la frecuencia minima va de %.0f a %.0f Hz\n", Generador::FMIN_MIN, Generador::FMIN_MAX);
    return;
  }
  dsp.empezarMedida();               // desde aquí la música se calla
  parar_medida = false;
  ultimo_pc_ms = millis();
  generador.empezar(dsp.frecuencia(), o.canal, o.nivel, o.f_min, corta);
  Serial.printf("ok midiendo %s %.1f dBFS desde %.0f Hz | %.1f s | %d Hz\n", c.c_str(), o.nivel,
                o.f_min, generador.duracion(), dsp.frecuencia());
  xTaskNotifyGive(tarea_medida);
}

void cargarAjustes() {
  memoria.begin("dsp", true);
  if (memoria.isKey("ganancia")) {
    ajustes.activo = memoria.getBool("activo", ajustes.activo);
    ajustes.ganancia_db = memoria.getFloat("ganancia", ajustes.ganancia_db);
    ajustes.pasoalto_hz = memoria.getFloat("pasoalto", ajustes.pasoalto_hz);
    ajustes.joroba_hz = memoria.getFloat("joroba_f", ajustes.joroba_hz);
    ajustes.joroba_db = memoria.getFloat("joroba_g", ajustes.joroba_db);
    ajustes.joroba_q = memoria.getFloat("joroba_q", ajustes.joroba_q);
    ajustes.grave_hz = memoria.getFloat("grave_f", ajustes.grave_hz);
    ajustes.grave_db = memoria.getFloat("grave_g", ajustes.grave_db);
    ajustes.grave_q = memoria.getFloat("grave_q", ajustes.grave_q);
    ajustes.limitador = memoria.getBool("limitador", ajustes.limitador);
    ajustes.graves_max_db = memoria.getFloat("graves_max", ajustes.graves_max_db);
    ajustes.techo_db = memoria.getFloat("techo", ajustes.techo_db);
    Serial.println("DSP: ajustes cargados de la memoria");
  } else {
    Serial.println("DSP: ajustes de fábrica");
  }
  memoria.end();
}

void guardarAjustes() {
  memoria.begin("dsp", false);
  memoria.putBool("activo", ajustes.activo);
  memoria.putFloat("ganancia", ajustes.ganancia_db);
  memoria.putFloat("pasoalto", ajustes.pasoalto_hz);
  memoria.putFloat("joroba_f", ajustes.joroba_hz);
  memoria.putFloat("joroba_g", ajustes.joroba_db);
  memoria.putFloat("joroba_q", ajustes.joroba_q);
  memoria.putFloat("grave_f", ajustes.grave_hz);
  memoria.putFloat("grave_g", ajustes.grave_db);
  memoria.putFloat("grave_q", ajustes.grave_q);
  memoria.putBool("limitador", ajustes.limitador);
  memoria.putFloat("graves_max", ajustes.graves_max_db);
  memoria.putFloat("techo", ajustes.techo_db);
  memoria.end();
  Serial.println("ok guardado");
}

void mostrar() {
  Serial.printf("dsp %s | ganancia %.1f dB | pasoalto %.0f Hz | joroba %.0f Hz %.1f dB Q %.2f"
                " | grave %.0f Hz %.1f dB Q %.2f | limitador %s, gravesmax %.1f dB, techo %.1f dB"
                " | %d Hz\n",
                ajustes.activo ? "on" : "off", ajustes.ganancia_db, ajustes.pasoalto_hz,
                ajustes.joroba_hz, ajustes.joroba_db, ajustes.joroba_q, ajustes.grave_hz,
                ajustes.grave_db, ajustes.grave_q, ajustes.limitador ? "on" : "off",
                ajustes.graves_max_db, ajustes.techo_db, dsp.frecuencia());
}

// Lo que ha pasado desde la última consulta
void estado() {
  const EstadoDSP e = correccion.leerEstado();
  Serial.printf("pico %.1f dBFS | grave reducido hasta %.1f dB | limitador hasta %.1f dB"
                " | recortes %u | carga %.1f %%\n",
                e.pico_dbfs, e.reduccion_graves_db, e.reduccion_limitador_db,
                (unsigned)e.recortes, dsp.carga());
}

void ayuda() {
  Serial.println(
      "Comandos:\n"
      "  ver                     ajustes y estado desde la última consulta\n"
      "  estado                  picos, reducción del limitador y carga del procesador\n"
      "  dsp on | dsp off        corrección activada / solo ganancia previa y limitador\n"
      "  ganancia DB             ganancia previa (negativa, p. ej. -7)\n"
      "  pasoalto HZ             paso alto de protección (0 = quitar)\n"
      "  joroba HZ DB Q          filtro que baja la resonancia (p. ej. 167 -9.8 2.1)\n"
      "  grave HZ DB Q           filtro que refuerza el grave (p. ej. 75 9 0.9)\n"
      "  limitador on | off      refuerzo de grave dinámico y limitador final\n"
      "  gravesmax DB            grave a partir del que se reduce el refuerzo (p. ej. -6)\n"
      "  techo DB                nivel máximo de salida (p. ej. -1)\n"
      "  medir CANAL DBFS HZ     senal de medida (p. ej. medir izquierdo -30 30)\n"
      "  barrido CANAL DBFS HZ   un solo barrido, para comprobar el nivel\n"
      "  parar                   para la medida (manda «sigo» cada segundo para que no se pare)\n"
      "  guardar                 guarda los ajustes (se mantienen al apagar)\n"
      "  fabrica                 vuelve a los ajustes de fábrica (sin guardar)");
}

// Interpreta una línea recibida por el puerto serie
void orden(String linea) {
  linea.trim();
  if (linea.isEmpty()) return;
  char cmd[16] = {0};
  float a = 0, b = 0, c = 0;
  int n = sscanf(linea.c_str(), "%15s %f %f %f", cmd, &a, &b, &c);
  String s(cmd);
  AjustesDSP nuevo = ajustes;
  if (s == "ver") {
    mostrar();
    estado();
    return;
  } else if (s == "estado") {
    estado();
    return;
  } else if (s == "ayuda" || s == "help") {
    ayuda();
    return;
  } else if (s == "medir" || s == "barrido") {
    empezarMedida(linea, s == "barrido");
    return;
  } else if (s == "parar") {
    if (dsp.midiendo()) parar_medida = true;
    Serial.println("ok parar");
    return;
  } else if (s == "sigo") {
    return;                          // solo renueva la espera
  } else if (s == "dsp") {
    nuevo.activo = linea.endsWith("on");
  } else if (s == "ganancia" && n >= 2) {
    nuevo.ganancia_db = constrain(a, -30.0f, 6.0f);
  } else if (s == "pasoalto" && n >= 2) {
    nuevo.pasoalto_hz = constrain(a, 0.0f, 500.0f);
  } else if (s == "joroba" && n >= 4) {
    nuevo.joroba_hz = a;
    nuevo.joroba_db = constrain(b, -20.0f, 12.0f);
    nuevo.joroba_q = constrain(c, 0.1f, 10.0f);
  } else if (s == "grave" && n >= 4) {
    nuevo.grave_hz = a;
    nuevo.grave_db = constrain(b, -20.0f, 12.0f);
    nuevo.grave_q = constrain(c, 0.1f, 10.0f);
  } else if (s == "limitador") {
    nuevo.limitador = linea.endsWith("on");
  } else if (s == "gravesmax" && n >= 2) {
    nuevo.graves_max_db = constrain(a, -40.0f, 0.0f);
  } else if (s == "techo" && n >= 2) {
    nuevo.techo_db = constrain(a, -20.0f, 0.0f);
  } else if (s == "guardar") {
    guardarAjustes();
    return;
  } else if (s == "fabrica") {
    nuevo = AjustesDSP();
  } else {
    Serial.println("error: comando desconocido (escribe «ayuda»)");
    return;
  }
  portENTER_CRITICAL(&cerrojo);
  ajustes = nuevo;
  ajustes_cambiados = true;
  portEXIT_CRITICAL(&cerrojo);
  Serial.print("ok ");
  mostrar();
}

// ------------------------------------------------------------ Bluetooth

// Se llama al conectar o desconectar un móvil
void alCambiarConexion(esp_a2d_connection_state_t estado, void*) {
  Serial.printf("Bluetooth: %s\n", a2dp.to_str(estado));
}

// Se llama cuando el móvil cambia el volumen (0–127)
void alCambiarVolumen(int volumen) {
  Serial.printf("Volumen del móvil: %d/127\n", volumen);
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\nTuneAmp32 - Bluetooth con DSP");
  cargarAjustes();
  dsp.preparar();
  xTaskCreatePinnedToCore(tareaMedida, "medida", 4096, nullptr, 5, &tarea_medida, 1);

  auto cfg = i2s.defaultConfig(TX_MODE);
  cfg.pin_bck  = PIN_BCK;
  cfg.pin_ws   = PIN_LCK;
  cfg.pin_data = PIN_DIN;
  i2s.begin(cfg);

  a2dp.set_on_connection_state_changed(alCambiarConexion);
  a2dp.set_on_volumechange(alCambiarVolumen);
  a2dp.set_auto_reconnect(true);     // vuelve a conectar con el último móvil
  a2dp.start(NOMBRE_BT);

  Serial.printf("Listo: busca \"%s\" en el Bluetooth del móvil\n", NOMBRE_BT);
  mostrar();
  Serial.println("Escribe «ayuda» para ver los comandos del DSP");
}

void loop() {
  static String linea;
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n' || ch == '\r') {
      ultimo_pc_ms = millis();
      orden(linea);
      linea = "";
    } else if (linea.length() < 80) {
      linea += ch;
    }
  }
  delay(10);
}
