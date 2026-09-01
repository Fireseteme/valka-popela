# Válka popela — export figurek hrdinů jako 3D modelů (.glb).
#
#   blender -b -P make_hrdiny_modely.py                  … všech 49 figurek
#   ONLY=hero_aldar blender -b -P make_hrdiny_modely.py  … jen některé
#   OUT=/cesta blender -b -P make_hrdiny_modely.py       … jiný cíl
#
# Geometrii NEDUPLIKUJE — načte si stavitele z make_heroes.py (tytéž funkce,
# ze kterých se dodnes renderují 2D sprity) a místo renderu scénu vyexportuje.
#
# PROČ VRCHOLOVÉ BARVY A NE PEČENÍ (na rozdíl od make_models.py)
#   Figurka je složená z hladkých primitiv v PLOCHÝCH barvách — žádný
#   procedurální šum, který by se musel počítat dopředu. Zapékat by tedy
#   nebylo co; jediné, co pečení u dílků řeší navíc, je sloučení materiálových
#   slotů do jednoho, a to tady zvládnou vrcholové barvy zadarmo:
#     • 20–40 slotů → 1 materiál, tedy JEDNO volání kreslení na figurku,
#     • model bez textur váží desítky kB místo stovek,
#     • a hlavně to vypadá stejně — na obrazovce má figurka ~40 px.
#   Výjimkou jsou ZÁŘÍCÍ díly (krystaly, žhavá ostří, sféry mystiků): záře se
#   z vrcholové barvy vzít nedá, takže každá zářivá barva dostane vlastní
#   materiál. Na figurku to dělá 1–2 sloty navíc, ne dvacet.
#
# Výstup: ../models/hrdinove/<jméno>.glb — Y nahoru, nohy v počátku,
#         figurka hledí k +X (otočku kolem svislé osy dělá až renderer).

import bpy
import math
import os
import random

ZDROJ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "make_heroes.py")
KOREN = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT_DIR = os.environ.get("OUT") or os.path.join(KOREN, "models", "hrdinove")

# make_heroes.py si na konci sám volá main() — načteme ho bez toho volání
_src = open(ZDROJ, encoding="utf-8").read().rsplit("main()", 1)[0]
MH = {"__file__": ZDROJ, "__name__": "make_heroes_lib"}
exec(compile(_src, ZDROJ, "exec"), MH)


def vycisti_scenu():
    for ob in list(bpy.data.objects):
        if not ob.name.startswith("RIG_"):
            bpy.data.objects.remove(ob, do_unlink=True)


def spoj():
    """Zapeče modifikátory a spojí figurku do JEDNOHO meshe. Materiálové sloty
    spojení přežijí — potřebujeme je, abychom z nich vytáhli barvy."""
    meshe = [ob for ob in bpy.data.objects if ob.type == "MESH"]
    if not meshe:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for ob in meshe:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = meshe[0]
    bpy.ops.object.convert(target="MESH")
    if len(meshe) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = "figurka"
    # ⚠ join nechává na výsledku transformaci „aktivního" objektu (bývá to
    # otočená rekvizita mimo střed). Zapéct do vrcholů, ať jsou nohy zpátky
    # v počátku a transformace čistá — stejná past jako v make_models.py.
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def cti_material(m):
    """(základní barva, barva záře, síla záře, kovovost, drsnost)."""
    b = m.node_tree.nodes.get("Principled BSDF") if (m and m.use_nodes) else None
    if b is None:
        return (0.8, 0.8, 0.8), None, 0.0, 0.0, 0.7
    barva = tuple(b.inputs["Base Color"].default_value[:3])
    sila = b.inputs["Emission Strength"].default_value
    zar = tuple(b.inputs["Emission Color"].default_value[:3]) if sila > 0 else None
    kov = b.inputs["Metallic"].default_value
    drs = b.inputs["Roughness"].default_value
    return barva, zar, sila, kov, drs


def novy_material(jmeno, zar=None, sila=0.0, kov=0.0, drs=0.62):
    m = bpy.data.materials.new(jmeno)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    # ⚠ Base Color musí zůstat BÍLÁ — vrcholová barva se s ní násobí.
    b.inputs["Base Color"].default_value = (1, 1, 1, 1)
    b.inputs["Roughness"].default_value = 0.35 if zar else drs
    b.inputs["Metallic"].default_value = kov
    if zar:
        b.inputs["Emission Color"].default_value = (zar[0], zar[1], zar[2], 1.0)
        # ⚠ Sílu záře drž nízko. Ve hře jede scéna přes ACES a bloom, takže
        # blenderová síla 2–4 by z drobné koule udělala bílou kaňku.
        b.inputs["Emission Strength"].default_value = min(1.6, sila * 0.45)
    u = nt.nodes.new("ShaderNodeVertexColor")
    u.layer_name = "Col"
    u.location = (-300, 200)
    nt.links.new(u.outputs["Color"], b.inputs["Base Color"])
    return m


def vrcholove_barvy(ob, jmeno):
    """Přepíše barvu KAŽDÉHO materiálu do vrcholů a nechá jen tři skupiny:
    maso (nekov), KOV a po jednom materiálu na každou zářivou barvu.

    ⚠ Kovovost se do vrcholu uložit NEDÁ (glTF má jen COLOR_0), a bez ní
    vypadá ocel, železo i zlato jako bílý plast — zbroj a zbraně ztratí
    všechen lesk. Proto má kov vlastní slot; na figurku to dělá 2 volání
    kreslení místo jednoho a stojí to za to."""
    puvodni = [cti_material(s.material) for s in ob.material_slots]
    if not puvodni:
        return 0

    me = ob.data
    # BYTE_COLOR (4 bajty na roh) místo FLOAT (16) — barvy jsou ploché, přesnost
    # 8 bitů na kanál je víc než dost a model je o třetinu menší.
    vrstva = me.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")

    KOV = 1              # slot 0 = maso, slot 1 = kov, dál záře
    zarive = {}          # (barva záře, síla) → index nového slotu
    novy_index = {}      # starý index slotu → nový
    kov_drs = []         # drsnosti kovových materiálů (na průměr)
    for i, (_, zar, sila, kov, drs) in enumerate(puvodni):
        if zar is not None:
            klic = (round(zar[0], 2), round(zar[1], 2), round(zar[2], 2), round(sila, 1))
            if klic not in zarive:
                zarive[klic] = len(zarive) + 2
            novy_index[i] = zarive[klic]
        elif kov > 0.4:
            novy_index[i] = KOV
            kov_drs.append(drs)
        else:
            novy_index[i] = 0

    for poly in me.polygons:
        barva = puvodni[poly.material_index][0]
        for li in poly.loop_indices:
            vrstva.data[li].color = (barva[0], barva[1], barva[2], 1.0)

    drs = sum(kov_drs) / len(kov_drs) if kov_drs else 0.35
    materialy = [novy_material("figurka_" + jmeno),
                 novy_material("kov_" + jmeno, kov=0.85, drs=drs)]
    for klic, poradi in sorted(zarive.items(), key=lambda kv: kv[1]):
        materialy.append(novy_material("zar_%s_%d" % (jmeno, poradi),
                                       zar=(klic[0], klic[1], klic[2]), sila=klic[3]))

    # slot, do kterého nespadl ani jeden polygon, jen nafukuje soubor
    pouzite = sorted(set(novy_index.values()))
    prekod = {stary: i for i, stary in enumerate(pouzite)}
    me.materials.clear()
    for i in pouzite:
        me.materials.append(materialy[i])
    for poly in me.polygons:
        poly.material_index = prekod[novy_index.get(poly.material_index, 0)]
    return len(pouzite)


def export_figurky(jmeno, stavitel, seed):
    random.seed(seed)      # stejný seed jako u spritů → stejné drobnosti
    vycisti_scenu()
    stavitel()
    ob = spoj()
    if ob is None:
        print("PRAZDNY:", jmeno)
        return 0, 0.0
    ob.data.calc_loop_triangles()
    tris = len(ob.data.loop_triangles)
    slotu = len(ob.material_slots)
    novych = vrcholove_barvy(ob, jmeno)
    cesta = os.path.join(OUT_DIR, jmeno + ".glb")
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(
        filepath=cesta,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        # figurka nemá textury, takže UV je jen mrtvá čtvrtina souboru
        export_texcoords=False,
    )
    kb = os.path.getsize(cesta) / 1024.0
    print("OK: %-20s %5d trojuhelniku  %2d->%d materialu  %6.1f kB"
          % (jmeno, tris, slotu, novych, kb))
    return tris, kb


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    MH["setup_scene"]()
    MH["make_materials"]()
    ukoly = []
    for fkey in ["aldar", "yllien", "durgar", "horda", "brakkar", "sarn", "vhorren", "gryk"]:
        for i in range(6):
            ukoly.append(("hero_%s_%d" % (fkey, i), MH["h_%s_%d" % (fkey, i)]))
    ukoly.append(("hero_militia", MH["h_militia"]))
    only = os.environ.get("ONLY")
    predpony = [p.strip() for p in only.split(",") if p.strip()] if only else None
    celkem = kusu = 0
    kb = 0.0
    for i, (jmeno, fn) in enumerate(ukoly):
        if predpony and not any(jmeno.startswith(p) for p in predpony):
            continue
        t, k = export_figurky(jmeno, fn, seed=300 + i)
        celkem += t
        kb += k
        kusu += 1
    if kusu:
        print("\nSOUHRN: %d figurek, %d trojuhelniku (prumer %d), %.1f kB celkem"
              % (kusu, celkem, celkem // kusu, kb))
    print("HOTOVO ->", OUT_DIR)


main()
