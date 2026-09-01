# Válka popela — export dílků mapy jako 3D modelů (.glb) se zapečenými texturami.
#
#   blender -b -P make_models.py             … všechno
#   ONLY=aldar blender -b -P make_models.py  … jen dílky začínající na "aldar"
#                                              (víc předpon se odděluje čárkou)
#   BAKE=0 blender -b -P make_models.py      … staré ploché barvy, bez pečení
#   OUT=/cesta blender -b -P make_models.py  … jiný cíl (na zkoušení)
#
# Geometrii NEDUPLIKUJE — načte si stavitele z make_tiles.py a místo renderu
# scénu vyexportuje.
#
# PROČ SE PEČE
#   glTF umí jen hodnoty materiálu a obrázkové textury. Procedurální šum, bump
#   ani nerovnou drsnost (mat_hq v make_tiles.py) nezná, takže by se model
#   vyexportoval jako jednolitá plocha jedné barvy — plastový dojem. Pečení
#   ten šum spočítá dopředu a uloží ho do obrázků, které glTF unese:
#
#     barva     = albedo x zapečené okolní zastínění (AO)
#     reliéf    = normálová mapa z bumpu
#     drsnost   = G kanál, kovovost = B kanál (glTF je čeká v jedné textuře)
#     záře      = jen u dílků, které opravdu září (láva, krystaly)
#
#   Vedlejší zisk: desítky materiálových slotů dílku splynou v JEDEN materiál,
#   takže engine kreslí pole jedním voláním místo desítek.
#
# Výstup: ../models/<jméno>.glb  (Y nahoru, hex o poloměru 1 v počátku)
#         Zapečené mapy se do .glb vloží jako WEBP. Kopie v ../textures/ je
#         jen na nahlédnutí a po běhu se maže — chceš-li ji nechat, pusť TEX=1.

import bpy
import math
import os
import random
import shutil

import numpy as np

ZDROJ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "make_tiles.py")
KOREN = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT_DIR = os.environ.get("OUT") or os.path.join(KOREN, "models")
TEX_DIR = os.path.join(KOREN, "textures")

PEC = os.environ.get("BAKE", "1") != "0"

# Rozlišení. Pole je na obrazovce 52 px (oddálení 1) až ~260 px (přiblížení 5),
# takže 512 na celý dílek je s rezervou dost; drsnost a kovovost jsou nízko-
# frekvenční a vejdou se do čtvrtiny.
RES_BARVA = 512
RES_RELIEF = 256
RES_DRSNOST = 256
AO_SILA = 0.35          # 0 = bez zastínění, 1 = plná síla
AO_DOSAH = 0.45         # v jednotkách (hex má poloměr 1)
AO_VZORKU = 64

# make_tiles.py si na konci sám volá main() — načteme ho bez toho volání,
# ať dostaneme jen stavitele a materiály
_src = open(ZDROJ, encoding="utf-8").read().rsplit("main()", 1)[0]
MT = {"__file__": ZDROJ, "__name__": "make_tiles_lib"}
exec(compile(_src, ZDROJ, "exec"), MT)


def vycisti_scenu():
    """Smaže všechno kromě kamery a světel (RIG_*) — stejně jako render_tile."""
    for ob in list(bpy.data.objects):
        if not ob.name.startswith("RIG_"):
            bpy.data.objects.remove(ob, do_unlink=True)


def zahod_stinove_chytace():
    """Rekvizity surovin stojí v make_tiles.py na shadow catcheru (catcher()) —
    v Cycles je neviditelný a jen zachytává stín, ale glTF nic takového nezná
    a vyexportoval by se jako BÍLÁ DESKA přes celé pole. Musí ven."""
    for ob in list(bpy.data.objects):
        if getattr(ob, "is_shadow_catcher", False):
            bpy.data.objects.remove(ob, do_unlink=True)


def spoj_a_uklid():
    """Aplikuje modifikátory (hlavně bevel) a spojí dílek do JEDNOHO meshe.
    Engine pak vykreslí pole jedním voláním místo třiceti a stejné dílky jde
    instancovat. Materiálové sloty spojení přežijí — sloučí je až pečení."""
    zahod_stinove_chytace()
    meshe = [ob for ob in bpy.data.objects if ob.type == "MESH"]
    if not meshe:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for ob in meshe:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = meshe[0]
    bpy.ops.object.convert(target="MESH")  # zapeče modifikátory
    if len(meshe) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = "dilek"
    return ob


def pocet_trojuhelniku(ob):
    ob.data.calc_loop_triangles()
    return len(ob.data.loop_triangles)


# ================= pečení =================

def uv_rozbal(ob):
    """Automatický rozvin do atlasu. Ostrůvky se smějí vzorem opakovat, ale ne
    dotýkat — proto okraj, jinak se sousedi při filtrování slijí."""
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0),
                             island_margin=0.006,
                             correct_aspect=True,
                             scale_to_bounds=False)
    # smart_project balí ostrůvky ledabyle — půlka atlasu bývá prázdná.
    # Přebalení je zvětší, takže na dílek padne víc texelů zadarmo.
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=0.006,
                            shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")


def _obraz(jmeno, res, barevny, plovouci=None):
    # Pozor na 8bitový buffer: bake do něj usekne všechno nad 1,0 a barva ujede
    # do bílé. Cokoli, co může přesáhnout jedničku (záře), chce plovouci=True.
    if plovouci is None:
        plovouci = not barevny
    img = bpy.data.images.new(jmeno, res, res, alpha=False, float_buffer=plovouci)
    img.colorspace_settings.name = "sRGB" if barevny else "Non-Color"
    return img


def _pixely(img):
    a = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(-1, 4)


def _zapis(img, a):
    img.pixels.foreach_set(a.reshape(-1).astype(np.float32))
    img.update()


def _cil(ob, img):
    """Cycles peče do AKTIVNÍHO uzlu obrázku každého materiálu — musí ho mít
    všechny sloty, jinak se jejich plocha do atlasu nezapíše."""
    for slot in ob.material_slots:
        m = slot.material
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        n = nt.nodes.get("BAKE_CIL")
        if n is None:
            n = nt.nodes.new("ShaderNodeTexImage")
            n.name = "BAKE_CIL"
            n.location = (-900, 600)
        n.image = img
        for x in nt.nodes:
            x.select = False
        n.select = True
        nt.nodes.active = n


def _bsdf(m):
    for n in m.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            return n
    return None


def _bake(typ, vzorku=1, **kw):
    bpy.context.scene.cycles.samples = vzorku
    bpy.ops.object.bake(type=typ, use_clear=True, margin=4,
                        margin_type="ADJACENT_FACES", **kw)


def _bake_hodnoty(ob, vstup):
    """Cycles neumí péct kovovost. Trik: každému materiálu se na výstup dočasně
    posadí Emission s tou hodnotou, zapeče se EMIT a zapojení se vrátí zpět."""
    zaloha = []
    for slot in ob.material_slots:
        m = slot.material
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        vystup = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
        bsdf = _bsdf(m)
        if not vystup or not bsdf or not vystup.inputs["Surface"].is_linked:
            continue
        puvodni = vystup.inputs["Surface"].links[0].from_socket
        em = nt.nodes.new("ShaderNodeEmission")
        em.name = "BAKE_HODNOTA"
        v = bsdf.inputs[vstup].default_value
        em.inputs["Color"].default_value = (v, v, v, 1.0)
        em.inputs["Strength"].default_value = 1.0
        nt.links.new(em.outputs["Emission"], vystup.inputs["Surface"])
        zaloha.append((nt, vystup, puvodni, em))
    _bake("EMIT")
    for nt, vystup, puvodni, em in zaloha:
        nt.links.new(puvodni, vystup.inputs["Surface"])
        nt.nodes.remove(em)


def _zari(ob):
    for slot in ob.material_slots:
        m = slot.material
        if not m or not m.use_nodes:
            continue
        b = _bsdf(m)
        if b and b.inputs["Emission Strength"].default_value > 0.0:
            return True
    return False


def zapec(ob, jmeno):
    """Vrátí {"barva", "relief", "drsnost", "zare", "sila_zare"}."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.use_denoising = False
    sc.render.bake.use_selected_to_active = False
    sc.world.light_settings.distance = AO_DOSAH

    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    uv_rozbal(ob)
    ven = {}

    # --- barva = albedo x AO ---
    barva = _obraz(jmeno + "_barva", RES_BARVA, True)
    _cil(ob, barva)
    _bake("DIFFUSE", vzorku=1, pass_filter={"COLOR"})
    ao = _obraz(jmeno + "_ao", RES_BARVA, False)
    _cil(ob, ao)
    _bake("AO", vzorku=AO_VZORKU)
    b = _pixely(barva)
    stin = 1.0 - AO_SILA * (1.0 - _pixely(ao)[:, 0:1])
    b[:, 0:3] *= stin
    _zapis(barva, b)
    bpy.data.images.remove(ao)
    ven["barva"] = barva

    # --- reliéf ---
    relief = _obraz(jmeno + "_relief", RES_RELIEF, False)
    _cil(ob, relief)
    _bake("NORMAL")
    ven["relief"] = relief

    # --- drsnost (G) + kovovost (B) v jedné textuře, jak čeká glTF ---
    drs = _obraz(jmeno + "_d", RES_DRSNOST, False)
    _cil(ob, drs)
    _bake("ROUGHNESS")
    kov = _obraz(jmeno + "_k", RES_DRSNOST, False)
    _cil(ob, kov)
    _bake_hodnoty(ob, "Metallic")
    orm = _obraz(jmeno + "_drsnost", RES_DRSNOST, False)
    a = np.ones((RES_DRSNOST * RES_DRSNOST, 4), dtype=np.float32)
    a[:, 1] = _pixely(drs)[:, 0]
    a[:, 2] = _pixely(kov)[:, 0]
    _zapis(orm, a)
    bpy.data.images.remove(drs)
    bpy.data.images.remove(kov)
    ven["drsnost"] = orm

    # --- záře jen tam, kde je co zářit ---
    ven["zare"] = None
    ven["sila_zare"] = 1.0
    if _zari(ob):
        zare = _obraz(jmeno + "_zare", RES_BARVA, True, plovouci=True)
        _cil(ob, zare)
        _bake("EMIT")
        z = _pixely(zare)
        vrchol = float(z[:, 0:3].max())
        # 8bitová textura by usekla všechno nad 1; sílu proto vytkneme ven
        # a exportér ji zapíše přes KHR_materials_emissive_strength
        if vrchol > 1.0:
            z[:, 0:3] /= vrchol
            _zapis(zare, z)
            ven["sila_zare"] = vrchol
        ven["zare"] = zare

    for slot in ob.material_slots:              # uklidit cílové uzly
        m = slot.material
        if m and m.use_nodes:
            n = m.node_tree.nodes.get("BAKE_CIL")
            if n:
                m.node_tree.nodes.remove(n)
    return ven


def uloz(img):
    os.makedirs(TEX_DIR, exist_ok=True)
    img.filepath_raw = os.path.join(TEX_DIR, img.name + ".png")
    img.file_format = "PNG"
    img.save()


def slouc_material(ob, jmeno, mapy):
    """Nahradí všechny sloty jedním materiálem nad zapečenými mapami."""
    for img in [mapy["barva"], mapy["relief"], mapy["drsnost"], mapy["zare"]]:
        if img is not None:
            uloz(img)

    m = bpy.data.materials.new(jmeno + "_zapeceny")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = _bsdf(m)

    def tex(img, x, y):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        n.location = (x, y)
        return n

    nt.links.new(tex(mapy["barva"], -700, 300).outputs["Color"], bsdf.inputs["Base Color"])

    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.location = (-400, -300)
    nt.links.new(tex(mapy["relief"], -700, -300).outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])

    # exportér pozná dvojici Separate Color → G/B a udělá z ní metallicRoughness
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    sep.location = (-400, 0)
    nt.links.new(tex(mapy["drsnost"], -700, 0).outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

    if mapy["zare"] is not None:
        nt.links.new(tex(mapy["zare"], -700, 600).outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = mapy["sila_zare"]
    else:
        bsdf.inputs["Emission Strength"].default_value = 0.0

    ob.data.materials.clear()
    ob.data.materials.append(m)
    return m


def export_dilku(jmeno, stavitel, seed):
    random.seed(seed)  # stejný seed jako u spritů → stejné rozmístění rekvizit
    vycisti_scenu()
    stavitel()
    ob = spoj_a_uklid()
    if ob is None:
        print("PRAZDNY:", jmeno)
        return 0
    tris = pocet_trojuhelniku(ob)
    slotu = len(ob.material_slots)
    # POZOR: join nechává na výsledku transformaci „aktivního" objektu (bývá to
    # otočená/škálovaná rekvizita mimo střed) — otočka složená s ní by dílek
    # zkosila a posunula, u každého modelu jinak. Nejdřív tedy všechno zapéct
    # do vrcholů, ať je počátek zpátky ve středu dílku a transformace čistá.
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # mřížka „na koso": celý dílek se otočí o 45°, takže čtvercová deska je na
    # mapě kosočtverec a stavby stojí koutem ke kameře (izometrický pohled);
    # exportér zapíše otočku do uzlu a three.js ji převezme přes matrixWorld
    ob.rotation_euler[2] = math.radians(45)
    if PEC:
        slouc_material(ob, jmeno, zapec(ob, jmeno))
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
        export_image_format="WEBP",
        export_image_quality=90,
    )
    kb = os.path.getsize(cesta) / 1024.0
    print("OK: %-18s %6d trojuhelniku  %2d->%d materialu  %7.1f kB"
          % (jmeno, tris, slotu, len(ob.material_slots), kb))
    return tris


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    MT["setup_scene"]()      # kvůli čisté scéně; kamera a světla se neexportují
    if PEC:
        MT["mat"] = MT["mat_hq"]   # procedurální materiál — zapeče se do obrázků
    MT["make_materials"]()

    ukoly = [
        ("aldar_plains", MT["a_plains"]), ("aldar_forest", MT["a_forest"]), ("aldar_hills", MT["a_hills"]),
        ("yllien_plains", MT["y_plains"]), ("yllien_forest", MT["y_forest"]), ("yllien_hills", MT["y_hills"]),
        ("durgar_plains", MT["d_plains"]), ("durgar_forest", MT["d_forest"]), ("durgar_hills", MT["d_hills"]),
        ("horda_plains", MT["h_plains"]), ("horda_forest", MT["h_forest"]), ("horda_hills", MT["h_hills"]),
        ("center_plains", MT["c_plains"]), ("center_forest", MT["c_forest"]), ("center_hills", MT["c_hills"]),
        ("brakkar_plains", MT["bk_plains"]), ("brakkar_forest", MT["bk_forest"]), ("brakkar_hills", MT["bk_hills"]),
        ("sarn_plains", MT["sr_plains"]), ("sarn_forest", MT["sr_forest"]), ("sarn_hills", MT["sr_hills"]),
        ("vhorren_plains", MT["vh_plains"]), ("vhorren_forest", MT["vh_forest"]), ("vhorren_hills", MT["vh_hills"]),
        ("gryk_plains", MT["gr_plains"]), ("gryk_forest", MT["gr_forest"]), ("gryk_hills", MT["gr_hills"]),
        ("water", MT["water"]),
        # v0.41: hladina bez lemu + břeh na hranu zvlášť; most je jen nástavba
        # (dvě délky: úhlopříčné řeky 2·DIAG do půlky, osové 2·STRANA)
        ("river_flat", MT["river_flat"]),
        # tři varianty břehu, ať se dlouhé pobřeží neopakuje dílek po dílku
        ("river_bank", MT["river_bank"]), ("river_bank_b", lambda: MT["river_bank"](77)),
        ("river_bank_c", lambda: MT["river_bank"](113)),
        ("bridge_short", lambda: MT["bridge_head"](2 * MT["DIAG"])),
        ("bridge_long", lambda: MT["bridge_head"](2 * MT["STRANA"])),
        # _a = val podél světové osy X, _b podél Z
        ("wall_a", lambda: MT["wall_tile"](-45)), ("wall_b", lambda: MT["wall_tile"](45)),
        ("wall_c", MT["wall_rohova"]),
        ("ruins", MT["ruins"]),
        ("city", MT["city"]), ("fortress", MT["fortress"]), ("throne", MT["throne"]),
        ("capital_aldar", MT["capital_aldar"]), ("capital_yllien", MT["capital_yllien"]),
        ("capital_durgar", MT["capital_durgar"]), ("capital_horda", MT["capital_horda"]),
        ("capital_brakkar", MT["capital_brakkar"]), ("capital_sarn", MT["capital_sarn"]),
        ("capital_vhorren", MT["capital_vhorren"]), ("capital_gryk", MT["capital_gryk"]),
        ("outpost", MT["outpost"]), ("grandfort", MT["grandfort"]), ("bastion", MT["bastion"]),
        ("res_food_1", MT["res_food_1"]), ("res_food_2", MT["res_food_2"]), ("res_food_3", MT["res_food_3"]),
        ("res_wood_1", MT["res_wood_1"]), ("res_wood_2", MT["res_wood_2"]), ("res_wood_3", MT["res_wood_3"]),
        ("res_stone_1", MT["res_stone_1"]), ("res_stone_2", MT["res_stone_2"]), ("res_stone_3", MT["res_stone_3"]),
        ("res_iron_1", MT["res_iron_1"]), ("res_iron_2", MT["res_iron_2"]), ("res_iron_3", MT["res_iron_3"]),
        ("res_all_1", MT["res_all_1"]), ("res_all_2", MT["res_all_2"]), ("res_all_3", MT["res_all_3"]),
    ]
    only = os.environ.get("ONLY")   # předpony oddělené čárkou: ONLY=river,bridge_l
    predpony = [p.strip() for p in only.split(",") if p.strip()] if only else None
    celkem = 0
    kusu = 0
    for i, (jmeno, fn) in enumerate(ukoly):
        if predpony and not any(jmeno.startswith(p) for p in predpony):
            continue
        celkem += export_dilku(jmeno, fn, seed=100 + i)  # seed jako v make_tiles
        kusu += 1
    if kusu:
        print("\nSOUHRN: %d modelu, %d trojuhelniku celkem, prumer %d na dilek"
              % (kusu, celkem, celkem // kusu))
    if os.environ.get("TEX") != "1" and os.path.isdir(TEX_DIR):
        shutil.rmtree(TEX_DIR)   # 45 dilku x 4 mapy = pres 30 MB, a .glb je uz nese
    print("HOTOVO ->", OUT_DIR)


main()
