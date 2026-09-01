# Válka popela — náhled KUSU MAPY (ne jednoho dílku).
#
#   blender -b -P nahled_mapy.py
#   SCENA=uhlopricna blender -b -P nahled_mapy.py
#
# Proč: sprity i modely se vyrábějí po jednom dílku, ale řeka, břehy a most
# dávají smysl teprve vedle sebe. Tohle poskládá kus mapy přesně tak, jak ho
# skládá renderer, a vyfotí ho — takže je vidět, jestli hladina drží pohromadě
# a jestli se obě půlky mostu potkají nad středem toku.
#
# Souřadnice: dílek (q,r) leží ve hře na (x,z) = DIAG·(q−r, q+r) a export
# překlápí blenderové Y na three −Z. V Blenderu je tedy pole na
# (X, Y) = DIAG·(q−r), −DIAG·(q+r) a otočka rendereru se přičítá k exportním 45°.
#
# Výstup: ../render/nahled_<scéna>.png

import bpy
import math
import os

ZDROJ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "make_tiles.py")
OUT_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "render"))

_src = open(ZDROJ, encoding="utf-8").read().rsplit("main()", 1)[0]
MT = {"__file__": ZDROJ, "__name__": "make_tiles_lib"}
exec(compile(_src, ZDROJ, "exec"), MT)

DIAG = math.sqrt(1.5)
UHEL_AUTORA = -3 * math.pi / 4          # kanonický směr břehu i lávky (soused −q)
SMERY = [(1, 0), (-1, 0), (0, 1), (0, -1)]


def otoceni_na(dq, dr):
    """Stejný vzorec jako v render.js — o kolik otočit model, aby mířil
    na souseda (dq, dr)."""
    return UHEL_AUTORA - math.atan2(dq + dr, dq - dr)


BREHY = [41, 77, 113]     # seedy variant břehu (v pořadí jako BREHY v render.js)


def breh_varianta(q, r, i):
    """Zrcadlo brehVarianta() z render.js — stejná FNV, aby náhled ukazoval
    tentýž rozptyl variant jako hra."""
    h = 2166136261
    for v in (q, r, i):
        h ^= v & 255
        h = (h * 16777619) & 0xFFFFFFFF
    return BREHY[(h >> 9) % len(BREHY)]


def poloz(stavitel, q, r, rot=0.0):
    """Postaví dílek stavitelem a přenese ho na pole (q, r); rot je otočka,
    kterou by mu dal renderer. Objekty se pověsí na prázdný uzel, aby se
    nemusela skládat transformace kus po kusu."""
    pred = set(bpy.data.objects)
    stavitel()
    nove = [o for o in bpy.data.objects if o not in pred]
    bpy.ops.object.empty_add(location=(0, 0, 0))
    uzel = bpy.context.object
    for o in nove:
        o.parent = uzel
    uzel.rotation_euler[2] = math.radians(45) + rot
    uzel.location = (DIAG * (q - r), -DIAG * (q + r), 0)
    return uzel


def scena_osova():
    """Osový přechod: pás vody r ∈ ⟨−1,1⟩ a mosty na (q,±2) — tady je řeka
    v mřížce vidět nejširší a lávka je delší (bridge_long)."""
    q0, q1 = 20, 28
    voda = {(q, r) for q in range(q0, q1 + 1) for r in (-1, 0, 1)}
    mosty = {(24, -2): (24, 2), (24, 2): (24, -2)}
    return q0 - 2, q1 + 2, -5, 5, voda, mosty, 2 * math.sqrt(3)


def scena_uhlopricna():
    """Úhlopříčný přechod: pás |q−r| ≤ 1 a mosty na |q−r| = 2 — pole pásu se
    tu dotýkají rohy (cihlový vzor) a lávka je kratší (bridge_short)."""
    voda = set()
    for q in range(10, 25):
        for r in range(10, 25):
            if abs(q - r) <= 1:
                voda.add((q, r))
    mosty = {(17, 15): (15, 17), (15, 17): (17, 15)}
    return 12, 22, 12, 22, voda, mosty, 2 * DIAG


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    MT["setup_scene"]()
    MT["make_materials"]()

    jmeno = os.environ.get("SCENA", "osova")
    q0, q1, r0, r1, voda, mosty, pulka = (scena_uhlopricna() if jmeno.startswith("uhl")
                                          else scena_osova())
    # OKNO=q0,q1,r0,r1 — menší výřez se staví o dost rychleji (stavba dílků je
    # pomalejší než samotný render)
    okno = os.environ.get("OKNO")
    if okno:
        q0, q1, r0, r1 = [int(x) for x in okno.split(",")]

    for q in range(q0, q1 + 1):
        for r in range(r0, r1 + 1):
            if (q, r) in voda:
                poloz(MT["river_flat"], q, r)
                for i, (dq, dr) in enumerate(SMERY):   # břeh tam, kde voda končí
                    if (q + dq, r + dr) not in voda:
                        sd = breh_varianta(q, r, i)
                        poloz(lambda sd=sd: MT["river_bank"](sd), q, r, otoceni_na(dq, dr))
            elif (q, r) in mosty and not os.environ.get("BEZMOSTU"):
                poloz(MT["a_plains"], q, r)     # zem pod mostem kreslí biom
                cq, cr = mosty[(q, r)]
                poloz(lambda: MT["bridge_head"](pulka), q, r,
                      otoceni_na(cq - q, cr - r))
            elif not os.environ.get("JENVODA"):
                poloz(MT["a_plains"], q, r)

    if os.environ.get("DIAG"):      # kontrola skladby bez renderu
        from collections import Counter
        c = Counter()
        for o in bpy.data.objects:
            if o.type != "EMPTY" and o.parent:
                mat = o.data.materials[0].name if getattr(o.data, "materials", None) else "?"
                c[mat.split(".")[0]] += 1
        print("DIAG objekty:", dict(c))
        for (q, r) in [(23, 0), (24, 0), (25, 0), (24, 2)]:
            x, y = DIAG * (q - r), -DIAG * (q + r)
            bliz = [o for o in bpy.data.objects if o.type == "EMPTY"
                    and abs(o.location[0] - x) < 0.01 and abs(o.location[1] - y) < 0.01]
            deti = [[d.data.materials[0].name.split(".")[0]
                     for d in bpy.data.objects if d.parent is u][:3] for u in bliz]
            print("DIAG pole", (q, r), "uzlu:", len(bliz), deti)
        return

    # kamera nad střed výřezu, stejný náklon 55° jako ve hře
    # CIL=q,r — kamera na konkrétní pole (detail); jinak střed výřezu
    cil = os.environ.get("CIL")
    sq, sr = ([float(x) for x in cil.split(",")] if cil
              else [(q0 + q1) / 2, (r0 + r1) / 2])
    cx, cy = DIAG * (sq - sr), -DIAG * (sq + sr)
    cam = bpy.data.objects["RIG_cam"]
    d = 40.0
    cam.location = (cx, cy - d * math.sin(MT["CAM_TILT"]), d * math.cos(MT["CAM_TILT"]))
    cam.data.ortho_scale = float(os.environ.get("ZOOM", 13.0))
    sc = bpy.context.scene
    sc.render.resolution_x = 1100
    sc.render.resolution_y = 720
    sc.render.film_transparent = False
    sc.cycles.samples = 24
    sc.render.filepath = os.path.join(OUT_DIR, "nahled_" + jmeno + ".png")
    bpy.ops.render.render(write_still=True)
    print("HOTOVO ->", sc.render.filepath)


main()
