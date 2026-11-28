// Conexión con el ESP32 por Web Serial. Una orden cada vez, esperando respuesta.

const ESPERA_MS = 2000;

export class Serie {
  constructor({ alRecibir, alCerrar }) {
    this.alRecibir = alRecibir;
    this.alCerrar = alCerrar;
    this.cola = Promise.resolve();
    this.espera = null;
    this.oyentes = new Set();
    this.abierto = false;
  }

  static disponible() { return "serial" in navigator; }

  // Puertos que el navegador ya ha autorizado antes (se reabren sin preguntar)
  static async conocidos() {
    try { return await navigator.serial.getPorts(); } catch { return []; }
  }

  async abrir(puerto = null) {
    this.puerto = puerto ?? await navigator.serial.requestPort();
    await this.puerto.open({ baudRate: 115200 });
    // Primero RTS y luego DTR: en el otro orden, el circuito de reinicio
    // automático de la placa reiniciaría el ESP32 y cortaría el Bluetooth.
    try {
      await this.puerto.setSignals({ requestToSend: false });
      await this.puerto.setSignals({ dataTerminalReady: false });
    } catch { /* algunos conversores no lo admiten */ }
    this.abierto = true;
    this.lectura = this.#leer();
  }

  async #leer() {
    const decodificador = new TextDecoder();
    let resto = "";
    try {
      while (this.abierto && this.puerto.readable) {
        this.lector = this.puerto.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.lector.read();
            if (done) break;
            resto += decodificador.decode(value, { stream: true });
            const lineas = resto.split(/\r?\n/);
            resto = lineas.pop().slice(-500);
            for (const l of lineas) if (l.trim()) this.#linea(l.trim());
          }
        } finally { this.lector.releaseLock(); }
      }
    } catch { /* cable desconectado o error de lectura */ }
    if (this.abierto) {                     // no lo hemos cerrado nosotros
      this.abierto = false;
      this.#fallarEspera("desconectado");
      try { await this.puerto.close(); } catch { /* ya cerrado */ }
      this.alCerrar();
    }
  }

  #linea(l) {
    const e = this.espera;
    if (e && l.startsWith("error:")) { this.espera = null; e.mal(new Error(l)); }
    else if (e && e.vale(l)) { this.espera = null; e.bien(l); }
    for (const o of [...this.oyentes]) if (o.vale(l)) { this.oyentes.delete(o); o.bien(l); }
    this.alRecibir(l);
  }

  #fallarEspera(motivo) {
    const e = this.espera;
    this.espera = null;
    e?.mal(new Error(motivo));
    for (const o of [...this.oyentes]) { this.oyentes.delete(o); o.mal(new Error(motivo)); }
  }

  // Espera una línea que cumpla «vale», sin mandar nada (por ejemplo, el final
  // de una medida). Falla si pasan «ms» o se cierra la conexión.
  oir(vale, ms) {
    return new Promise((bien, mal) => {
      const o = { vale, bien: (l) => { clearTimeout(reloj); bien(l); }, mal: (e) => { clearTimeout(reloj); mal(e); } };
      const reloj = setTimeout(() => { this.oyentes.delete(o); mal(new Error("sin respuesta")); }, ms);
      this.oyentes.add(o);
    });
  }

  // Manda una línea sin esperar respuesta (como «sigo» durante una medida)
  mandar(texto) {
    const tarea = this.cola.then(async () => {
      if (!this.abierto) throw new Error("desconectado");
      const w = this.puerto.writable.getWriter();
      try { await w.write(new TextEncoder().encode(texto + "\n")); } finally { w.releaseLock(); }
    });
    this.cola = tarea.catch(() => {});
    return tarea;
  }

  // Manda una orden y espera la línea que cumpla «vale» (por defecto, «ok ...»).
  orden(texto, vale = (l) => l.startsWith("ok ")) {
    const tarea = this.cola.then(() => this.#enviar(texto, vale));
    this.cola = tarea.catch(() => {});
    return tarea;
  }

  async #enviar(texto, vale) {
    if (!this.abierto) throw new Error("desconectado");
    let reloj;
    const respuesta = new Promise((bien, mal) => {
      this.espera = { vale, bien, mal };
      reloj = setTimeout(() => this.#fallarEspera("sin respuesta"), ESPERA_MS);
    });
    respuesta.catch(() => {});
    const w = this.puerto.writable.getWriter();
    try { await w.write(new TextEncoder().encode(texto + "\n")); }
    finally { w.releaseLock(); }
    try { return await respuesta; } finally { clearTimeout(reloj); }
  }

  async cerrar() {
    if (!this.abierto) return;
    this.abierto = false;
    this.#fallarEspera("desconectado");
    try { await this.lector?.cancel(); } catch { /* da igual */ }
    await this.lectura;
    try { await this.puerto.close(); } catch { /* da igual */ }
    this.alCerrar();
  }
}
