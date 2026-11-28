"""Cálculo del análisis de una grabación de medida (sin gráficos).

Lo usan analizar.py (informes en el PC) y la página web (con Pyodide).
Solo necesita numpy.
"""
import datetime
import pathlib

import numpy as np

from comun import (AMPLITUD, F1, F2, FS, HUECO_TONO, L_BARRIDO, N_BARRIDOS,
                   PERIODO_BARRIDO, T_TONO, TONOS, barrido, inicio_tonos, leer_wav)

NFFT = 1 << 18                       # resolución de 0,18 Hz
F_SALIDA = 20.0 * 2 ** (np.arange(0, 480) / 48)   # 20 Hz .. 20 kHz, 1/48 de octava
ARMONICOS = (2, 3, 4, 5)

# Comprobaciones (campo cercano)
REBOTES_MAX_DB = -12.0      # energía de 5 a 50 ms frente al sonido directo
THD_MAX = 10.0              # % de distorsión en un tono para dar el aviso
HUECO_REFLEX_DB = 6.0       # hueco estrecho bajo el modelo de caja cerrada


# ----------------------------------------------------------------- utilidades

def suavizar(f_lin, p_lin, f_out, fraccion=6):
    """Media de potencia en bandas de 1/fraccion de octava centradas en f_out."""
    acum = np.concatenate([[0.0], np.cumsum(p_lin)])
    lo = np.searchsorted(f_lin, f_out * 2 ** (-0.5 / fraccion))
    hi = np.searchsorted(f_lin, f_out * 2 ** (0.5 / fraccion))
    lo = np.minimum(lo, len(p_lin) - 1)
    hi = np.minimum(np.maximum(hi, lo + 1), len(p_lin))
    return (acum[hi] - acum[lo]) / (hi - lo)


def db(p):
    return 10 * np.log10(np.maximum(p, 1e-30))


def ventana(n_pre, n_post, caida=0.5):
    """Media Hann de subida en n_pre muestras, plana y media Hann de bajada
    en la última fracción «caida» de n_post."""
    sube = 0.5 - 0.5 * np.cos(np.pi * np.arange(n_pre) / max(n_pre, 1))
    n_baja = max(int(n_post * caida), 1)
    baja = 0.5 + 0.5 * np.cos(np.pi * np.arange(n_baja) / n_baja)
    return np.concatenate([sube, np.ones(n_post - n_baja), baja])


def trozo(h, centro, n_pre, n_post, caida=0.5):
    ini = centro - n_pre
    seg = np.zeros(n_pre + n_post)
    a, b = max(ini, 0), min(ini + n_pre + n_post, len(h))
    if b > a:
        seg[a - ini:b - ini] = h[a:b]
    return seg * ventana(n_pre, n_post, caida)


def espectro(seg):
    return np.abs(np.fft.rfft(seg, NFFT)) ** 2


F_LIN = np.fft.rfftfreq(NFFT, 1 / FS)


def modelo_paso_alto(f, fc, q):
    """Magnitud en dB de un paso alto de 2º orden (caja cerrada)."""
    x = f / fc
    return 20 * np.log10(x ** 2 / np.sqrt((1 - x ** 2) ** 2 + (x / q) ** 2))


def ajustar_caja(f, nivel, f_lo, f_hi):
    """Busca fc y Qtc del paso alto de 2º orden que mejor encaja con la curva."""
    m = (f >= f_lo) & (f <= f_hi)
    fm, nm = f[m], nivel[m]
    fcs = np.geomspace(25, 300, 400)
    qs = np.linspace(0.3, 5.0, 471)
    # Por filas de fc, para no necesitar cientos de MB de memoria a la vez
    mejor = (np.inf, 0, 0, 0.0)
    for fc in fcs:
        x = fm[None, :] / fc
        mod = 20 * np.log10(x ** 2 / np.sqrt((1 - x ** 2) ** 2 + (x / qs[:, None]) ** 2))
        g = np.mean(nm[None, :] - mod, axis=1)
        err = np.sqrt(np.mean((nm[None, :] - mod - g[:, None]) ** 2, axis=1))
        j = int(np.argmin(err))
        if err[j] < mejor[0]:
            mejor = (float(err[j]), float(fc), float(qs[j]), float(g[j]))
    return dict(fc=mejor[1], qtc=mejor[2], ganancia=mejor[3], error_db=mejor[0], f_lo=f_lo, f_hi=f_hi)


def cruce_por_debajo(f, nivel, umbral, f_desde):
    """Primera frecuencia, bajando desde f_desde, en la que la curva cae por
    debajo de «umbral» (interpolada). None si no cae."""
    idx = np.where(f <= f_desde)[0][::-1]
    for a, b in zip(idx[:-1], idx[1:]):          # a: más aguda, b: más grave
        if nivel[a] >= umbral > nivel[b]:
            t = (nivel[a] - umbral) / (nivel[a] - nivel[b])
            return float(f[a] * (f[b] / f[a]) ** t)
    return None


# ----------------------------------------------------------------- análisis

def remuestrear(y, m):
    """Cambia el número de muestras de y a m en el dominio de la frecuencia
    (sin la pérdida de agudos de una interpolación lineal)."""
    n = len(y)
    Y = np.fft.rfft(y)
    k = min(len(Y), m // 2 + 1)
    return np.fft.irfft(Y[:k], m) * (m / n)


def cargar(ruta, canal):
    x, fs = leer_wav(ruta)
    if canal is None:
        canal = int(np.argmax(np.sum(x ** 2, axis=0)))
    y = x[:, canal]
    avisos = []
    if fs != FS:
        avisos.append(f"La grabación está a {fs} Hz; se ha convertido a {FS} Hz.")
        y = remuestrear(y, int(round(len(y) * FS / fs)))
    pico = float(np.max(np.abs(y)))
    saturadas = int(np.sum(np.abs(y) >= 0.98))
    if saturadas > 10:
        avisos.append(f"SATURACIÓN: {saturadas} muestras tocan el máximo. Baja el volumen "
                      "o aleja el micrófono y repite la medida.")
    elif pico < 0.01:
        avisos.append("Nivel de grabación muy bajo (pico < -40 dBFS): sube el volumen.")
    return y, fs, canal, pico, avisos


def deconvolucionar(y):
    """Respuesta al impulso de toda la grabación frente al barrido (división
    espectral regularizada). Los barridos aparecen como picos y la distorsión
    armónica como picos más pequeños justo antes de cada uno."""
    ref = AMPLITUD * barrido()
    n = 1 << int(np.ceil(np.log2(len(y) + len(ref))))
    X = np.fft.rfft(ref, n)
    Y = np.fft.rfft(y, n)
    f = np.fft.rfftfreq(n, 1 / FS)
    p = np.abs(X) ** 2
    banda = (f >= F1 * 1.2) & (f <= min(F2, FS / 2) * 0.97)
    eps = np.where(banda, 1e-6, 1e3) * np.max(p[banda])
    return np.fft.irfft(Y * np.conj(X) / (p + eps), n)


def buscar_barridos(h):
    """Posición de los picos de los barridos y relación de relojes."""
    env = np.abs(h)
    p = int(np.argmax(env))
    paso = PERIODO_BARRIDO * FS
    margen = int(0.2 * FS)
    candidatos = []
    for k in range(-(N_BARRIDOS - 1), N_BARRIDOS):
        c = int(round(p + k * paso))
        a, b = max(c - margen, 0), min(c + margen, len(h))
        if b - a < margen:
            continue
        q = a + int(np.argmax(env[a:b]))
        if env[q] > 0.3 * env[p]:
            candidatos.append(q)
    candidatos = sorted(set(candidatos))
    # Nos quedamos con la serie de N_BARRIDOS consecutivos que contenga p
    picos = [q for q in candidatos if abs(q - p) <= (N_BARRIDOS - 1) * paso + margen]
    picos = picos[:N_BARRIDOS]
    relacion = 1.0
    if len(picos) >= 2:
        relacion = (picos[-1] - picos[0]) / ((len(picos) - 1) * paso)
    return picos, relacion


def espectro_medio(h, centros, n_pre, n_post, caida=0.5):
    """Media de la potencia de los barridos. Se promedia la potencia y no la
    forma de onda porque los picos no caen en muestras exactas (los relojes
    no coinciden) y promediar ondas desfasadas se comería los agudos."""
    return np.mean([espectro(trozo(h, c, n_pre, n_post, caida)) for c in centros], axis=0)


def analizar_tonos(y, inicio, relacion):
    filas = []
    for j, f in enumerate(TONOS):
        t0 = inicio + relacion * (inicio_tonos() + j * (T_TONO + HUECO_TONO)) * FS
        a = int(t0 + 0.3 * FS)
        n = int(1.0 * FS)
        if a + n > len(y) or a < 0:
            break
        seg = y[a:a + n] * np.hanning(n)
        nf = 4 * FS
        P = np.abs(np.fft.rfft(seg, nf)) ** 2
        fr = np.fft.rfftfreq(nf, 1 / FS)
        f_real = f / relacion
        m = (fr > f_real * 0.97) & (fr < f_real * 1.03)
        f0 = fr[m][np.argmax(P[m])]

        def potencia(fx, ancho=3.0):
            mm = (fr > fx - ancho) & (fr < fx + ancho)
            return float(np.sum(P[mm]))

        p1 = potencia(f0)
        armonicos = [potencia(k * f0) for k in ARMONICOS]
        util = (fr >= 15) & (fr <= 20000)
        total = float(np.sum(P[util]))
        filas.append(dict(f=f, nivel_db=db(p1), thd=100 * np.sqrt(sum(armonicos) / p1),
                          thd_n=100 * np.sqrt(max(total - p1, 0) / p1),
                          h2_db=db(armonicos[0] / p1), h3_db=db(armonicos[1] / p1)))
    return filas


def analizar(ruta, nombre, tipo, ventana_ms, canal, f_max_cerca, f_min_medida=0.0):
    y, fs_orig, canal, pico, avisos = cargar(ruta, canal)
    h = deconvolucionar(y)
    picos, relacion = buscar_barridos(h)
    if not picos:
        raise SystemExit("No encuentro los barridos en la grabación.")
    if abs(relacion - 1) > 5e-6:
        # Los relojes del ESP32 y de la grabadora no van exactamente igual:
        # se corrige la velocidad de la grabación para no perder agudos.
        ppm_medida = (relacion - 1) * 1e6
        y = remuestrear(y, int(round(len(y) / relacion)))
        h = deconvolucionar(y)
        picos, relacion = buscar_barridos(h)
        relacion_total = (1 + ppm_medida * 1e-6) * relacion
    else:
        relacion_total = relacion
    if len(picos) < N_BARRIDOS:
        avisos.append(f"Solo se han encontrado {len(picos)} de {N_BARRIDOS} barridos.")
    rebotes = medir_rebotes(h, picos[0])
    if tipo == "cerca" and rebotes > REBOTES_MAX_DB:
        avisos.append(f"El micrófono oye casi tanto la habitación como el altavoz ({rebotes:+.0f} dB "
                      "de rebotes). Ponlo a 1 cm del centro del cono del altavoz que suena "
                      "(¿está en el otro canal?).")
    ppm = (relacion_total - 1) * 1e6

    # Respuesta en frecuencia
    if tipo == "cerca":
        n_pre, n_post, caida = int(0.005 * FS), int(0.15 * FS), 0.5
        f_min, f_max = 20.0, f_max_cerca
    elif tipo == "lejos":
        n_pre, n_post, caida = int(0.001 * FS), int(ventana_ms / 1000 * FS), 0.3
        f_min, f_max = 1000.0 / ventana_ms, 20000.0
    else:
        n_pre, n_post, caida = int(0.005 * FS), int(0.3 * FS), 0.5
        f_min, f_max = 20.0, 20000.0
    f_min = max(f_min, f_min_medida)     # la señal no sonó por debajo
    p1 = espectro_medio(h, picos, n_pre, n_post, caida)
    nivel_abs = db(suavizar(F_LIN, p1, F_SALIDA))

    # Ruido: un tramo de la respuesta lejos de barridos y armónicos
    c_ruido = picos[0] + int(1.0 * FS)
    ruido = db(suavizar(F_LIN, espectro(trozo(h, c_ruido, n_pre, n_post, caida)), F_SALIDA))
    banda_snr = (F_SALIDA >= max(f_min, 100)) & (F_SALIDA <= min(f_max, 5000))
    snr = float(np.median(nivel_abs[banda_snr] - ruido[banda_snr]))
    if snr < 30:
        avisos.append(f"Relación señal/ruido baja ({snr:.0f} dB): sube el volumen o "
                      "reduce el ruido de la habitación.")

    # Referencia de 0 dB y ajuste de la caja
    caja = None
    valida = (F_SALIDA >= f_min) & (F_SALIDA <= f_max)
    zona_ref = None
    if tipo == "cerca":
        lo = max(50.0, f_min)
        caja = ajustar_caja(F_SALIDA, nivel_abs, lo, min(600.0, f_max))
        if caja["fc"] > 150 and f_max > 600:   # resonancia alta: ajustar más arriba
            caja = ajustar_caja(F_SALIDA, nivel_abs, lo, min(4 * caja["fc"], f_max))
        # 0 dB = nivel medio de la zona plana por encima de la resonancia
        # (de 250 a 600 Hz en un altavoz normal; más arriba si resuena alto)
        zona_ref = [max(250.0, 1.6 * caja["fc"]), min(max(600.0, 3.5 * caja["fc"]), f_max)]
        if zona_ref[1] / zona_ref[0] < 1.5:
            zona_ref[0] = zona_ref[1] / 1.5
            avisos.append("La medida no llega bien a la zona plana por encima de la resonancia: "
                          "la referencia de 0 dB es aproximada.")
        zona = (F_SALIDA >= zona_ref[0]) & (F_SALIDA <= zona_ref[1])
        ref = float(np.mean(nivel_abs[zona]))
        caja["desplaz_db"] = caja["ganancia"] - ref
    else:
        zona = valida & (F_SALIDA >= max(300, f_min)) & (F_SALIDA <= 3000)
        ref = float(np.mean(nivel_abs[zona])) if np.any(zona) else float(np.max(nivel_abs))
    nivel = nivel_abs - ref
    ruido_rel = ruido - ref

    joroba = None
    if caja:
        m = (F_SALIDA >= caja["fc"] / 2) & (F_SALIDA <= caja["fc"] * 2) & valida
        if np.any(m):
            i = int(np.argmax(np.where(m, nivel, -99)))
            if nivel[i] > 1.5:
                joroba = dict(f=float(F_SALIDA[i]), db=float(nivel[i]))

    reflex = buscar_reflex(nivel, caja, valida) if caja else None
    if reflex:
        avisos.append(f"Hueco de {reflex['db']:.0f} dB a {reflex['f']:.0f} Hz: parece una caja bass reflex "
                      "(o con radiador pasivo). Con el micro en el cono no se oye el puerto: no se "
                      "propone reforzar el grave.")

    cortes = {}
    if tipo in ("cerca", "sala"):
        desde = zona_ref[1] if zona_ref else 300.0
        for d in (3, 6, 10):
            cortes[f"F{d}"] = cruce_por_debajo(F_SALIDA, nivel, -d, desde)

    # Distorsión con el barrido (solo tiene sentido en campo cercano)
    dist = None
    if tipo == "cerca":
        n_pre_h, n_post_h = int(0.005 * FS), int(0.05 * FS)
        H1 = suavizar(F_LIN, espectro_medio(h, picos, n_pre_h, n_post_h), F_SALIDA)
        harm = {}
        for k in ARMONICOS:
            centros = [c - int(round(L_BARRIDO * np.log(k) * FS)) for c in picos]
            pk = espectro_medio(h, centros, n_pre_h, n_post_h)
            harm[k] = suavizar(F_LIN, pk, F_SALIDA * k)
            harm[k][F_SALIDA * k > 20000] = 0.0
        pr = suavizar(F_LIN, espectro(trozo(h, c_ruido, n_pre_h, n_post_h)), F_SALIDA * 2)
        suma = sum(harm.values())
        dist = dict(thd=100 * np.sqrt(suma / H1), h2=db(harm[2] / H1), h3=db(harm[3] / H1),
                    limite=100 * np.sqrt(pr / H1))

    # Tonos fijos
    # El pico de la respuesta al impulso marca dónde empieza el 1er barrido
    # en la grabación (más el retraso del sonido hasta el micrófono).
    tonos = [t for t in analizar_tonos(y, picos[0], relacion) if t["f"] >= f_min_medida * 0.999]
    # Pasar el nivel de los tonos a la escala de la curva con la diferencia
    # mediana por encima de 100 Hz: sirven para comprobar la forma del grave.
    if tonos:
        ft = np.array([t["f"] for t in tonos])
        nt = np.array([t["nivel_db"] for t in tonos])
        curva = np.interp(ft, F_SALIDA, nivel)
        m = ft >= 100
        desplaz = float(np.median(curva[m] - nt[m])) if np.any(m) else 0.0
        for t in tonos:
            t["nivel_db"] += desplaz
    # Tonos que distorsionan mucho (solo los que se oyen bien sobre el ruido)
    malos = [t["f"] for t in tonos if t["thd"] > THD_MAX and t["nivel_db"] > -20]
    f_distorsion = max(malos) if malos else None
    if f_distorsion:
        avisos.append(f"Distorsiona más del {THD_MAX:.0f} % hasta {f_distorsion:.0f} Hz a este volumen: "
                      "no conviene reforzar el grave por debajo.")

    return dict(nombre=nombre, tipo=tipo, archivo=str(ruta), canal=canal, fs=fs_orig,
                pico_dbfs=float(db(pico ** 2)), picos=picos, deriva_ppm=float(ppm),
                snr_db=snr, f_min=f_min, f_max=f_max, ventana_ms=n_post / FS * 1000,
                caja=caja, joroba=joroba, cortes=cortes, avisos=avisos, nivel=nivel, ruido=ruido_rel,
                h=h, n_pre=n_pre, dist=dist, tonos=tonos, rebotes_db=rebotes, reflex=reflex,
                f_distorsion=f_distorsion, zona_ref=zona_ref)


def medir_rebotes(h, pico):
    """Energía de la respuesta al impulso de 5 a 50 ms frente a la del
    sonido directo (de -0,2 a 2 ms), en dB. Con el micrófono a 1 cm del
    cono sale muy negativa (unos -20 dB); si se acerca a 0, el micrófono
    oye sobre todo la habitación."""
    def energia(a, b):
        return float(np.sum(h[max(pico + int(a * FS / 1000), 0):pico + int(b * FS / 1000)] ** 2))
    return 10 * np.log10(max(energia(5, 50), 1e-30) / max(energia(-0.2, 2), 1e-30))


def buscar_reflex(nivel, caja, valida):
    """Un hueco estrecho y hondo por debajo de la resonancia es lo típico del
    cono de una caja bass reflex (el puerto se lleva el sonido en su
    frecuencia). Se compara cada punto con la media de la curva media octava
    por encima y por debajo: en una caída normal sale casi 0."""
    k = 2 ** 0.5
    def v(f):
        return np.interp(np.log(f), np.log(F_SALIDA), nivel)
    f_lo = F_SALIDA[valida][0] * k
    m = valida & (F_SALIDA >= max(30.0, f_lo)) & (F_SALIDA <= caja["fc"] * 1.2)
    if not np.any(m):
        return None
    f = F_SALIDA[m]
    resto = v(f) - (v(f / k) + v(f * k)) / 2
    i = int(np.argmin(resto))
    if resto[i] < -HUECO_REFLEX_DB:
        return dict(f=float(f[i]), db=float(-resto[i]))
    return None


# ----------------------------------------------------------------- texto

def texto_resumen(r):
    lin = [f"Medida: {r['nombre']}   (tipo {r['tipo']})",
           f"Archivo: {pathlib.Path(r['archivo']).name}   canal {r['canal']}   {r['fs']} Hz",
           f"Fecha del análisis: {datetime.date.today().isoformat()}",
           "",
           f"Pico de la grabación: {r['pico_dbfs']:.1f} dBFS",
           f"Relación señal/ruido (mediana): {r['snr_db']:.0f} dB",
           f"Barridos encontrados: {len(r['picos'])}   diferencia de relojes: {r['deriva_ppm']:+.0f} ppm",
           f"Curva válida de {r['f_min']:.0f} Hz a {r['f_max']:.0f} Hz "
           f"(ventana de {r['ventana_ms']:.1f} ms)", ""]
    c = r["caja"]
    if c:
        lin += ["Ajuste a una caja cerrada (paso alto de 2º orden), "
                f"entre {c['f_lo']:.0f} y {c['f_hi']:.0f} Hz:",
                f"   frecuencia de resonancia fc = {c['fc']:.0f} Hz",
                f"   Qtc = {c['qtc']:.2f}   (0,5 seco · 0,707 plano · >1 grave «hinchado»)",
                f"   error del ajuste = {c['error_db']:.1f} dB", ""]
    if r["cortes"]:
        partes = [f"{k} = {v:.0f} Hz" if v else f"{k} = —" for k, v in r["cortes"].items()]
        lin += ["Caída del grave (respecto a la zona plana): " + "   ".join(partes), ""]
    j = r.get("joroba")
    if j:
        lin += [f"Joroba en el grave: +{j['db']:.1f} dB a {j['f']:.0f} Hz sobre la zona plana",
                "   (suena «gordo» o retumbante). Se corrige con un filtro de pico de",
                f"   -{j['db']:.1f} dB a {j['f']:.0f} Hz (la propuesta lo ajusta).", ""]
    if c:
        lin += [f"Rebotes de la habitación: {r['rebotes_db']:+.0f} dB (con el micro a 1 cm, unos -20)",
                f"Propuesta de corrección: python disenar_eq.py {r['nombre']}", ""]
    if r["tonos"]:
        peor = max(r["tonos"], key=lambda t: t["thd_n"])
        lin += [f"Tonos fijos: la mayor THD+N es {peor['thd_n']:.1f} % a {peor['f']:.0f} Hz.", ""]
    if r["avisos"]:
        lin += ["AVISOS:"] + [f"   • {a}" for a in r["avisos"]] + [""]
    lin += ["Micrófono sin calibrar (DJI Mic): niveles relativos. Por debajo de ~50 Hz",
            "el propio micrófono pierde nivel, así que el grave más profundo sale algo",
            "peor de lo que es. Las comparaciones entre medidas sí son fiables."]
    return "\n".join(lin)
