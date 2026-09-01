# Válka popela — PROMO RENDERY (Sunborn ☀ vs Ashen 🔥).
#
#   blender -b -P promo.py                     # všechny scény, 1920×1080
#   SCENA=stretnuti RES=960 VZORKY=48 blender -b -P promo.py   # rychlý náhled
#
# Proč vlastní skript a ne kreslený plakát: hrdiny už umí postavit
# make_heroes.py, takže promo ukazuje TYTÉŽ figurky, které hráč vidí ve hře —
# jen z filmové kamery místo z ortho spritovací. Skript si make_heroes načte
# jako knihovnu (stejný trik jako nahled_mapy.py s make_tiles.py): usekne se
# závěrečné volání main(), zbytek se vykoná do vlastního slovníku.
#
# Scény:
#   stretnuti — Mara z Dubové tvrze (Sunborn) proti Ghazku Popelnému (Ashen)
#               nad popelnou trhlinou, za nimi korouhve a šiky obou stran
#   sunborn   — karta strany Sunborn: šik Aldaru s korouhvemi (zlaté světlo)
#   ashen     — karta strany Ashen: šik Hordy s korouhvemi (žhavé světlo)
#
# Výstup: ../render/promo_<scéna>.png

import bpy
import math
import os
import random

ZDROJ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "make_heroes.py")
OUT_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "render"))

# make_heroes.py jako knihovna — bez závěrečného main()
_src = open(ZDROJ, encoding="utf-8").read().rsplit("main()", 1)[0]
MH = {"__file__": ZDROJ, "__name__": "make_heroes_lib"}
exec(compile(_src, ZDROJ, "exec"), MH)

M = None            # slovník materiálů z make_heroes (plní se v priprav_scenu)
RES = int(os.environ.get("RES", "1920"))
VZORKY = int(os.environ.get("VZORKY", "160"))
MLHA = os.environ.get("MLHA", "1") == "1"

# barvy stran přesně podle js/game.js → SIDES
SUNBORN = (0.898, 0.812, 0.478)     # #e5cf7a
ASHEN = (0.878, 0.416, 0.302)       # #e06a4d


# ---------- scéna ----------

def priprav_scenu(sirka, vyska):
    """Prázdný svět, Cycles, rozlišení. Materiály make_heroes se musí vyrobit
    AŽ TEĎ — read_factory_settings smaže datablocky předchozí scény."""
    global M
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = VZORKY
    sc.cycles.use_denoising = True
    sc.cycles.device = "CPU"
    sc.render.film_transparent = False
    sc.render.resolution_x = sirka
    sc.render.resolution_y = vyska
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    for prevod in ("AgX", "Filmic", "Standard"):   # ať skript přežije i jinou verzi Blenderu
        try:
            sc.view_settings.view_transform = prevod
            break
        except TypeError:
            continue
    # AgX vytahuje světla do bíla a bere barvám sytost; podexponování vrací
    # frakčním modré a červené jejich barvu.
    sc.view_settings.exposure = -0.8
    for vzhled in ("AgX - Punchy", "Punchy", "Filmic - High Contrast", "None"):
        try:
            sc.view_settings.look = vzhled
            break
        except TypeError:
            continue
    MH["make_materials"]()
    M = MH["M"]


def nebe(hore, dole, sila=1.0):
    """Pozadí přechodem: bouřková obloha nahoře, žhavý obzor dole."""
    w = bpy.data.worlds.new("nebe")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs[1].default_value = sila
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.42
    ramp.color_ramp.elements[0].color = (*dole, 1.0)
    ramp.color_ramp.elements[1].position = 0.62
    ramp.color_ramp.elements[1].color = (*hore, 1.0)
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mapr = nt.nodes.new("ShaderNodeMapRange")
    # Incoming míří OD pozadí ke kameře, takže při pohledu vzhůru je jeho Z
    # ZÁPORNÉ — rozsah proto běží z 0,05 do −0,55. (Generated je 0..1 a přechod
    # z něj vyjde celý nad hlavou: obloha je pak jednolitá stěna.)
    mapr.inputs[1].default_value = 0.10      # obzor
    mapr.inputs[2].default_value = -0.22     # horní okraj záběru
    tex = nt.nodes.new("ShaderNodeNewGeometry")
    nt.links.new(tex.outputs["Incoming"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], mapr.inputs[0])
    nt.links.new(mapr.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs["Color"], bg.inputs[0])
    nt.links.new(bg.outputs[0], out.inputs[0])


def natoceni_na(kde, cil):
    """Euler, kterým se objekt hledící po svém −Z (kamera I plošné světlo)
    natočí z bodu `kde` na bod `cil`.

    Blender skládá XYZ euler jako Rz·Ry·Rx, takže rot_x je odklon od +Z
    a rot_z azimut MÍNUS 90°. S plusem se objekt otočí přesně opačným
    směrem — render pak vyjde prázdný a světlo svítí do prázdna."""
    dx, dy, dz = cil[0] - kde[0], cil[1] - kde[1], cil[2] - kde[2]
    return (math.atan2(math.hypot(dx, dy), dz), 0.0, math.atan2(dy, dx) - math.pi / 2)


def kamera(kde, cil, ohnisko=50.0, clona=None):
    """Kamera v bodě `kde` namířená na `cil`; volitelně hloubka ostrosti."""
    bpy.ops.object.camera_add(location=kde)
    cam = bpy.context.object
    cam.name = "RIG_cam"
    cam.data.lens = ohnisko
    dx, dy, dz = cil[0] - kde[0], cil[1] - kde[1], cil[2] - kde[2]
    cam.rotation_euler = natoceni_na(kde, cil)
    if clona:
        cam.data.dof.use_dof = True
        cam.data.dof.focus_distance = math.sqrt(dx * dx + dy * dy + dz * dz)
        cam.data.dof.aperture_fstop = clona
    bpy.context.scene.camera = cam
    return cam


def slunce(smer, barva, sila, uhel=3.0):
    bpy.ops.object.light_add(type="SUN", rotation=smer)
    s = bpy.context.object
    s.name = "RIG_sun"
    s.data.energy = sila
    s.data.color = barva
    s.data.angle = math.radians(uhel)
    return s


def plosne(kde, mira, barva, sila, cil=(0, 0, 0.8)):
    """Plošné světlo svítí po svém −Z, takže se dá mířit stejným vzorcem
    jako kamera. Ruční eulery jsou past — světlo pak míří mimo scénu."""
    bpy.ops.object.light_add(type="AREA", location=kde, rotation=natoceni_na(kde, cil))
    l = bpy.context.object
    l.name = "RIG_area"
    l.data.size = mira
    l.data.energy = sila
    l.data.color = barva
    return l


def povrch(jmeno, barva, rough=0.9, metal=0.0, zar=None, sila=0.0):
    return MH["mat"](jmeno, barva, rough=rough, metal=metal, emit=zar, emit_str=sila)


def povrch_zeme(jmeno, barva, kontrast=0.35, hrubost=0.3, relief=0.25):
    """Zem s šumem v barvě i v reliéfu. Holá plocha čte jako lino — a
    protože jsou pláně obou stran přes půl obrazu, je to vidět nejvíc."""
    m = bpy.data.materials.new(jmeno)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.95

    # Šum MUSÍ dostat souřadnice z Object, ne výchozí Generated: Generated
    # normalizuje na obalový kvádr, takže přes plochu 60×60 projde sotva jedna
    # buňka šumu a povrch vyjde úplně hladký.
    souradnice = nt.nodes.new("ShaderNodeTexCoord")
    sum_hruby = nt.nodes.new("ShaderNodeTexNoise")
    sum_hruby.inputs["Scale"].default_value = hrubost
    sum_hruby.inputs["Detail"].default_value = 8.0
    sum_jemny = nt.nodes.new("ShaderNodeTexNoise")
    sum_jemny.inputs["Scale"].default_value = hrubost * 12.0
    sum_jemny.inputs["Detail"].default_value = 6.0
    nt.links.new(souradnice.outputs["Object"], sum_hruby.inputs["Vector"])
    nt.links.new(souradnice.outputs["Object"], sum_jemny.inputs["Vector"])

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.38
    ramp.color_ramp.elements[0].color = (*[c * (1.0 - kontrast) for c in barva], 1.0)
    ramp.color_ramp.elements[1].position = 0.62
    ramp.color_ramp.elements[1].color = (*[min(1.0, c * (1.0 + kontrast)) for c in barva], 1.0)
    nt.links.new(sum_hruby.outputs["Fac"], ramp.inputs[0])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = relief
    nt.links.new(sum_jemny.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def postav(stavitel, kde, rot_z=0.0, meritko=1.0):
    """Postaví hrdinu stavitelem z make_heroes a přenese ho na místo.
    Objekty se pověsí na prázdný uzel, aby se transformace nemusela
    skládat kus po kuse (tentýž postup jako poloz() v nahled_mapy.py)."""
    pred = set(bpy.data.objects)
    stavitel()
    nove = [o for o in bpy.data.objects if o not in pred]
    bpy.ops.object.empty_add(location=(0, 0, 0))
    uzel = bpy.context.object
    for o in nove:
        o.parent = uzel
        o.matrix_parent_inverse = uzel.matrix_world.inverted()
    uzel.location = kde
    uzel.rotation_euler = (0, 0, rot_z)
    uzel.scale = (meritko, meritko, meritko)
    return uzel


# ---------- kulisy ----------

def zeme():
    """Dvě půle světa: vyprahlá zlatá step Sunbornů (−X) a popelná pláň
    Ashenů (+X). Mezi nimi žhnoucí trhlina — hranice, o kterou se hraje."""
    step = povrch_zeme("z_step", (0.26, 0.20, 0.10), kontrast=0.45, hrubost=2.2)
    popel = povrch_zeme("z_popel", (0.030, 0.027, 0.028), kontrast=0.6, hrubost=0.35,
                        relief=0.35)
    for x, m in ((-30.0, step), (30.0, popel)):
        bpy.ops.mesh.primitive_plane_add(size=60, location=(x, 14, 0))
        bpy.context.object.data.materials.append(m)

    # spálený pruh a v něm žhavé praskliny, mizející k obzoru
    spalene = povrch("z_spal", (0.05, 0.043, 0.04), rough=0.95)
    MH["slab"](spalene, (1.1, 70.0, 0.02), (0, 14, 0.005))
    zar = povrch("z_zar", (0.9, 0.25, 0.05), zar=(1.0, 0.36, 0.06), sila=9.0)
    random.seed(77)
    for _ in range(110):
        y = random.uniform(-2.0, 26.0)
        x = random.uniform(-0.28, 0.28)
        # praskliny u kamery musí být DROBNÉ, jinak z trhliny vyjde přistávací dráha
        d = random.uniform(0.12, 0.5) * (0.5 + min(1.0, abs(y) / 8.0))
        MH["slab"](zar, (random.uniform(0.02, 0.05), d, 0.02), (x, y, 0.012),
                   rz=random.uniform(-0.4, 0.4))

    # balvany a pahýly pro siluetu; vlevo trsy suché trávy
    kamen = povrch("z_kamen", (0.13, 0.12, 0.12), rough=0.95)
    drevo = povrch("z_drevo", (0.09, 0.07, 0.06), rough=0.95)
    trava = povrch("z_trava", (0.42, 0.34, 0.14), rough=0.95)
    for _ in range(26):
        x = random.choice([-1, 1]) * random.uniform(1.4, 9.0)
        y = random.uniform(0.5, 20.0)
        r = random.uniform(0.09, 0.30)
        MH["sphere"](kamen, r, (x, y, r * 0.35), squash=0.5)
    for _ in range(9):        # pahýly stromů na popelné straně
        x = random.uniform(1.8, 11.0)
        y = random.uniform(2.0, 22.0)
        h = random.uniform(0.9, 2.4)
        MH["cyl"](drevo, 0.09, h, (x, y, 0), vertices=6, r2=0.03)
        for _ in range(2):
            MH["rod"](drevo, 0.03, random.uniform(0.3, 0.7),
                      (x, y, h * random.uniform(0.6, 0.9)),
                      ry=random.uniform(-1.1, 1.1), rz=random.uniform(0, 3.0))
    for _ in range(220):      # trsy trávy na sluneční straně
        x = -random.uniform(0.9, 13.0)
        y = random.uniform(-1.0, 24.0)
        h = random.uniform(0.08, 0.20)
        MH["conep"](trava, 0.022, h, (x, y, h * 0.45),
                    ry=random.uniform(-0.5, 0.5), rx=random.uniform(-0.4, 0.4),
                    vertices=4)

    # vzdálený hřeben — bez něj se obloha s plání potkají v jedné rovné čáře
    hory = povrch("z_hory", (0.10, 0.09, 0.11), rough=0.98)
    for _ in range(26):
        x = random.uniform(-26.0, 26.0)
        y = random.uniform(38.0, 62.0)
        h = random.uniform(2.5, 8.0)
        MH["conep"](hory, random.uniform(3.0, 7.5), h, (x, y, h * 0.42),
                    rz=random.uniform(0, 3.0), vertices=5)


def jiskry(kolik=170):
    """Popel a jiskry ve vzduchu — drží se popelné strany a středu."""
    z1 = povrch("j_zar1", (1.0, 0.45, 0.10), zar=(1.0, 0.45, 0.10), sila=22.0)
    z2 = povrch("j_zar2", (1.0, 0.75, 0.35), zar=(1.0, 0.78, 0.40), sila=14.0)
    random.seed(31)
    for i in range(kolik):
        y = random.uniform(0.5, 14.0)
        x = random.uniform(-1.2, 6.0)
        z = random.uniform(0.2, 3.4)
        # velikost roste se vzdáleností, ať blízké jiskry nevypadají jako sníh
        r = random.uniform(0.004, 0.011) * (0.6 + y / 9.0)
        MH["sphere"](z1 if i % 3 else z2, r, (x, y, z))


def korouhev(kde, barva_latky, rot_z=0.0, vyska=2.6, lebka=False):
    """Vysoká zástava do pozadí — dodává šiku siluetu nad hlavami."""
    zerd = MH["rod"](M["wood"], 0.035, vyska, (kde[0], kde[1], vyska / 2))
    latka = MH["slab"](barva_latky, (0.62, 0.03, 0.86),
                       (kde[0] + 0.34, kde[1] - 0.04, vyska - 0.62), rz=rot_z)
    hrot = MH["conep"](M["bone"] if lebka else M["gold"], 0.05, 0.16,
                       (kde[0], kde[1], vyska + 0.08), vertices=6)
    if lebka:
        MH["sphere"](M["bone"], 0.09, (kde[0], kde[1], vyska + 0.02))
    return zerd, latka, hrot


def sik(strana, pocet=13, x0=0.0, sirka=(0.8, 2.2), y0=1.9, krok=0.34):
    """Šik pěšáků v hloubce za hrdinou. Bere se prostý kopiník z make_heroes,
    ale obarvený rodem — body() bere barvu z FACTION_COL podle klíče."""
    fkey = "aldar" if strana < 0 else "horda"
    rasa = "human" if strana < 0 else "demon"
    random.seed(11 if strana < 0 else 12)

    def vojak():
        b = MH["body"](fkey, rasa)
        MH["helmet"](b, M[fkey + "_d"])
        MH["spear"](0.19)

    for i in range(pocet):
        x = x0 + strana * random.uniform(*sirka)
        y = y0 + i * krok + random.uniform(-0.25, 0.25)
        natoc = (0.0 if strana < 0 else math.pi) + random.uniform(-0.3, 0.3)
        postav(vojak, (x, y, 0.0), rot_z=natoc, meritko=random.uniform(0.92, 1.04))


def mlha(hustota=0.010):
    """Řídký kouř přes celou scénu — světlo v něm dostane pruhy."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 12, 4))
    kostka = bpy.context.object
    kostka.scale = (34, 46, 9)
    m = bpy.data.materials.new("mlha")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (0.40, 0.33, 0.29, 1.0)
    vol.inputs["Density"].default_value = hustota
    vol.inputs["Anisotropy"].default_value = 0.35
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    kostka.data.materials.append(m)


def zar_trhliny(od=-1.0, do=16.0, kolik=8):
    """Trhlina musí do scény OPRAVDU svítit, ne být jen světlá nálepka:
    řada teplých bodových světel těsně nad ní podsvítí zem i vnitřní strany
    obou šiků. (Dělá to, co by jinak dělal bloom v kompozitoru — ten je
    v Blenderu 5.2 přes `compositing_node_group` v pozadí nepoužitelný,
    do vstupu skupiny se render nepustí a vypadne z něj bílá plocha.)"""
    for i in range(kolik):
        t = i / max(1, kolik - 1)
        y = od + (do - od) * t
        bpy.ops.object.light_add(type="POINT", location=(0.0, y, 0.10))
        l = bpy.context.object
        l.name = "RIG_zar"
        l.data.color = (1.0, 0.42, 0.12)
        l.data.shadow_soft_size = 0.15
        # vzdálenější světla musí být silnější, jinak trhlina po pár metrech zhasne
        l.data.energy = 55.0 + 230.0 * t


def uloz(jmeno):
    bpy.context.scene.render.filepath = os.path.join(OUT_DIR, jmeno + ".png")
    bpy.ops.render.render(write_still=True)
    print("OK:", jmeno)


# ---------- scéna 1: střetnutí ----------

def scena_stretnuti():
    priprav_scenu(RES, RES * 9 // 16)
    # Obloha svítí na CELOU scénu — při síle 1 dělá tak silný ambient, že
    # zmizí stíny i barevné přísvity a AgX z toho udělá pastel. Drž ji nízko.
    nebe(hore=(0.015, 0.022, 0.048), dole=(0.45, 0.15, 0.05), sila=0.13)
    zeme()

    # hrdinové: Mara z Dubové tvrze (meč nad hlavou) × Ghazk Popelný (žhavá čepel)
    postav(MH["h_aldar_1"], (-0.86, 0.2, 0.0), rot_z=math.radians(-22), meritko=1.12)
    postav(MH["h_horda_0"], (0.86, 0.2, 0.0), rot_z=math.pi + math.radians(22), meritko=1.12)

    # korouhevníci o krok vzad, ať je vidět, kdo za koho stojí
    postav(MH["h_aldar_4"], (-1.62, 1.7, 0.0), rot_z=math.radians(-14), meritko=1.06)
    postav(MH["h_horda_4"], (1.62, 1.7, 0.0), rot_z=math.pi + math.radians(14), meritko=1.06)

    sik(-1)
    sik(1)
    korouhev((-2.5, 4.4, 0), M["aldar"], rot_z=math.radians(8), vyska=2.9)
    korouhev((-1.5, 6.8, 0), M["aldar_d"], rot_z=math.radians(-6), vyska=2.6)
    korouhev((2.5, 4.4, 0), M["horda"], rot_z=math.radians(-8), vyska=2.9, lebka=True)
    korouhev((1.5, 6.8, 0), M["horda_d"], rot_z=math.radians(6), vyska=2.6, lebka=True)
    jiskry(130)
    if MLHA:
        mlha(0.0035)
    zar_trhliny()

    # světla: zlaté nízké slunce zleva (Sunborn), žhavý přísvit zprava (Ashen)
    slunce((math.radians(76), 0, math.radians(-112)), SUNBORN, 12.0, uhel=1.2)
    plosne((3.6, 2.6, 1.2), 4.0, ASHEN, 900.0, cil=(0.9, 0.3, 0.8))    # žár zprava
    plosne((-3.6, -1.6, 1.8), 3.5, (1.0, 0.84, 0.55), 260.0,
           cil=(-0.9, 0.3, 0.8))                                       # zlaté nasvícení tváří
    plosne((0, -4.0, 2.6), 6.0, (0.34, 0.44, 0.72), 90.0,
           cil=(0, 1.0, 0.7))                       # studený protisvit od kamery

    # Kamera ve výšce hrudi hrdiny a mírně vzhůru. Níž (0,4) sice hrdiny
    # zvedne, ale širokoúhlá zem pak sežere spodní dvě třetiny obrazu.
    kamera((0.0, -4.2, 0.78), (0.0, 0.6, 0.95), ohnisko=45.0, clona=2.2)
    uloz("promo_stretnuti")


# ---------- scéna 2 a 3: karty stran ----------

def scena_strany(jmeno, stavitel, korouhevnik, klic_latky, teple, studene, strana):
    """Karta strany: šik s korouhvemi a zástupcem vepředu, na výšku 3:4.

    ZÁMĚRNĚ NENÍ portrét zblízka. Figurky z make_heroes.py jsou stavěné na
    256px sprity — v detailu se ukáže, že štít je holá deska a zástava plochý
    obdélník. Z polocelku, s hloubkou ostrosti a mlhou, funguje tentýž model
    dobře. Od záběru se odvíjí i to, že se scéna staví kolem CELÉHO šiku."""
    priprav_scenu(RES * 3 // 4, RES)
    ashen = strana > 0
    nebe(hore=(0.014, 0.020, 0.044), dole=teple, sila=0.22)
    zeme()
    x = strana * 2.3
    # Figurky jsou modelované z profilu (zbraně míří na +X), takže tříčtvrteční
    # natočení K KAMEŘE je jediné, ve kterém je zbraň i silueta vidět. U Ashena
    # se proto PŘIČÍTÁ +26° za otočkou o 180°, ne odčítá — s mínusem se otočí
    # od kamery pryč.
    natoc = (math.pi + math.radians(26)) if ashen else math.radians(-26)
    postav(stavitel, (x, 0.0, 0.0), rot_z=natoc, meritko=1.12)
    postav(korouhevnik, (x - strana * 0.95, 1.5, 0.0), rot_z=natoc, meritko=1.05)
    sik(strana, pocet=11, x0=x, sirka=(-0.9, 1.1), y0=2.4, krok=0.36)
    korouhev((x - strana * 1.5, 4.0, 0), M[klic_latky], vyska=3.0, lebka=ashen)
    korouhev((x + strana * 1.4, 5.4, 0), M[klic_latky + "_d"],
             rot_z=math.radians(-10), vyska=2.6, lebka=ashen)
    korouhev((x - strana * 0.4, 7.2, 0), M[klic_latky], rot_z=math.radians(12),
             vyska=2.8, lebka=ashen)
    jiskry(110)
    zar_trhliny(od=-1.0, do=14.0, kolik=6)
    if MLHA:
        mlha(0.0035)

    stred = (x, 0.6, 0.75)
    # klíčové světlo je TEPLEJŠÍ než barva strany — bledě zlatá #e5cf7a
    # nasvítí Sunborna do studeného bíla a zlato ze scény zmizí
    klic = tuple(min(1.0, c * k) for c, k in zip(teple, (1.12, 0.94, 0.72)))
    slunce((math.radians(76), 0, math.radians(-112)), teple, 11.0, uhel=1.5)
    plosne((x + strana * 3.0, 3.2, 1.6), 4.0, teple, 700.0, cil=stred)
    plosne((x - strana * 2.6, -2.2, 1.8), 3.0, klic, 420.0, cil=stred)
    plosne((x + strana * 2.4, -3.0, 1.2), 3.0, studene, 180.0, cil=stred)
    kamera((x + strana * 0.45, -3.5, 1.02), (x - strana * 0.15, 1.3, 0.95),
           ohnisko=52.0, clona=2.5)
    uloz("promo_" + jmeno)


def scena_sunborn():
    scena_strany("sunborn", MH["h_aldar_1"], MH["h_aldar_4"], "aldar",
                 teple=SUNBORN, studene=(0.40, 0.52, 0.80), strana=-1)


def scena_ashen():
    scena_strany("ashen", MH["h_horda_0"], MH["h_horda_4"], "horda",
                 teple=ASHEN, studene=(0.34, 0.40, 0.72), strana=1)


SCENY = {"stretnuti": scena_stretnuti, "sunborn": scena_sunborn, "ashen": scena_ashen}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    chce = os.environ.get("SCENA")
    for jmeno, fn in SCENY.items():
        if chce and jmeno != chce:
            continue
        fn()
    print("HOTOVO ->", OUT_DIR)


main()
