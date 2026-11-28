"""Propuesta de corrección para cualquier altavoz, a partir de una medida en
campo cercano ya analizada (sin gráficos: lo usan disenar_eq.py y la web).

Cadena del firmware (mismas fórmulas de filtros biquad, de R. Bristow-Johnson):
  ganancia previa -> paso alto -> filtro de la joroba -> refuerzo del grave

Nada está fijado para un altavoz concreto: la resonancia, la joroba y la
caída del grave se leen en la medida y los filtros se colocan alrededor.
Se proponen varias opciones, de más prudente a más ambiciosa, cada una con
su curva prevista. Solo necesita numpy.
"""
import numpy as np

FS_BT = 44100.0                                   # frecuencia habitual del Bluetooth (A2DP)
F = 20.0 * 2 ** (np.arange(0, 330) / 48)          # 20 Hz .. ~2 kHz, 1/48 de octava

JOROBA_MIN_DB = 1.5        # por debajo no merece la pena corregirla
REFUERZOS = (3, 6, 9)      # opciones de refuerzo del grave (dB)
RECOMENDADO_MAX_DB = 6     # la opción recomendada no pasa de aquí
PASOALTO_RELATIVO = 0.7    # paso alto de protección = 0,7 × F3 nueva


# ------------------------------------------- filtros biquad (RBJ Audio EQ Cookbook)

def biquad_paso_alto(f0, q=0.7071, fs=FS_BT):
    w = 2 * np.pi * f0 / fs
    alfa = np.sin(w) / (2 * q)
    c = np.cos(w)
    b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    a = [1 + alfa, -2 * c, 1 - alfa]
    return np.array(b) / a[0], np.array(a) / a[0]


def biquad_pico(f0, ganancia_db, q, fs=FS_BT):
    A = 10 ** (ganancia_db / 40)
    w = 2 * np.pi * f0 / fs
    alfa = np.sin(w) / (2 * q)
    c = np.cos(w)
    b = [1 + alfa * A, -2 * c, 1 - alfa * A]
    a = [1 + alfa / A, -2 * c, 1 - alfa / A]
    return np.array(b) / a[0], np.array(a) / a[0]


def respuesta_db(b, a, f=F, fs=FS_BT):
    z = np.exp(-1j * 2 * np.pi * f / fs)
    h = (b[0] + b[1] * z + b[2] * z ** 2) / (a[0] + a[1] * z + a[2] * z ** 2)
    return 20 * np.log10(np.abs(h))


def cadena_db(p, f=F):
    """Respuesta de toda la corrección (sin la ganancia previa)."""
    total = np.zeros_like(f)
    if p["pasoalto"] > 0:
        total += respuesta_db(*biquad_paso_alto(p["pasoalto"]), f=f)
    total += respuesta_db(*biquad_pico(p["joroba_f"], p["joroba_db"], p["joroba_q"]), f=f)
    total += respuesta_db(*biquad_pico(p["grave_f"], p["grave_db"], p["grave_q"]), f=f)
    return total


def objetivo(f3, f=F):
    """0 dB plano por encima de f3 y caída de 2º orden (Butterworth) por debajo."""
    x = f / f3
    return 20 * np.log10(x ** 2 / np.sqrt(1 + x ** 4))


# ------------------------------------------------------------- curva medida

def curva(respuesta_f, respuesta_db, tonos=None):
    """Curva de partida sobre la rejilla F: los tonos fijos por debajo de
    120 Hz (respuesta estable, la que importa con música) y el barrido por
    encima, unidos de 120 a 190 Hz. Por debajo del primer tono, la caída
    sigue a 24 dB por octava. «tonos»: lista de (frecuencia, nivel)."""
    barrido = np.interp(np.log(F), np.log(respuesta_f), respuesta_db)
    if not tonos:
        return barrido
    ft = np.array([t[0] for t in tonos], float)
    nt = np.array([t[1] for t in tonos], float)
    t = np.interp(np.log(F), np.log(ft), nt)
    bajo = F < ft[0]
    t[bajo] = nt[0] - 24 * np.log2(ft[0] / F[bajo])
    peso = np.clip(np.log2(F / 120) / np.log2(190 / 120), 0, 1)
    peso[F > ft[-1]] = 1.0
    return (1 - peso) * t + peso * barrido


def cruce(c, umbral, desde):
    """Primera frecuencia, bajando desde «desde», en la que la curva cae por
    debajo de «umbral» (interpolada). None si no cae."""
    idx = np.where(F <= desde)[0][::-1]
    for a, b in zip(idx[:-1], idx[1:]):
        if c[a] >= umbral > c[b]:
            k = (c[a] - umbral) / (c[a] - c[b])
            return float(F[a] * (F[b] / F[a]) ** k)
    return None


# ------------------------------------------------------------- diagnóstico

def diagnostico(c, fc, f_min, f_ref_alta, f_distorsion=None, reflex=None):
    """Lo que se puede leer en la curva. «fc»: resonancia del ajuste de caja;
    «f_min»: frecuencia más baja con medida válida; «f_ref_alta»: final de la
    zona plana usada como 0 dB."""
    banda = (F >= fc / 2) & (F <= fc * 2) & (F >= f_min)
    joroba = None
    if np.any(banda):
        i = int(np.argmax(np.where(banda, c, -99)))
        if c[i] > JOROBA_MIN_DB:
            joroba = dict(f=float(F[i]), db=float(c[i]))
    return dict(fc=fc, f_min=f_min, f_ref_alta=f_ref_alta, joroba=joroba,
                f3=cruce(c, -3, f_ref_alta), f6=cruce(c, -6, f_ref_alta),
                f10=cruce(c, -10, f_ref_alta), f_distorsion=f_distorsion, reflex=reflex)


# ------------------------------------------------------------------- ajuste

def _error(p, c, meta, banda):
    pred = c + cadena_db(p)
    return float(np.sqrt(np.mean((pred[banda] - meta[banda]) ** 2)))


def _ajustar(p, c, meta, banda, rangos, pasos):
    """Descenso por coordenadas con pasos cada vez menores."""
    mejor = _error(p, c, meta, banda)
    for _ in range(6):
        mejora = True
        while mejora:
            mejora = False
            for k, paso in pasos.items():
                for signo in (+1, -1):
                    q = dict(p)
                    lo, hi = rangos[k]
                    q[k] = float(np.clip(p[k] + signo * paso, lo, hi))
                    e = _error(q, c, meta, banda)
                    if e < mejor - 1e-4:
                        p, mejor, mejora = q, e, True
        pasos = {k: v / 2 for k, v in pasos.items()}
    return p, mejor


def _redondear(p):
    r = {}
    for k, v in p.items():
        if k in ("pasoalto", "joroba_f", "grave_f"):
            r[k] = float(round(v))
        elif k.endswith("_q"):
            r[k] = round(v, 2)
        else:
            r[k] = round(v, 1)
    return r


def sin_joroba(c, d):
    """La curva con la joroba recortada a 0 dB: la base para el grave."""
    s = c.copy()
    if d["joroba"]:
        zona = (F >= d["fc"] / 2) & (F <= d["f_ref_alta"])
        s[zona] = np.minimum(s[zona], 0.0)
    return s


def f3_objetivo(c, d, refuerzo):
    """Hasta dónde puede bajar la F3 con «refuerzo» dB: la frecuencia en la
    que la curva (sin joroba) está «refuerzo» dB por debajo de -3 dB. Sale
    de la propia medida, sea cual sea la pendiente de caída del altavoz."""
    s = sin_joroba(c, d)
    f = cruce(s, -3.0 - refuerzo, d["f_ref_alta"])
    return f if f else d["f_min"]


def _opcion(c, d, refuerzo):
    """Una opción: «refuerzo» = 0 solo quita la joroba (si la hay)."""
    j = d["joroba"]
    p = dict(pasoalto=0.0, joroba_f=j["f"] if j else 150.0, joroba_db=-j["db"] if j else 0.0,
             joroba_q=2.0 if j else 1.0, grave_f=80.0, grave_db=0.0, grave_q=1.0)
    rangos = {"joroba_f": (d["fc"] / 1.6, d["fc"] * 2), "joroba_db": (-15.0, 0.0), "joroba_q": (0.5, 5.0)}
    pasos = {"joroba_f": 10.0, "joroba_db": 1.0, "joroba_q": 0.5}
    if refuerzo == 0:
        f3_meta = d["f3"] or d["fc"]
        # Objetivo: la misma curva sin la joroba (no se toca el grave)
        meta = np.minimum(c, 0.0)
        banda = (F >= max(d["f_min"], f3_meta)) & (F <= d["f_ref_alta"])
        if not j:
            p["joroba_db"] = 0.0
            return p, 0.0, f3_meta
    else:
        f3_meta = f3_objetivo(c, d, refuerzo)
        p["pasoalto"] = PASOALTO_RELATIVO * f3_meta
        p["grave_f"], p["grave_db"] = f3_meta, refuerzo / 2
        meta = objetivo(f3_meta)
        banda = (F >= max(d["f_min"], p["pasoalto"] * 1.3)) & (F <= d["f_ref_alta"])
        rangos.update(grave_f=(0.6 * f3_meta, 2.0 * f3_meta), grave_db=(0.0, float(refuerzo) + 3),
                      grave_q=(0.5, 2.0))
        pasos.update(grave_f=10.0, grave_db=1.0, grave_q=0.3)
        if not j:      # sin joroba, ese filtro se queda quieto
            for k in ("joroba_f", "joroba_db", "joroba_q"):
                pasos.pop(k)
    p, err = _ajustar(p, c, meta, banda, rangos, pasos)
    return p, err, f3_meta


def proponer(c, d):
    """Opciones de corrección, de más prudente a más ambiciosa. Cada una lleva
    sus ajustes (las claves del firmware), su curva prevista y sus números."""
    opciones = []
    candidatas = [0] + ([] if d["reflex"] else list(REFUERZOS))
    for refuerzo in candidatas:
        p, err, f3_meta = _opcion(c, d, refuerzo)
        eq = cadena_db(p)
        p["ganancia"] = -float(np.ceil(max(float(np.max(eq)), 0.0))) or 0.0   # que nunca recorte
        p = _redondear(p)
        eq = cadena_db(p)
        prevista = c + eq
        zona = (F > d["fc"] / 2) & (F < d["fc"] * 2)
        # Lo que de verdad se sube el grave (lo que más fuerza el cono)
        grave = F <= (d["f3"] or d["fc"])
        refuerzo_grave = max(float(np.max(eq[grave])), 0.0) if np.any(grave) else 0.0
        motivos = []
        if refuerzo and f3_meta < d["f_min"] * 1.2:
            motivos.append(f"la medida no llega tan abajo (empieza en {d['f_min']:.0f} Hz)")
        if refuerzo and d["f_distorsion"] and f3_meta < d["f_distorsion"]:
            motivos.append(f"el altavoz ya distorsiona por debajo de {d['f_distorsion']:.0f} Hz")
        opciones.append(dict(
            refuerzo_db=refuerzo,
            nombre="Solo quitar la joroba" if refuerzo == 0 else f"Grave +{refuerzo} dB",
            ajustes=dict(dsp=True, limitador=True, gravesmax=-6.0, techo=-1.0, **p),
            prevista=prevista, correccion=eq, error_db=round(err, 2),
            f3_prevista=cruce(prevista, -3, d["f_ref_alta"]),
            joroba_prevista_db=round(float(np.max(prevista[zona])), 1) if np.any(zona) else None,
            refuerzo_max_db=round(refuerzo_grave, 1),
            potencia_x=round(10 ** (refuerzo_grave / 10), 1),
            desaconsejada=motivos))
    if not d["joroba"] and len(opciones) > 1:
        opciones.pop(0)           # sin joroba, «solo quitarla» no hace nada
    validas = [o for o in opciones if not o["desaconsejada"] and o["refuerzo_db"] <= RECOMENDADO_MAX_DB]
    recomendada = validas[-1] if validas else opciones[0]
    for o in opciones:
        o["recomendada"] = o is recomendada
    return opciones


def nada_que_corregir(d):
    """True si no hay joroba y el grave ya llega a donde la medida permite ver."""
    return not d["joroba"] and (d["f3"] is None or d["f3"] <= max(d["f_min"] * 1.2, 40))


def resumen_texto(d, opciones):
    lin = [f"Resonancia (ajuste de caja): {d['fc']:.0f} Hz"]
    if d["joroba"]:
        lin.append(f"Joroba: +{d['joroba']['db']:.1f} dB a {d['joroba']['f']:.0f} Hz")
    else:
        lin.append("Sin joroba que corregir")
    lin.append("F3 medida: " + (f"{d['f3']:.0f} Hz" if d["f3"] else "no cae en la zona medida"))
    if d["reflex"]:
        lin.append(f"Posible bass reflex: hueco de {d['reflex']['db']:.0f} dB a {d['reflex']['f']:.0f} Hz")
    if nada_que_corregir(d):
        lin.append("No hace falta corregir: el altavoz ya es plano en la zona medida.")
    lin.append("")
    for o in opciones:
        a = o["ajustes"]
        marca = "★" if o["recomendada"] else " "
        f3 = f"{o['f3_prevista']:.0f} Hz" if o["f3_prevista"] else "—"
        lin.append(f"{marca} {o['nombre']:22s} F3 {f3:>7s} | joroba queda {o['joroba_prevista_db']:+.1f} dB"
                   f" | grave +{o['refuerzo_max_db']:.1f} dB (×{o['potencia_x']:.1f} potencia)")
        lin.append(f"     ganancia {a['ganancia']:.0f} | pasoalto {a['pasoalto']:.0f} | joroba {a['joroba_f']:.0f} "
                   f"{a['joroba_db']:.1f} {a['joroba_q']:.2f} | grave {a['grave_f']:.0f} {a['grave_db']:.1f} "
                   f"{a['grave_q']:.2f}")
        for m in o["desaconsejada"]:
            lin.append(f"     ⚠ no recomendable: {m}")
    return "\n".join(lin)
