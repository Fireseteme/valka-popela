# Válka popela — figurky hrdinů: 20 unikátních siluet (4 frakce × 5 hrdinů)
# + šedá domobrana pro animace střetů.
# Spouští se headless:  blender -b -P make_heroes.py
#
# Stejná kamera jako u dlaždic (ortho, náklon 55°), jen blíž: ortho_scale 2.2,
# 256×256, průhledné pozadí. Postava stojí nohama v počátku a hledí k +X
# (ve hře se zrcadlí přes scale(-1,1)). Nohy = střed obrázku.
# Výstup: ../render/hero_<frakce>_<idx>.png a hero_militia.png

import bpy
import math
import os
import random

OUT_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "render"))
CAM_TILT = math.radians(55)


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.cycles.device = "CPU"
    sc.render.film_transparent = True
    # RES=768 SUFFIX=_big vyrobí velké portrétní rendery pro okno hrdiny
    res = int(os.environ.get("RES", "256"))
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), 0, math.radians(-40)))
    sun = bpy.context.object
    sun.data.energy = 3.5
    sun.data.angle = math.radians(12)
    sun.name = "RIG_sun"
    world = bpy.data.worlds.new("sky")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.65, 0.75, 1.0, 1.0)
    bg.inputs[1].default_value = 0.7
    d = 10.0
    bpy.ops.object.camera_add(
        location=(0, -d * math.sin(CAM_TILT), d * math.cos(CAM_TILT) + 0.45),
        rotation=(CAM_TILT, 0, 0))
    cam = bpy.context.object
    cam.name = "RIG_cam"
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.2
    sc.camera = cam


def mat(name, color, rough=0.8, metal=0.0, emit=None, emit_str=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = emit_str
    return m


# ---------- primitivní dílky ----------

def sphere(material, r, loc, squash=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=r, location=loc)
    ob = bpy.context.object
    ob.scale = (1, 1, squash)
    ob.data.materials.append(material)
    return ob


def cyl(material, r, depth, base, vertices=10, r2=None):
    """Válec/kužel stojící NA base (roste vzhůru)."""
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=r, depth=depth,
                                            location=(base[0], base[1], base[2] + depth / 2))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r, radius2=r2, depth=depth,
                                        location=(base[0], base[1], base[2] + depth / 2))
    ob = bpy.context.object
    ob.data.materials.append(material)
    return ob


def rod(material, r, length, center, rx=0, ry=0, rz=0, vertices=8):
    """Válec se středem v center, natočený — paže, ratiště, čepele."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=r, depth=length, location=center)
    ob = bpy.context.object
    ob.rotation_euler = (rx, ry, rz)
    ob.data.materials.append(material)
    return ob


def slab(material, size, center, rx=0, ry=0, rz=0):
    bpy.ops.mesh.primitive_cube_add(location=center)
    ob = bpy.context.object
    ob.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    ob.rotation_euler = (rx, ry, rz)
    ob.data.materials.append(material)
    return ob


def conep(material, r, depth, center, rx=0, ry=0, rz=0, vertices=8):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r, depth=depth, location=center)
    ob = bpy.context.object
    ob.rotation_euler = (rx, ry, rz)
    ob.data.materials.append(material)
    return ob


# ---------- materiály ----------

M = {}
FACTION_COL = {
    "aldar":  (0.18, 0.42, 0.80),
    "yllien": (0.12, 0.65, 0.55),
    "durgar": (0.82, 0.48, 0.12),
    "horda":  (0.75, 0.16, 0.13),
    "brakkar": (0.55, 0.60, 0.66),
    "sarn":    (0.72, 0.62, 0.25),
    "vhorren": (0.55, 0.47, 0.75),
    "gryk":    (0.50, 0.62, 0.20),
}
SKIN = {
    "aldar":  (0.85, 0.66, 0.50),
    "yllien": (0.90, 0.83, 0.66),
    "durgar": (0.48, 0.58, 0.27),
    "horda":  (0.62, 0.30, 0.28),
    "brakkar": (0.82, 0.62, 0.48),
    "sarn":    (0.76, 0.56, 0.38),
    "vhorren": (0.72, 0.74, 0.76),
    "gryk":    (0.55, 0.66, 0.32),
}


def make_materials():
    for k, c in FACTION_COL.items():
        M[k] = mat("f_" + k, c)
        M[k + "_d"] = mat("fd_" + k, tuple(x * 0.55 for x in c))
        M[k + "_l"] = mat("fl_" + k, tuple(min(1, x * 1.4 + 0.08) for x in c))
    for k, c in SKIN.items():
        M["skin_" + k] = mat("skin_" + k, c, rough=0.7)
    M["steel"] = mat("steel", (0.72, 0.74, 0.78), rough=0.3, metal=0.85)
    M["iron"] = mat("iron", (0.36, 0.36, 0.40), rough=0.4, metal=0.8)
    M["wood"] = mat("woodh", (0.42, 0.29, 0.15))
    M["gold"] = mat("goldh", (0.88, 0.66, 0.20), rough=0.3, metal=0.85)
    M["bone"] = mat("boneh", (0.90, 0.88, 0.78), rough=0.6)
    M["dark"] = mat("darkh", (0.15, 0.13, 0.12))
    M["leather"] = mat("leath", (0.38, 0.26, 0.15))
    M["grey"] = mat("greyh", (0.55, 0.57, 0.60))
    M["grey_d"] = mat("greyd", (0.35, 0.37, 0.40))
    M["skin_grey"] = mat("sking", (0.78, 0.66, 0.54))
    M["crystal"] = mat("crysh", (0.35, 0.85, 0.75), rough=0.2, emit=(0.25, 0.75, 0.65), emit_str=2.0)
    M["ember"] = mat("embh", (0.9, 0.3, 0.05), emit=(1.0, 0.4, 0.08), emit_str=4.0)
    M["leaf"] = mat("leafh", (0.12, 0.40, 0.16))
    M["arcane"] = mat("arch", (0.45, 0.55, 0.95), rough=0.25,
                      emit=(0.45, 0.60, 1.00), emit_str=3.5)
    M["beard"] = mat("beardh", (0.58, 0.40, 0.24))
    M["nether"] = mat("nethh", (0.55, 0.42, 0.85), rough=0.25,
                      emit=(0.55, 0.42, 0.95), emit_str=2.5)
    M["jed"] = mat("jedh", (0.45, 0.75, 0.20), rough=0.3,
                   emit=(0.45, 0.85, 0.15), emit_str=2.0)


# ---------- tělo podle rasy ----------

def body(fkey, race, robe=False):
    """Nohy, trup, paže, hlava + rasové rysy. Vrací klíčové výšky."""
    bulk = {"human": 1.0, "elf": 0.85, "orc": 1.3, "demon": 1.05,
            "dwarf": 1.35, "undead": 0.80, "goblin": 0.90}[race]
    tall = {"human": 1.0, "elf": 1.08, "orc": 0.92, "demon": 1.02,
            "dwarf": 0.72, "undead": 1.02, "goblin": 0.68}[race]
    skin = M["skin_" + fkey] if fkey in SKIN else M["skin_grey"]
    cloth = M[fkey] if fkey in FACTION_COL else M["grey"]
    cloth_d = M[fkey + "_d"] if fkey in FACTION_COL else M["grey_d"]
    legH = 0.30 * tall
    torsoH = 0.40 * tall
    shoulder = legH + torsoH
    headR = 0.125 * (1.1 if race == "orc" else 1.0)
    headZ = shoulder + headR + 0.035
    if robe:
        cyl(cloth_d, 0.20 * bulk, legH + 0.06, (0, 0, 0), vertices=12, r2=0.15 * bulk)
    else:
        for side in (-1, 1):
            cyl(M["dark"], 0.052 * bulk, legH + 0.02, (0.02, side * 0.075 * bulk, 0), vertices=8)
    # trup (mírně kuželovitý)
    cyl(cloth, 0.17 * bulk, torsoH, (0, 0, legH), vertices=12, r2=0.13 * bulk)
    # ramenní pláty
    for side in (-1, 1):
        sphere(cloth_d, 0.075 * bulk, (0, side * 0.16 * bulk, shoulder - 0.02), squash=0.8)
    # paže podél těla (pravá se u zbraní přepisuje polohou zbraně)
    for side in (-1, 1):
        rod(skin, 0.038 * bulk, 0.30 * tall, (0.02, side * 0.185 * bulk, shoulder - 0.16),
            rx=side * 0.12)
    # hlava
    sphere(skin, headR, (0.01, 0, headZ))
    if race == "elf":
        for side in (-1, 1):
            conep(skin, 0.03, 0.11, (-0.02, side * (headR + 0.03), headZ + 0.02),
                  rx=side * math.radians(-80), vertices=6)
    elif race == "orc":
        for side in (-1, 1):
            conep(M["bone"], 0.018, 0.06, (headR * 0.7, side * 0.05, headZ - headR * 0.55),
                  rx=math.radians(6), vertices=6)
    elif race == "demon":
        for side in (-1, 1):
            conep(M["dark"], 0.032, 0.17, (-0.01, side * 0.09, headZ + headR * 0.55),
                  rx=side * math.radians(28), vertices=6)
    elif race == "dwarf":
        # mohutný plnovous přes půl hrudi
        conep(M["beard"], headR * 0.85, 0.30, (headR * 0.45, 0, headZ - 0.30),
              rx=math.radians(6), vertices=8)
    elif race == "undead":
        # sinalé žhnoucí oči
        for side in (-1, 1):
            sphere(M["nether"], 0.018, (headR * 0.85, side * 0.045, headZ + 0.02))
    elif race == "goblin":
        # velké odstáté uši
        for side in (-1, 1):
            conep(skin, 0.035, 0.14, (-0.03, side * (headR + 0.02), headZ + 0.03),
                  rx=side * math.radians(-95), vertices=6)
    return {"bulk": bulk, "tall": tall, "shoulder": shoulder, "headZ": headZ,
            "headR": headR, "cloth": cloth, "cloth_d": cloth_d, "skin": skin}


def helmet(b, material, crest=None):
    sphere(material, b["headR"] + 0.025, (0.0, 0, b["headZ"] + 0.02), squash=0.75)
    if crest:
        slab(crest, (0.16, 0.03, 0.09), (0.0, 0, b["headZ"] + b["headR"] + 0.06))


def hood(b, material):
    cyl(material, b["headR"] + 0.05, 0.2, (-0.01, 0, b["headZ"] - 0.06), vertices=10,
        r2=0.03)


def cape(b, material, w=1.0):
    # plášť visí za zády (−X) jako plocha čitelná z profilu
    slab(material, (0.20 * w, 0.06, 0.55 * b["tall"]),
         (-0.20 * b["bulk"], 0, 0.32), ry=math.radians(-10))


def banner(b, material):
    # zástava vlaje od žerdi směrem +X (na obrazovce doprava)
    rod(M["wood"], 0.02, 1.35, (0.16, -0.05, 0.68))
    slab(material, (0.34, 0.02, 0.22), (0.34, -0.05, 1.18))
    conep(M["gold"], 0.03, 0.08, (0.16, -0.05, 1.36), vertices=6)


def sword(z, ang=-0.55, x=0.22, l=0.5):
    rod(M["steel"], 0.022, l, (x + 0.05, -0.02, z + 0.16), ry=ang)
    rod(M["gold"], 0.014, 0.14, (x, -0.02, z), rx=math.radians(90), ry=ang)


def spear(x=0.2):
    rod(M["wood"], 0.016, 1.25, (x, 0, 0.63))
    conep(M["steel"], 0.035, 0.14, (x, 0, 1.30), vertices=8)


# ---------- 24 hrdinů ----------
# aldar — lidé
def h_aldar_0():  # Kaelen Ostříž (rychlý): jezdecký plášť, šavle, sokolí pírko
    b = body("aldar", "human")
    cape(b, M["aldar_d"])
    helmet(b, M["leather"])
    conep(M["bone"], 0.015, 0.12, (0.02, b["headR"] + 0.03, b["headZ"] + 0.09),
          rx=math.radians(-30), vertices=5)  # pírko
    sword(b["shoulder"] - 0.1, ang=-1.1, l=0.42)

def h_aldar_1():  # Mara z Dubové tvrze (útočnice): obouruční meč nad hlavou
    b = body("aldar", "human")
    helmet(b, M["steel"], crest=M["aldar_l"])
    rod(M["steel"], 0.028, 0.7, (0.26, -0.03, b["headZ"] + 0.12), ry=-0.5)
    rod(M["gold"], 0.016, 0.17, (0.14, -0.03, b["headZ"] - 0.12), rx=math.radians(90), ry=-0.5)

def h_aldar_2():  # Edran Sirotčí král (ochránce): věžový štít + koruna
    b = body("aldar", "human")
    slab(M["aldar_l"], (0.30, 0.05, 0.55), (0.22, 0.0, 0.18), rz=math.radians(32))
    slab(M["gold"], (0.20, 0.06, 0.06), (0.22, 0.0, 0.50), rz=math.radians(32))
    cyl(M["gold"], b["headR"] * 0.85, 0.05, (0.0, 0, b["headZ"] + b["headR"] * 0.6), vertices=8)
    for i in range(4):
        a = i * math.pi / 2 + 0.4
        conep(M["gold"], 0.015, 0.05, (math.cos(a) * 0.09, math.sin(a) * 0.09,
              b["headZ"] + b["headR"] * 0.6 + 0.06), vertices=5)

def h_aldar_3():  # Ysra Železná (neúnavná): kopí a těžké pláty
    b = body("aldar", "human")
    helmet(b, M["iron"])
    for side in (-1, 1):
        sphere(M["iron"], 0.09, (0, side * 0.17, b["shoulder"]), squash=0.75)
    spear(0.2)

def h_aldar_4():  # Ser Aldric Korouhevník (vojevůdce): královská zástava, chochol
    b = body("aldar", "human")
    helmet(b, M["steel"], crest=M["aldar_l"])
    banner(b, M["aldar"])
    slab(M["aldar_l"], (0.22, 0.05, 0.3), (0.20, 0.0, 0.22), rz=math.radians(30))  # pavéza

def h_aldar_5():  # Arcimág Vaelis (mystik): špičatý klobouk, hůl se zářící koulí
    b = body("aldar", "human", robe=True)
    conep(M["aldar_d"], b["headR"] + 0.06, 0.26, (0, 0, b["headZ"] + 0.05), vertices=10)
    cyl(M["aldar_d"], b["headR"] + 0.10, 0.02, (0, 0, b["headZ"] + 0.04), vertices=10)  # krempa
    rod(M["wood"], 0.02, 1.2, (0.19, 0, 0.62))
    cyl(M["gold"], 0.032, 0.03, (0.19, 0, 1.05), vertices=8)
    sphere(M["arcane"], 0.07, (0.19, 0, 1.30))

# yllien — elfové
def h_yllien_0():  # Nyalle Tichá (rychlá): kápě a dvě dýky
    b = body("yllien", "elf")
    hood(b, M["yllien_d"])
    cape(b, M["yllien_d"], w=0.9)
    for side in (-1, 1):
        rod(M["steel"], 0.013, 0.22, (0.16, side * 0.14, 0.52), ry=side * 0.5)

def h_yllien_1():  # Theyren Trnový (útočník): dlouhý luk a toulec
    b = body("yllien", "elf")
    lukZ = 0.62
    # luk jako oblouk "(" ze tří dílů, tětiva rovná na vnitřní straně
    rod(M["wood"], 0.016, 0.42, (0.27, -0.02, lukZ))
    rod(M["wood"], 0.014, 0.32, (0.235, -0.02, lukZ + 0.33), ry=math.radians(-26))
    rod(M["wood"], 0.014, 0.32, (0.235, -0.02, lukZ - 0.33), ry=math.radians(26))
    rod(M["bone"], 0.005, 0.9, (0.165, -0.02, lukZ))  # tětiva
    cyl(M["leather"], 0.05, 0.3, (-0.16, 0.06, b["shoulder"] - 0.25), vertices=8)  # toulec

def h_yllien_2():  # Elvarin Kořenopěvec (ochránce): roba a hůl s listovím
    b = body("yllien", "elf", robe=True)
    rod(M["wood"], 0.02, 1.15, (0.19, 0, 0.6))
    sphere(M["leaf"], 0.09, (0.19, 0, 1.22), squash=0.8)
    sphere(M["leaf"], 0.06, (0.13, 0.05, 1.12))

def h_yllien_3():  # Sivrel Věčná (neúnavná): hůl s krystalem, čelenka
    b = body("yllien", "elf", robe=True)
    rod(M["wood"], 0.018, 1.1, (0.19, 0, 0.58))
    conep(M["crystal"], 0.045, 0.16, (0.19, 0, 1.68 - 0.55), vertices=6)
    cyl(M["gold"], b["headR"] * 0.9, 0.02, (0, 0, b["headZ"] + b["headR"] * 0.4), vertices=10)

def h_yllien_4():  # Laeril Píseň úsvitu (vojevůdkyně): zástava a roh
    b = body("yllien", "elf", robe=True)
    banner(b, M["yllien"])
    conep(M["gold"], 0.04, 0.16, (0.12, 0.13, b["shoulder"] - 0.1),
          rx=math.radians(70), vertices=8)  # roh úsvitu

def h_yllien_5():  # Síthrel Hvězdný šepot (mystik): kápě, hůl s krystalovou hvězdou
    b = body("yllien", "elf", robe=True)
    hood(b, M["yllien_d"])
    rod(M["wood"], 0.018, 1.15, (0.19, 0, 0.6))
    sphere(M["crystal"], 0.05, (0.19, 0, 1.24))
    for i in range(4):  # paprsky hvězdy do stran (viditelné z profilu)
        a = i * math.pi / 2 + math.pi / 4
        conep(M["crystal"], 0.018, 0.09,
              (0.19 + math.cos(a) * 0.06, 0, 1.24 + math.sin(a) * 0.06),
              ry=a + math.pi / 2, vertices=5)

# durgar — orkové
def h_durgar_0():  # Borgan Kladivo (útočník): obouruční kladivo
    b = body("durgar", "orc")
    helmet(b, M["iron"])
    rod(M["wood"], 0.026, 0.7, (0.22, -0.02, 0.75), ry=-0.35)
    slab(M["iron"], (0.16, 0.13, 0.2), (0.34, -0.02, 1.02), ry=-0.35)

def h_durgar_1():  # Duna Hlubinná (ochránkyně): velký kulatý štít
    b = body("durgar", "orc")
    helmet(b, M["iron"])
    # disk štítu natočený plochou ke kameře
    rod(M["durgar_l"], 0.24, 0.05, (0.24, -0.04, 0.48),
        rx=math.radians(75), rz=math.radians(20), vertices=14)
    sphere(M["iron"], 0.05, (0.26, -0.10, 0.48))

def h_durgar_2():  # Khorr Střelmistr (rychlý): kuše na rameni
    b = body("durgar", "orc")
    cape(b, M["durgar_d"], w=0.8)
    slab(M["wood"], (0.5, 0.05, 0.05), (0.16, -0.04, b["shoulder"] + 0.10), ry=-0.25)
    slab(M["steel"], (0.05, 0.3, 0.03), (0.30, -0.04, b["shoulder"] + 0.16))

def h_durgar_3():  # Vagga Žulová (neúnavná): krumpáč a tlumok
    b = body("durgar", "orc")
    helmet(b, M["leather"])
    slab(M["leather"], (0.1, 0.22, 0.26), (-0.19, 0, b["shoulder"] - 0.3))
    rod(M["wood"], 0.022, 0.65, (0.21, 0, 0.7))
    conep(M["iron"], 0.03, 0.28, (0.21, 0.12, 1.32), rx=math.radians(100), vertices=6)
    conep(M["iron"], 0.03, 0.28, (0.21, -0.12, 1.32), rx=math.radians(-100), vertices=6)

def h_durgar_4():  # Thrag Sedmý správce (vojevůdce): zástava a hroty na ramenou
    b = body("durgar", "orc")
    helmet(b, M["iron"], crest=M["durgar_l"])
    for side in (-1, 1):
        conep(M["iron"], 0.035, 0.14, (0, side * 0.18, b["shoulder"] + 0.04), vertices=6)
    banner(b, M["durgar"])

def h_durgar_5():  # Zhargra Runové oko (mystička): runová deska na holi, žhnoucí oko
    b = body("durgar", "orc", robe=True)
    hood(b, M["durgar_d"])
    rod(M["wood"], 0.022, 1.1, (0.20, 0, 0.58))
    slab(M["iron"], (0.16, 0.04, 0.24), (0.20, 0, 1.22))       # runová deska
    sphere(M["ember"], 0.045, (0.20, -0.03, 1.24))             # žhnoucí oko
    for dz in (-0.07, 0.05):                                   # zářezy run
        slab(M["dark"], (0.10, 0.05, 0.02), (0.20, 0, 1.24 + dz))

# horda — démoni
def h_horda_0():  # Ghazk Popelný (útočník): zubatý meč se žhavým ostřím
    b = body("horda", "demon")
    rod(M["dark"], 0.03, 0.62, (0.22, -0.02, 0.78), ry=-0.45)
    rod(M["ember"], 0.012, 0.58, (0.245, -0.02, 0.80), ry=-0.45)
    rod(M["iron"], 0.014, 0.15, (0.16, -0.02, 0.62), rx=math.radians(90), ry=-0.45)

def h_horda_1():  # Ukhra Vichřice (rychlá): dvě zahnuté čepele, potrhaný plášť
    b = body("horda", "demon")
    cape(b, M["horda_d"], w=1.1)
    for side in (-1, 1):
        rod(M["steel"], 0.014, 0.3, (0.18, side * 0.15, 0.5), ry=side * 0.7)

def h_horda_2():  # Morgal Kostiplát (ochránce): kostěný štít a pancíř
    b = body("horda", "demon")
    sphere(M["bone"], 0.2, (0.21, 0, 0.5), squash=1.3)
    for side in (-1, 1):
        conep(M["bone"], 0.03, 0.1, (0, side * 0.16, b["shoulder"] + 0.03), vertices=6)

def h_horda_3():  # Zhurr Nezdolný (neúnavný): palice s hroty
    b = body("horda", "demon")
    rod(M["wood"], 0.025, 0.6, (0.21, -0.02, 0.72), ry=-0.3)
    ob = sphere(M["dark"], 0.09, (0.32, -0.02, 0.98))
    for i in range(5):
        a = i * 2 * math.pi / 5
        conep(M["bone"], 0.02, 0.08, (0.32 + math.cos(a) * 0.09, -0.02, 0.98 + math.sin(a) * 0.09),
              ry=a + math.pi / 2, vertices=5)

def h_horda_4():  # Vrakh Pán smeček (vojevůdce): zástava s lebkou
    b = body("horda", "demon")
    banner(b, M["horda"])
    sphere(M["bone"], 0.05, (0.16, -0.05, 1.39))
    for side in (-1, 1):
        conep(M["iron"], 0.03, 0.12, (0, side * 0.17, b["shoulder"] + 0.03), vertices=6)

def h_horda_5():  # Maalzeth Plamenný prorok (mystik): hůl s lebkou v plameni
    b = body("horda", "demon", robe=True)
    cape(b, M["horda_d"], w=0.9)
    rod(M["dark"], 0.02, 1.15, (0.20, 0, 0.6))
    sphere(M["bone"], 0.055, (0.20, 0, 1.22))                  # lebka na holi
    conep(M["ember"], 0.05, 0.22, (0.20, 0, 1.30), vertices=7) # plamen z lebky
    conep(M["ember"], 0.025, 0.12, (0.26, 0, 1.24), ry=math.radians(35), vertices=5)


# brakkar — trpaslíci (pořadí rysů: rychlý, útočník, ochránce, neúnavný, vojevůdce, mystik)
def h_brakkar_0():  # Vigga Hlubinná (rychlá): lehká kápě a dvě ruční sekery
    b = body("brakkar", "dwarf")
    hood(b, M["brakkar_d"])
    cape(b, M["brakkar_d"], w=0.8)
    for side, ang in ((-1, 0.5), (1, -0.4)):
        rod(M["wood"], 0.016, 0.30, (0.19, side * 0.15, b["shoulder"] - 0.06), ry=ang)
        slab(M["steel"], (0.09, 0.02, 0.06),
             (0.19 + 0.13 * math.sin(ang), side * 0.15, b["shoulder"] + 0.07), ry=ang)

def h_brakkar_1():  # Dorn Kamenopěst (útočník): obouruční kladivo nad hlavou
    b = body("brakkar", "dwarf")
    helmet(b, M["iron"])
    rod(M["wood"], 0.024, 0.62, (0.20, -0.02, b["headZ"] + 0.06), ry=-0.35)
    slab(M["grey"], (0.15, 0.12, 0.13), (0.31, -0.02, b["headZ"] + 0.30), ry=-0.35)

def h_brakkar_2():  # Balgrim Štítová skála (ochránce): věžový štít přes celé tělo
    b = body("brakkar", "dwarf")
    helmet(b, M["steel"], crest=M["brakkar"])
    slab(M["grey"], (0.06, 0.30, 0.52), (0.26, 0, 0.27))
    slab(M["brakkar"], (0.02, 0.16, 0.20), (0.30, 0, 0.30))

def h_brakkar_3():  # Helga Žulová (neúnavná): krumpáč a důlní lucerna
    b = body("brakkar", "dwarf")
    hood(b, M["leather"])
    slab(M["leather"], (0.14, 0.22, 0.3), (-0.22 * b["bulk"], 0, 0.30))   # tlumok
    rod(M["wood"], 0.016, 0.55, (0.2, -0.05, 0.45))
    conep(M["steel"], 0.03, 0.16, (0.2, -0.05, 0.74), ry=math.radians(85), vertices=6)
    conep(M["steel"], 0.03, 0.16, (0.2, -0.05, 0.74), ry=math.radians(-85), vertices=6)
    sphere(M["ember"], 0.035, (0.24, 0.14, 0.40))                          # lucerna

def h_brakkar_4():  # Thrandur Korouhevník (vojevůdce): zástava a rohatá přilba
    b = body("brakkar", "dwarf")
    helmet(b, M["steel"])
    for side in (-1, 1):
        conep(M["bone"], 0.025, 0.10, (0, side * (b["headR"] + 0.03), b["headZ"] + 0.05),
              rx=side * math.radians(-60), vertices=6)
    banner(b, M["brakkar"])

def h_brakkar_5():  # Runovědma Sigrit (mystička): runový kámen na holi
    b = body("brakkar", "dwarf", robe=True)
    hood(b, M["brakkar_d"])
    rod(M["wood"], 0.018, 0.85, (0.20, 0, 0.45))
    slab(M["grey_d"], (0.05, 0.12, 0.18), (0.20, 0, 0.86))
    sphere(M["crystal"], 0.030, (0.23, 0, 0.86))

# sarn — jezdci stepí
def h_sarn_0():  # Ajsel Vichřice (rychlá): dvě zahnuté čepele, vlající šál
    b = body("sarn", "human")
    cape(b, M["sarn_l"], w=0.7)
    for side in (-1, 1):
        rod(M["steel"], 0.016, 0.40, (0.20, side * 0.17, 0.55), ry=side * 0.55)

def h_sarn_1():  # Tarkan Rudý oštěp (útočník): dlouhý oštěp s praporkem
    b = body("sarn", "human")
    helmet(b, M["leather"])
    spear(0.2)
    slab(mat("tark_rud", (0.75, 0.16, 0.13)), (0.14, 0.015, 0.08), (0.30, 0, 1.18))

def h_sarn_2():  # Bajan Štít stepi (ochránce): kulatý štít s puklicí
    b = body("sarn", "human")
    helmet(b, M["iron"])
    rod(M["leather"], 0.17, 0.045, (0.26, -0.02, 0.45), rx=math.radians(75), vertices=12)
    sphere(M["gold"], 0.04, (0.30, -0.02, 0.46))

def h_sarn_3():  # Ulzana Nezlomná (neúnavná): oštěp a pokrývky přes záda
    b = body("sarn", "human")
    hood(b, M["leather"])
    spear(0.19)
    rod(M["leather"], 0.05, 0.34, (-0.18, 0, b["shoulder"] + 0.02), rx=math.radians(90))

def h_sarn_4():  # Chán Argut (vojevůdce): totem s koňským ohonem
    b = body("sarn", "human")
    helmet(b, M["gold"], crest=M["sarn"])
    rod(M["wood"], 0.02, 1.3, (0.16, -0.05, 0.66))
    sphere(M["gold"], 0.045, (0.16, -0.05, 1.34))
    conep(M["dark"], 0.035, 0.3, (0.16, -0.05, 1.02), rx=math.radians(178), vertices=7)

def h_sarn_5():  # Šamanka Zereja (mystička): péřová hůl s kostěnými amulety
    b = body("sarn", "human", robe=True)
    cape(b, M["sarn_d"], w=0.9)
    rod(M["wood"], 0.016, 1.05, (0.20, 0, 0.55))
    for i, ang in enumerate((-0.5, 0.0, 0.5)):
        slab(M["sarn_l"], (0.12, 0.01, 0.035), (0.22 + 0.02 * i, 0, 1.04 - i * 0.06), rz=ang)
    sphere(M["bone"], 0.025, (0.20, 0.05, 0.88))
    sphere(M["bone"], 0.02, (0.17, -0.06, 0.80))

# vhorren — nemrtví
def h_vhorren_0():  # Bledý Vessik (rychlý): kápě a dvě dýky
    b = body("vhorren", "undead")
    hood(b, M["vhorren_d"])
    cape(b, M["dark"], w=0.8)
    for side in (-1, 1):
        rod(M["steel"], 0.012, 0.24, (0.20, side * 0.15, 0.52), ry=side * 0.4)

def h_vhorren_1():  # Mortena Žnečka (útočnice): kosa
    b = body("vhorren", "undead")
    hood(b, M["vhorren_d"])
    rod(M["wood"], 0.018, 1.10, (0.20, 0, 0.56), ry=-0.12)
    slab(M["steel"], (0.32, 0.015, 0.07), (0.32, 0, 1.10), rz=0.25, ry=-0.35)

def h_vhorren_2():  # Kravn Kostěný val (ochránce): kostěný štít a lebčí helm
    b = body("vhorren", "undead")
    helmet(b, M["bone"])
    slab(M["bone"], (0.05, 0.26, 0.5), (0.26, 0, 0.30))
    for i in range(3):
        conep(M["bone"], 0.02, 0.08, (0.26, -0.09 + i * 0.09, 0.55), vertices=5)

def h_vhorren_3():  # Nespící Ordwal (neúnavný): halapartna a sinalá lucerna
    b = body("vhorren", "undead")
    helmet(b, M["iron"])
    spear(0.2)
    slab(M["steel"], (0.10, 0.015, 0.12), (0.26, 0, 1.14))
    sphere(M["nether"], 0.035, (-0.16, 0.12, b["shoulder"]))

def h_vhorren_4():  # Panovník Malvren (vojevůdce): bledá zástava a koruna
    b = body("vhorren", "undead")
    for i in range(4):
        a = math.radians(i * 90 + 45)
        conep(M["gold"], 0.016, 0.07, (0.01 + 0.05 * math.cos(a), 0.05 * math.sin(a),
              b["headZ"] + b["headR"] + 0.02), vertices=5)
    banner(b, M["vhorren_l"])
    cape(b, M["vhorren_d"])

def h_vhorren_5():  # Lich Vhorrag (mystik): hůl s fialovou sférou, roba
    b = body("vhorren", "undead", robe=True)
    hood(b, M["vhorren_d"])
    cape(b, M["dark"], w=1.1)
    rod(M["dark"], 0.02, 1.1, (0.20, 0, 0.58))
    sphere(M["nether"], 0.06, (0.20, 0, 1.14))
    for side in (-1, 1):
        conep(M["dark"], 0.02, 0.10, (0.20, side * 0.055, 1.16),
              rx=side * math.radians(35), vertices=5)

# gryk — skřeti
def h_gryk_0():  # Škrab Rychloprst (rychlý): dýka a pytel kořisti
    b = body("gryk", "goblin")
    hood(b, M["gryk_d"])
    rod(M["steel"], 0.012, 0.22, (0.20, -0.05, 0.42), ry=0.4)
    sphere(M["leather"], 0.13, (-0.16, 0.05, 0.42), squash=0.85)

def h_gryk_1():  # Vřešt Krvezub (útočník): zubatý sekáček
    b = body("gryk", "goblin")
    rod(M["wood"], 0.016, 0.3, (0.2, -0.02, 0.40))
    slab(M["iron"], (0.09, 0.02, 0.22), (0.24, -0.02, 0.64))
    for i in range(3):
        conep(M["iron"], 0.018, 0.05, (0.30, -0.02, 0.56 + i * 0.08),
              ry=math.radians(90), vertices=5)

def h_gryk_2():  # Grud Železný krunýř (ochránce): štít z vrakoviny
    b = body("gryk", "goblin")
    helmet(b, M["iron"])
    slab(M["iron"], (0.05, 0.24, 0.40), (0.24, 0, 0.22))
    slab(M["wood"], (0.02, 0.10, 0.13), (0.28, 0.05, 0.26), rz=0.3)
    slab(M["leather"], (0.02, 0.08, 0.10), (0.28, -0.07, 0.16), rz=-0.2)

def h_gryk_3():  # Mrk Houževnatý (neúnavný): kyj s hroty a helma-kotlík
    b = body("gryk", "goblin")
    helmet(b, M["grey_d"])
    rod(M["wood"], 0.02, 0.36, (0.19, -0.02, 0.38), ry=-0.3)
    sphere(M["dark"], 0.065, (0.26, -0.02, 0.58))
    for a in (0.4, 1.6, 2.9, 4.4):
        conep(M["iron"], 0.014, 0.055, (0.26 + 0.055 * math.cos(a), -0.02, 0.58 + 0.055 * math.sin(a)),
              ry=math.radians(90) - a, vertices=5)

def h_gryk_4():  # Náčelník Zubodrv (vojevůdce): kostěný totem roje
    b = body("gryk", "goblin")
    banner(b, M["gryk"])
    sphere(M["bone"], 0.045, (0.16, -0.05, 1.40))
    for side in (-1, 1):
        conep(M["bone"], 0.02, 0.09, (0, side * 0.14, b["shoulder"] + 0.02),
              rx=side * math.radians(-25), vertices=5)

def h_gryk_5():  # Kejklíř Chrchel (mystik): chřestící hůl se zeleným žárem
    b = body("gryk", "goblin", robe=True)
    hood(b, M["gryk_d"])
    rod(M["wood"], 0.016, 0.8, (0.20, 0, 0.42))
    sphere(M["bone"], 0.04, (0.20, 0, 0.84))
    sphere(M["jed"], 0.026, (0.20, 0, 0.91))
    sphere(M["bone"], 0.018, (0.25, 0.04, 0.72))
    sphere(M["bone"], 0.018, (0.15, -0.05, 0.66))


def h_militia():  # šedá domobrana: prostý kopiník s malým štítem
    b = body("militia", "human")
    helmet(b, M["grey_d"])
    spear(0.19)
    rod(M["grey"], 0.13, 0.04, (0.19, -0.03, 0.45),
        rx=math.radians(75), rz=math.radians(20), vertices=12)


# ---------- render ----------

def render_one(name, builder, seed):
    random.seed(seed)
    for ob in list(bpy.data.objects):
        if not ob.name.startswith("RIG_"):
            bpy.data.objects.remove(ob, do_unlink=True)
    builder()
    bpy.context.scene.render.filepath = os.path.join(OUT_DIR, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("OK:", name)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    setup_scene()
    make_materials()
    jobs = []
    g = globals()
    for fkey in ["aldar", "yllien", "durgar", "horda", "brakkar", "sarn", "vhorren", "gryk"]:
        for i in range(6):
            jobs.append((f"hero_{fkey}_{i}", g[f"h_{fkey}_{i}"]))
    jobs.append(("hero_militia", h_militia))
    only = os.environ.get("ONLY")   # ONLY=prefix přerenderuje odpovídající sprity
    suffix = os.environ.get("SUFFIX", "")  # např. _big → hero_big_<fkey>_<i>.png
    for i, (name, fn) in enumerate(jobs):
        if only and not name.startswith(only):
            continue
        out = ("hero" + suffix + name[4:]) if suffix else name  # hero_big_aldar_0
        render_one(out, fn, seed=300 + i)
    print("HOTOVO ->", OUT_DIR)


main()
