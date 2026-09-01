# Válka popela — výroba kompletní sady izometrických spritů.
# Spouští se headless:  blender -b -P make_tiles.py
#
# Jedna pevná ortografická kamera (náklon 55°) pro všechny sprity, takže se
# dají skládat do mapy: střed pole (0,0,0) je vždy uprostřed obrázku.
# Geometrie pro klient: 160 px/jednotku, squash cos(55°), hex poloměr 1.
#
# Sada:
#   biomy aldar/yllien/durgar/horda/center × terény plains/forest/hills
#   water, bridge_a (30°), bridge_b (120°), wall, ruins
#   struktury: city, fortress, throne, capital_<frakce> (4×)
# Výstup: ../render/<jméno>.png (512×512, průhledné pozadí)

import bpy
import math
import os
import random

OUT_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "render"))

CAM_TILT = math.radians(55)
ORTHO_SCALE = 3.2
RES = 512


# ---------- scéna ----------

def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.cycles.device = "CPU"
    scene.render.film_transparent = True
    scene.render.resolution_x = RES
    scene.render.resolution_y = RES
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), 0, math.radians(-40)))
    sun = bpy.context.object
    sun.data.energy = 3.5
    sun.data.angle = math.radians(12)
    sun.name = "RIG_sun"

    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.65, 0.75, 1.0, 1.0)
    bg.inputs[1].default_value = 0.7

    d = 10.0
    bpy.ops.object.camera_add(
        location=(0, -d * math.sin(CAM_TILT), d * math.cos(CAM_TILT)),
        rotation=(CAM_TILT, 0, 0))
    cam = bpy.context.object
    cam.name = "RIG_cam"
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = ORTHO_SCALE
    scene.camera = cam


def mat(name, color, rough=0.85, metal=0.0, emit=None, emit_str=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_str
    return m


def _tmavsi(c, k):
    return tuple(max(0.0, x * (1 - k)) for x in c)


def _svetlejsi(c, k):
    return tuple(min(1.0, x + (1 - x) * k) for x in c)


# ---------- fotografické podklady povrchů (v0.56) — ZMĚŘENO A VYPNUTO ----------
#
# ⚠ NEZAPÍNAT BEZ PŘEČTENÍ. Vyzkoušeno s CC0 sadami z ambientCG (Ground037
# tráva, Rock030 kámen, Ground048 hlína, 1K PNG) a NEVYPLATILO SE:
# místní kontrast povrchu při zoomu 6,5 vyšel 38,51 → 39,61, tedy +2,9 %,
# za cenu modelu o 40 % většího (113 → 159 kB u aldar_plains).
#
# Důvod je STRUKTURÁLNÍ, ne v nastavení: barva se peče do mapy 512 px, která
# pokrývá CELÝ dílek i s rekvizitami (smart_project atlas), takže na samotnou
# zem zbyde kolem 200×200 px. Fotka 1K se do toho převzorkuje a veškerý detail
# se zahodí — procedurální šum nižší frekvence přežije líp. Ceiling je tedy
# rozlišení pečení, a to je schválně nízké kvůli velikosti stahování (v0.17).
#
# Aby se to vyplatilo, musela by barva na 2048 px → .glb sada z 5,7 MB na
# ~20 MB. Pro prohlížeč nepřijatelné; kdyby projekt někdy šel do nativního
# buildu, kde je rozpočet textur jiný, je to tady připravené (FOTO=1) —
# soubory se stahují z ambientcg.com/get?file=<ID>_1K-PNG.zip a patří do
# art/textury-zdroj/ jako <sada>_Color.png, <sada>_NormalGL.png,
# <sada>_Roughness.png. Chybí-li, materiál mlčky zůstane procedurální.
#
# Levnější cesta ke stejnému cíli je DETAILNÍ NORMÁLA AŽ V SHADERU
# (render3d.js) — ta rozlišením pečení omezená není.
#
# Fotka se nepoužívá jako barva, ale jako OVERLAY přes procedurální barvu —
# biom si tím udrží svůj odstín (popel zůstane šedý, step zlatá) a z fotky
# vezme jen strukturu. Jedna sada tak obslouží víc biomů.
FOTO_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "textury-zdroj"))
FOTO_MERITKO = float(os.environ.get("FOTO_MERITKO", "1.2"))
FOTO_SILA = float(os.environ.get("FOTO_SILA", "0.75"))
FOTO_ZAP = os.environ.get("FOTO", "0") != "0"

# Materiál → sada. VÝSLOVNÝ seznam, ne hádání z názvu: fotka zeminy na kmeni
# stromu, na zlatě nebo na krystalu vypadá hůř než čistá procedurální barva.
FOTO_MAT = {}
for _n in ("a_grass", "a_grass2", "bk_grass", "sr_grass", "y_grass", "gr_moss",
           "a_field", "sr_dry", "wheat", "wheat2"):
    FOTO_MAT[_n] = "trava"
for _n in ("bk_rock", "c_rock", "d_rock", "h_rock", "h_basalt", "stone",
           "stone_dark", "wallm", "d_ore"):
    FOTO_MAT[_n] = "kamen"
for _n in ("d_dirt", "d_dirt2", "c_ash", "c_ash2", "h_ash", "vh_ash", "gr_mud",
           "sand", "h_burnt", "bank"):
    FOTO_MAT[_n] = "hlina"


def _foto_cesta(sada, mapa):
    return os.path.join(FOTO_DIR, "%s_%s.png" % (sada, mapa))


def _foto_sada(name):
    """Sada pro daný materiál, nebo None — když chybí soubory, mlčky se
    přeskočí a materiál zůstane čistě procedurální (build nespadne)."""
    if not FOTO_ZAP:
        return None
    sada = FOTO_MAT.get(name)
    if not sada:
        return None
    for mapa in ("Color", "NormalGL", "Roughness"):
        if not os.path.exists(_foto_cesta(sada, mapa)):
            return None
    return sada


def _mix_rgba(nt, blend, fac):
    """ShaderNodeMix s barevnými sokety. Indexy sokety se mezi verzemi
    Blenderu přečíslovaly, takže se hledají podle JMÉNA A TYPU."""
    n = nt.nodes.new("ShaderNodeMix")
    n.data_type = "RGBA"
    n.blend_type = blend
    n.clamp_factor = True
    a = [s for s in n.inputs if s.name == "A" and s.type == "RGBA"][0]
    b = [s for s in n.inputs if s.name == "B" and s.type == "RGBA"][0]
    [s for s in n.inputs if s.name == "Factor"][0].default_value = fac
    out = [s for s in n.outputs if s.type == "RGBA"][0]
    return n, a, b, out


def mat_hq(name, color, rough=0.85, metal=0.0, emit=None, emit_str=0.0):
    """Materiál s procedurální variací barvy, mikroreliéfem a nerovnou drsností.

    POZOR: procedurální uzly se do glTF NEPŘENESOU. Tenhle materiál má smysl
    jen tam, kde se výsledek zapeče do obrázků (make_models.py) nebo vyrenderuje
    do spritu (zkouska_textur.py). Pro plochý export slouží mat().

    Šum se počítá v souřadnicích OBJEKTU, takže vzor drží při zemi i po spojení
    dílku do jednoho meshe. Vrství se dvakrát — hrubě (velké fleky) a jemně
    (zrno) — protože rekvizity jsou malé a hrubý šum sám by je obarvil jednolitě.
    """
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = metal
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_str

    coord = nt.nodes.new("ShaderNodeTexCoord")

    def sum(scale, detail=6.0, drsnost=0.55):
        n = nt.nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = drsnost
        nt.links.new(coord.outputs["Object"], n.inputs["Vector"])
        return n

    def rampa(n, a, b, p0=0.32, p1=0.70):
        r = nt.nodes.new("ShaderNodeValToRGB")
        r.color_ramp.elements[0].position = p0
        r.color_ramp.elements[0].color = (*a, 1.0)
        r.color_ramp.elements[1].position = p1
        r.color_ramp.elements[1].color = (*b, 1.0)
        nt.links.new(n.outputs["Fac"], r.inputs["Fac"])
        return r

    # 1) barva: hrubé fleky × jemné zrno
    hrube = rampa(sum(11.0, detail=8.0), _tmavsi(color, 0.18), _svetlejsi(color, 0.20))
    jemne = rampa(sum(46.0, detail=4.0), (0.88,) * 3, (1.10,) * 3, p0=0.38, p1=0.66)
    nasob = nt.nodes.new("ShaderNodeVectorMath")
    nasob.operation = "MULTIPLY"
    nt.links.new(hrube.outputs["Color"], nasob.inputs[0])
    nt.links.new(jemne.outputs["Color"], nasob.inputs[1])
    nt.links.new(nasob.outputs["Vector"], bsdf.inputs["Base Color"])

    # 2) reliéf: hrubší vlna + jemné zrno — světlo se láme, povrch není plast
    vlna = sum(26.0, detail=5.0)
    zrno = sum(95.0, detail=6.0)
    scti = nt.nodes.new("ShaderNodeMath")
    scti.operation = "MULTIPLY_ADD"
    scti.inputs[1].default_value = 0.45          # váha zrna
    nt.links.new(zrno.outputs["Fac"], scti.inputs[0])
    nt.links.new(vlna.outputs["Fac"], scti.inputs[2])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.32
    bump.inputs["Distance"].default_value = 0.018
    nt.links.new(scti.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    # 3) nerovnoměrná drsnost — jednolitý lesk je to, co dělá „plastový" dojem
    rr = rampa(sum(30.0), (max(0.05, rough - 0.22),) * 3, (min(1.0, rough + 0.12),) * 3)
    nt.links.new(rr.outputs["Color"], bsdf.inputs["Roughness"])

    # 4) fotografický podklad (v0.56) — jen u povrchů, kde dává smysl
    sada = _foto_sada(name)
    if sada:
        # BOX projekce v souřadnicích OBJEKTU, ne UV: dílky jsou rozbalené
        # smart_projectem, takže by se fotka na každém ostrůvku UV lišila
        # měřítkem i natočením. Box mapping se UV úplně vyhne.
        mapovani = nt.nodes.new("ShaderNodeMapping")
        mapovani.inputs["Scale"].default_value = (FOTO_MERITKO,) * 3
        nt.links.new(coord.outputs["Object"], mapovani.inputs["Vector"])

        def obraz(mapa, barevny):
            img = nt.nodes.new("ShaderNodeTexImage")
            img.image = bpy.data.images.load(_foto_cesta(sada, mapa), check_existing=True)
            img.projection = "BOX"
            img.projection_blend = 0.3
            if not barevny:
                img.image.colorspace_settings.name = "Non-Color"
            nt.links.new(mapovani.outputs["Vector"], img.inputs["Vector"])
            return img

        prekryv, pa, pb, pven = _mix_rgba(nt, "OVERLAY", FOTO_SILA)
        nt.links.new(nasob.outputs["Vector"], pa)
        nt.links.new(obraz("Color", True).outputs["Color"], pb)
        nt.links.new(pven, bsdf.inputs["Base Color"])

        # Normála fotky jde do VSTUPU bump uzlu, ne místo něj — procedurální
        # mikroreliéf se tak navrství NA fotku místo aby ji přebil.
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 0.9
        nt.links.new(obraz("NormalGL", False).outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bump.inputs["Normal"])

        drs, da, db, dven = _mix_rgba(nt, "MULTIPLY", 0.65)
        nt.links.new(rr.outputs["Color"], da)
        nt.links.new(obraz("Roughness", False).outputs["Color"], db)
        nt.links.new(dven, bsdf.inputs["Roughness"])
    return m


# ---------- stavební dílky ----------

def hex_base(material, height=0.14, radius=1.0):
    """Čtvercová deska pole o straně √3·radius (stejný vnitřní poloměr, jaký
    měl dřívější hex — rekvizity rozmístěné do 0,866 se vejdou beze změny).
    Celý dílek se při exportu otáčí o 45°, takže na mapě je z něj kosočtverec
    („na koso" jako v předloze). Jméno funkce zůstává kvůli 45 stavitelům."""
    s = math.sqrt(3) * radius / 2          # půl strany čtverce
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, height / 2))
    ob = bpy.context.object
    ob.scale = (2 * s, 2 * s, height)
    bpy.ops.object.transform_apply(scale=True)   # bevel má běžet až po měřítku
    ob.data.materials.append(material)
    bev = ob.modifiers.new("bevel", "BEVEL")
    bev.width = 0.035
    bev.segments = 2
    return ob


# půl úhlopříčky dílku — vzdálenost středu k rohu kosočtverce; pásy vedené
# od rohu k rohu (hradby, řeky, mosty) mají délku 2×DIAG a v rozích na sebe
# navazují se sousedy
DIAG = math.sqrt(1.5)


def cone(material, radius, depth, loc, vertices=32, rot_z=0.0, r2=0.0):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=r2,
                                    depth=depth, location=(loc[0], loc[1], loc[2] + depth / 2))
    ob = bpy.context.object
    ob.rotation_euler[2] = rot_z
    ob.data.materials.append(material)
    return ob


def box(material, size, loc, rot_z=0.0):
    bpy.ops.mesh.primitive_cube_add(location=(loc[0], loc[1], loc[2] + size[2] / 2))
    ob = bpy.context.object
    ob.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    ob.rotation_euler[2] = rot_z
    ob.data.materials.append(material)
    return ob


def cylinder(material, radius, depth, loc, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=(loc[0], loc[1], loc[2] + depth / 2))
    ob = bpy.context.object
    ob.data.materials.append(material)
    return ob


def rozhyb(ob, sila=0.22, sila_z=0.0):
    """Rozhýbe vodorovný poloměr vrcholů — z čistého jehlanu udělá skálu,
    z hladkého elipsoidu korunu stromu.

    PROČ ZROVNA SILUETA: pole má na obrazovce 52 px při oddálení 1 a nanejvýš
    ~260 px při plném přiblížení. Rekvizita na něm měří pár desítek pixelů,
    takže z ní není vidět nic než obrys — a čistý kužel čte jako zmrzlina,
    ať má povrch jakkoli hezkou texturu.

    Spodního kroužku se nedotýká ve svislém směru, aby rekvizita dosedla na
    zem bez skuliny.
    """
    me = ob.data
    zmin = min(v.co.z for v in me.vertices)
    for v in me.vertices:
        r = math.hypot(v.co.x, v.co.y)
        if r > 1e-5:                       # osové vrcholy (špička, póly) nechat
            k = 1.0 + random.uniform(-sila, sila)
            v.co.x *= k
            v.co.y *= k
        if sila_z and abs(v.co.z - zmin) > 1e-5:
            v.co.z += random.uniform(-sila_z, sila_z)
    return ob


def blob(material, radius, loc, squash=0.55, nerovny=0.0):
    """Zaoblený kopeček / koruna stromu. `nerovny` rozbije pravidelnost."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=7, radius=radius,
                                         location=loc)
    ob = bpy.context.object
    ob.scale = (1, 1, squash)
    ob.data.materials.append(material)
    if nerovny:
        rozhyb(ob, nerovny, sila_z=nerovny * radius * 0.6)
    return ob


def skala(material, radius, height, loc, patra=3, vertices=7, sila=0.26):
    """Skalní jehla z několika zúžených pater — každé pootočené a rozhýbané.
    Jeden kužel dá pravidelný jehlan; tři na sobě dají hřeben s odsazenými
    hranami, který v herní velikosti čte jako kámen.
    """
    z = loc[2]
    r = radius
    # Patra musí být RŮZNĚ vysoká a s různým přesahem. Se stejnými vyjde
    # pravidelný stupňovitý jehlan („svatební dort"), což je stejně umělé
    # jako čistý kužel — jen jinak.
    vahy = [random.uniform(0.65, 1.35) for _ in range(patra)]
    soucet = sum(vahy)
    for i, w in enumerate(vahy):
        r2 = radius * (1.0 - (i + 1) / patra) ** 1.25
        h = height * w / soucet
        ob = cone(material, r, h,
                  (loc[0] + random.uniform(-0.05, 0.05) * radius,
                   loc[1] + random.uniform(-0.05, 0.05) * radius, z),
                  vertices=vertices, rot_z=random.uniform(0, math.pi), r2=r2)
        rozhyb(ob, sila)
        z += h
        r = r2 * random.uniform(0.96, 1.16)   # někde římsa, jinde plynulý svah


def jehlicnan(m_kmen, m_jehlici, x, y, z, s=1.0, patra=3):
    """Jehličnan z patrových kuželů. Jediný kužel čte jako zmrzlina, tři
    přesahující patra dají zubatý obrys, který je poznat i na 30 pixelech."""
    cylinder(m_kmen, 0.04 * s, 0.18 * s, (x, y, z), vertices=6)
    zz = z + 0.10 * s
    for i in range(patra):
        r = (0.25 - i * 0.055) * s
        h = (0.28 - i * 0.035) * s
        rozhyb(cone(m_jehlici, r, h, (x, y, zz), vertices=8,
                    rot_z=random.uniform(0, 1),
                    r2=r * 0.22 if i < patra - 1 else 0.0), 0.17)
        zz += h * 0.60         # patra se překrývají, jinak jsou mezi nimi díry


def scatter(n, rmin=0.15, rmax=0.85):
    for _ in range(n):
        a = random.uniform(0, 2 * math.pi)
        r = random.uniform(rmin, rmax)
        yield math.cos(a) * r, math.sin(a) * r


def banner(color_mat, pole_mat, loc, h=0.5):
    cylinder(pole_mat, 0.015, h, loc, vertices=6)
    box(color_mat, (0.16, 0.02, 0.12), (loc[0] + 0.09, loc[1], loc[2] + h - 0.14))


# ---------- materiály ----------

M = {}

def make_materials():
    # společné
    M["water"] = mat("water", (0.13, 0.30, 0.48), rough=0.15)
    M["sand"] = mat("sand", (0.62, 0.55, 0.38))
    M["foam"] = mat("foam", (0.72, 0.78, 0.79), rough=0.55)   # čára příboje u břehu
    M["bank"] = mat("bank", (0.46, 0.39, 0.26))               # říční břeh (tmavší než písek)
    M["trunk"] = mat("trunk", (0.30, 0.20, 0.12))
    M["wood"] = mat("wood", (0.45, 0.31, 0.16))
    M["wood_dark"] = mat("wood_dark", (0.28, 0.18, 0.09))
    M["stone"] = mat("stone", (0.52, 0.50, 0.46))
    M["stone_dark"] = mat("stone_dark", (0.33, 0.32, 0.30))
    M["wall"] = mat("wallm", (0.62, 0.57, 0.47))
    M["roof"] = mat("roof", (0.48, 0.16, 0.12))
    M["gold"] = mat("gold", (0.85, 0.62, 0.18), rough=0.35, metal=0.8)
    M["snow"] = mat("snow", (0.92, 0.94, 0.97), rough=0.6)

    # aldar — lidé: zelené pláně, pole, statky
    M["a_grass"] = mat("a_grass", (0.24, 0.44, 0.17))
    M["a_grass2"] = mat("a_grass2", (0.16, 0.33, 0.12))
    M["a_field"] = mat("a_field", (0.68, 0.55, 0.22))
    M["a_leaf"] = mat("a_leaf", (0.15, 0.34, 0.12))

    # yllien — elfové: sytá zeleň, květy, krystaly
    M["y_grass"] = mat("y_grass", (0.13, 0.42, 0.20))
    M["y_leaf"] = mat("y_leaf", (0.08, 0.38, 0.18))
    M["y_leaf2"] = mat("y_leaf2", (0.20, 0.52, 0.22))
    M["y_flower1"] = mat("y_flower1", (0.85, 0.75, 0.30))
    M["y_flower2"] = mat("y_flower2", (0.80, 0.45, 0.70))
    M["y_crystal"] = mat("y_crystal", (0.35, 0.85, 0.75), rough=0.2,
                         emit=(0.25, 0.75, 0.65), emit_str=1.6)

    # durgar — orkové: suchá zem, železo, ostré skály
    M["d_dirt"] = mat("d_dirt", (0.42, 0.32, 0.19))
    M["d_dirt2"] = mat("d_dirt2", (0.33, 0.24, 0.14))
    M["d_rock"] = mat("d_rock", (0.36, 0.31, 0.27))
    M["d_iron"] = mat("d_iron", (0.42, 0.40, 0.42), rough=0.35, metal=0.9)
    M["d_ore"] = mat("d_ore", (0.75, 0.45, 0.15), rough=0.3, metal=0.7)
    M["d_pine"] = mat("d_pine", (0.16, 0.24, 0.13))

    # horda — démoni: čedič, popel, láva
    M["h_basalt"] = mat("h_basalt", (0.16, 0.13, 0.13))
    M["h_ash"] = mat("h_ash", (0.24, 0.20, 0.19))
    M["h_rock"] = mat("h_rock", (0.20, 0.16, 0.16))
    M["h_lava"] = mat("h_lava", (0.9, 0.3, 0.05), emit=(1.0, 0.35, 0.05), emit_str=6.0)
    M["h_ember"] = mat("h_ember", (0.8, 0.25, 0.05), emit=(1.0, 0.4, 0.08), emit_str=3.0)
    M["h_burnt"] = mat("h_burnt", (0.12, 0.10, 0.09))

    # střed — popel Vellaru: bledě šedá, žhavé praskliny
    M["c_ash"] = mat("c_ash", (0.45, 0.43, 0.41))
    M["c_ash2"] = mat("c_ash2", (0.36, 0.34, 0.33))
    M["c_rock"] = mat("c_rock", (0.40, 0.38, 0.37))
    M["c_dead"] = mat("c_dead", (0.30, 0.27, 0.24))

    # frakční barvy (praporce hlavních měst)
    M["f_aldar"] = mat("f_aldar", (0.18, 0.42, 0.80))
    M["f_yllien"] = mat("f_yllien", (0.12, 0.65, 0.55))
    M["f_durgar"] = mat("f_durgar", (0.82, 0.48, 0.12))
    M["f_horda"] = mat("f_horda", (0.75, 0.16, 0.13))
    M["f_brakkar"] = mat("f_brakkar", (0.55, 0.60, 0.66))
    M["f_sarn"] = mat("f_sarn", (0.72, 0.62, 0.25))
    M["f_vhorren"] = mat("f_vhorren", (0.55, 0.47, 0.75))
    M["f_gryk"] = mat("f_gryk", (0.50, 0.62, 0.20))

    # surovinové rekvizity (overlay sprity res_*)
    M["wheat"] = mat("wheat", (0.80, 0.63, 0.20))
    M["wheat2"] = mat("wheat2", (0.62, 0.47, 0.14))
    # biomy nových frakcí (v0.25)
    M["bk_grass"] = mat("bk_grass", (0.34, 0.42, 0.32))   # chladná horská tráva
    M["bk_rock"] = mat("bk_rock", (0.46, 0.48, 0.52))     # žula Šedých štítů
    M["bk_pine"] = mat("bk_pine", (0.10, 0.26, 0.17))     # horské jehličí
    M["bk_snow"] = mat("bk_snow", (0.82, 0.85, 0.90), rough=0.55)
    M["sr_grass"] = mat("sr_grass", (0.55, 0.52, 0.24))   # zlatavá step
    M["sr_dry"] = mat("sr_dry", (0.70, 0.62, 0.34))       # suchá stébla
    M["sr_leaf"] = mat("sr_leaf", (0.38, 0.46, 0.20))     # ploché koruny akácií
    M["vh_ash"] = mat("vh_ash", (0.52, 0.50, 0.56))       # bledá zem Bezesných plání
    M["vh_dead"] = mat("vh_dead", (0.30, 0.26, 0.24))     # mrtvé dřevo
    M["vh_glow"] = mat("vh_glow", (0.55, 0.45, 0.85), rough=0.25,
                       emit=(0.55, 0.42, 0.95), emit_str=1.6)  # sinalé krystaly
    M["gr_mud"] = mat("gr_mud", (0.40, 0.34, 0.22))       # rozrytá bahnitá zem
    M["gr_moss"] = mat("gr_moss", (0.44, 0.52, 0.26))     # prašivě zelený mech
    M["gr_voda"] = mat("gr_voda", (0.25, 0.30, 0.20), rough=0.2)  # kalné louže
    M["vh_kost"] = mat("vh_kost", (0.80, 0.78, 0.70), rough=0.6)   # zvětralé kosti
    M["arcane"] = mat("arcane", (0.95, 0.75, 0.25), rough=0.25,
                      emit=(1.0, 0.72, 0.15), emit_str=1.1)


# ---------- terénní pole podle biomů ----------

def tuft(material, x, y, s=1.0):
    cone(material, 0.05 * s, 0.12 * s, (x, y, 0.14), vertices=6)


def a_plains():
    hex_base(M["a_grass"])
    # zorané pole s řádky
    box(M["a_field"], (0.7, 0.5, 0.03), (-0.25, 0.25, 0.14), rot_z=0.3)
    for i in range(4):
        box(M["a_grass2"], (0.66, 0.035, 0.045), (-0.25 + 0.11 * math.sin(0.3),
                                                  0.12 + i * 0.115, 0.155), rot_z=0.3)
    # plot a stodola
    for i in range(4):
        cylinder(M["wood_dark"], 0.02, 0.12, (0.3 + i * 0.14, -0.3 - i * 0.04, 0.14), vertices=6)
    box(M["wood"], (0.6, 0.02, 0.05), (0.5, -0.36, 0.2), rot_z=-0.28)
    box(M["wood"], (0.22, 0.18, 0.14), (0.15, -0.55, 0.14))
    cone(M["roof"], 0.16, 0.12, (0.15, -0.55, 0.28), vertices=4, rot_z=math.radians(45))
    for (x, y) in scatter(4, 0.5, 0.85):
        tuft(M["a_grass2"], x, y)


def a_forest():
    hex_base(M["a_grass"])
    # listnaté stromy s kulatou korunou
    for (x, y) in [(-0.45, 0.3), (0.35, 0.45), (0.5, -0.28), (-0.15, -0.45), (0.05, 0.05)]:
        s = random.uniform(0.8, 1.15)
        cylinder(M["trunk"], 0.05 * s, 0.22 * s, (x, y, 0.14), vertices=8)
        blob(M["a_leaf"], 0.22 * s, (x, y, 0.14 + 0.3 * s), nerovny=0.20)
    tuft(M["a_grass2"], 0.6, 0.1)


def a_hills():
    hex_base(M["a_grass"])
    # oblé travnaté kopce, ovčín
    blob(M["a_grass2"], 0.45, (-0.25, 0.2, 0.14), squash=0.5, nerovny=0.13)
    blob(M["a_grass"], 0.34, (0.35, -0.1, 0.14), squash=0.55, nerovny=0.13)
    blob(M["a_grass2"], 0.26, (0.15, 0.45, 0.14), squash=0.5, nerovny=0.13)
    box(M["wood"], (0.16, 0.13, 0.1), (0.42, -0.52, 0.14))
    cone(M["roof"], 0.12, 0.09, (0.42, -0.52, 0.24), vertices=4, rot_z=math.radians(45))


def y_plains():
    hex_base(M["y_grass"])
    for (x, y) in scatter(8, 0.1, 0.8):
        m = M["y_flower1"] if random.random() < 0.5 else M["y_flower2"]
        cylinder(M["y_leaf2"], 0.012, 0.09, (x, y, 0.14), vertices=5)
        blob(m, 0.035, (x, y, 0.25), squash=0.8)
    for (x, y) in scatter(5, 0.3, 0.85):
        tuft(M["y_leaf2"], x, y)


def y_forest():
    hex_base(M["y_grass"])
    # vysoké štíhlé stromy ve dvou patrech zeleně
    for (x, y) in [(-0.4, 0.3), (0.4, 0.4), (0.5, -0.3), (-0.2, -0.42), (0.08, 0.02), (-0.55, -0.1)]:
        s = random.uniform(0.9, 1.2)
        cylinder(M["trunk"], 0.035 * s, 0.3 * s, (x, y, 0.14), vertices=8)
        rozhyb(cone(M["y_leaf"], 0.17 * s, 0.5 * s, (x, y, 0.14 + 0.22 * s),
                    vertices=9, r2=0.05 * s), 0.18)
        rozhyb(cone(M["y_leaf2"], 0.12 * s, 0.32 * s, (x, y, 0.14 + 0.5 * s), vertices=9), 0.18)


def y_hills():
    hex_base(M["y_grass"])
    blob(M["y_leaf2"], 0.42, (-0.25, 0.15, 0.14), squash=0.55, nerovny=0.16)
    blob(M["y_grass"], 0.3, (0.35, -0.15, 0.14), squash=0.6, nerovny=0.13)
    # elfí krystaly vyrůstající ze svahu
    for (x, y, s) in [(-0.2, 0.25, 1.0), (0.0, -0.4, 0.7), (0.45, 0.35, 0.8)]:
        c = cone(M["y_crystal"], 0.09 * s, 0.42 * s, (x, y, 0.16), vertices=6)
        c.rotation_euler[0] = random.uniform(-0.15, 0.15)


def d_plains():
    hex_base(M["d_dirt"])
    # vyprahlá pláň: kameny, železné pláty, ohrada
    for (x, y) in scatter(5, 0.2, 0.8):
        rozhyb(cone(M["d_rock"], 0.08, 0.11, (x, y, 0.14), vertices=6, r2=0.02), 0.3)
    box(M["d_iron"], (0.26, 0.2, 0.04), (-0.3, 0.35, 0.14), rot_z=0.4)
    box(M["d_iron"], (0.18, 0.15, 0.04), (-0.15, 0.18, 0.18), rot_z=0.15)
    for i in range(3):
        cone(M["wood_dark"], 0.035, 0.22, (0.35 + 0.12 * i, -0.35 + 0.05 * i, 0.14), vertices=5)


def d_forest():
    hex_base(M["d_dirt"])
    # řídké tmavé bory a pařezy
    for (x, y) in [(-0.4, 0.3), (0.42, 0.35), (0.15, -0.4), (-0.25, -0.3)]:
        jehlicnan(M["trunk"], M["d_pine"], x, y, 0.14, s=random.uniform(0.9, 1.2))
    cylinder(M["wood_dark"], 0.08, 0.08, (0.5, -0.15, 0.14), vertices=8)
    cylinder(M["wood_dark"], 0.07, 0.07, (-0.05, 0.5, 0.14), vertices=8)


def d_hills():
    hex_base(M["d_dirt2"])
    # ostré skály s žílami rudy
    for ((x, y), r, h) in [((0.0, 0.12), 0.42, 1.0), ((-0.45, -0.2), 0.3, 0.65), ((0.45, -0.15), 0.28, 0.55)]:
        skala(M["d_rock"], r, h, (x, y, 0.14), vertices=6, sila=0.28)
        # kostky rudy zapuštěné do svahu
        for i in range(3):
            a = random.uniform(0, 2 * math.pi)
            rr = r * random.uniform(0.45, 0.75)
            zz = 0.14 + h * random.uniform(0.1, 0.3)
            box(M["d_ore"], (0.09, 0.09, 0.09), (x + math.cos(a) * rr, y + math.sin(a) * rr, zz),
                rot_z=random.uniform(0, 1))


def h_plains():
    hex_base(M["h_basalt"])
    # popelná pláň: žhavé praskliny, kosti, struska
    for i in range(3):
        a = random.uniform(0, math.pi)
        box(M["h_ember"], (random.uniform(0.4, 0.7), 0.035, 0.02),
            (random.uniform(-0.3, 0.3), random.uniform(-0.4, 0.4), 0.135), rot_z=a)
    for (x, y) in scatter(4, 0.3, 0.8):
        rozhyb(cone(M["h_rock"], 0.07, 0.12, (x, y, 0.14), vertices=5, r2=0.02), 0.3)
    cone(M["snow"], 0.03, 0.22, (0.45, 0.3, 0.14), vertices=5)  # trčící kost
    cone(M["snow"], 0.025, 0.16, (-0.5, -0.25, 0.14), vertices=5)


def h_forest():
    hex_base(M["h_ash"])
    # spálený les: holé černé kmeny s pahýly větví
    for (x, y) in [(-0.4, 0.3), (0.35, 0.42), (0.5, -0.25), (-0.15, -0.42), (0.05, 0.05)]:
        s = random.uniform(0.8, 1.1)
        trunk = cone(M["h_burnt"], 0.05 * s, 0.65 * s, (x, y, 0.14), vertices=6)
        for i in range(2):
            br = cone(M["h_burnt"], 0.018, 0.2 * s, (x, y, 0.14 + 0.3 * s + i * 0.12))
            br.rotation_euler[0] = random.uniform(0.8, 1.3)
            br.rotation_euler[2] = random.uniform(0, 6.3)
    box(M["h_ember"], (0.4, 0.03, 0.02), (0.1, -0.1, 0.135), rot_z=0.8)


def h_hills():
    hex_base(M["h_basalt"])
    # sopka s kráterem žhnoucí lávy
    # kráter drž širší, než je lávová tůň — rozhýbaný okraj se zužuje a láva
    # by přes něj jinak vykoukla ven
    rozhyb(cone(M["h_rock"], 0.55, 0.85, (0.02, 0.05, 0.14), vertices=8, r2=0.24), 0.18)
    cylinder(M["h_lava"], 0.15, 0.02, (0.02, 0.05, 0.98), vertices=8)
    # lávový potůček po svahu
    lb = box(M["h_lava"], (0.07, 0.45, 0.02), (0.02 - 0.18, 0.05 - 0.3, 0.55), rot_z=0.35)
    lb.rotation_euler[0] = math.radians(-48)
    skala(M["h_rock"], 0.22, 0.4, (-0.55, -0.25, 0.14), patra=2, vertices=6)
    skala(M["h_rock"], 0.18, 0.3, (0.55, -0.3, 0.14), patra=2, vertices=6)


def c_plains():
    hex_base(M["c_ash"])
    # popelové duny a doutnající zbytky
    blob(M["c_ash2"], 0.35, (-0.25, 0.2, 0.14), squash=0.35, nerovny=0.15)
    blob(M["c_ash2"], 0.25, (0.3, -0.25, 0.14), squash=0.4, nerovny=0.15)
    box(M["h_ember"], (0.3, 0.03, 0.015), (0.15, 0.3, 0.135), rot_z=1.1)
    for (x, y) in scatter(3, 0.4, 0.8):
        rozhyb(cone(M["c_rock"], 0.06, 0.09, (x, y, 0.14), vertices=5, r2=0.02), 0.3)


def c_forest():
    hex_base(M["c_ash"])
    # zkamenělý hvozd: bledé mrtvé kmeny
    for (x, y) in [(-0.4, 0.3), (0.38, 0.4), (0.48, -0.28), (-0.18, -0.4), (0.02, 0.05)]:
        s = random.uniform(0.8, 1.1)
        cone(M["c_dead"], 0.055 * s, 0.6 * s, (x, y, 0.14), vertices=6)
        br = cone(M["c_dead"], 0.02, 0.18 * s, (x, y, 0.14 + 0.32 * s))
        br.rotation_euler[0] = random.uniform(0.9, 1.3)
        br.rotation_euler[2] = random.uniform(0, 6.3)


def c_hills():
    hex_base(M["c_ash2"])
    # šedé skalní věže
    for ((x, y), r, h) in [((0.0, 0.1), 0.34, 0.95), ((-0.42, -0.22), 0.26, 0.6), ((0.42, -0.18), 0.22, 0.5)]:
        skala(M["c_rock"], r, h, (x, y, 0.14), vertices=7, sila=0.24)


# ---------- voda, mosty, hradby, ruiny ----------

def water():
    # jezero: vodní deska s písčitým lemem o kousek níž
    hex_base(M["water"], height=0.08)
    hex_base(M["sand"], height=0.045, radius=1.04)


# ---------- voda, břehy a mosty jako JEDNA PLOCHA (v0.41) ----------
# Do v0.40 nesl každý vodní dílek vlastní koryto s písčitými břehy. Jakmile se
# řeka rozšířila na pás tří polí, byly z toho tři potůčky vedle sebe, každý
# s vlastním pískem. Voda se proto skládá ze tří samostatných kusů:
#   river_flat  — hladká deska přes celé pole; sousedi dosednou hranou na hranu
#   river_bank  — šikmý břeh na JEDNU hranu; renderer ho klade jen tam, kde
#                 voda opravdu končí u souše, a otáčí ho po 90°
#   bridge_*    — jen NÁSTAVBA mostu (hlava + lávka do půlky řeky); zem pod ní
#                 kreslí obyčejný dílek biomu
STRANA = math.sqrt(3)    # strana čtvercové desky pole = rozteč sousedů
VODA_Z = 0.105           # hladina; deska souše má 0,14, takže voda leží níž
MOST_Z = 0.30            # horní plocha lávky


def river_flat():
    """Vodní pole jako kus JEDNÉ hladiny — deska přes celé pole, bez lemu.

    Fazeta tu ZÁMĚRNĚ chybí (hex_base ji dává): mezi dvěma vodními poli by
    udělala rýhu a hladina by se zase rozpadla na dlaždice. Deska je přesně
    tak velká jako rozteč polí, takže sousedi dosednou hranou na hranu — ani
    přesah (ten by dvě stejně vysoké plochy rozblikal), ani skulina.
    """
    box(M["water"], (STRANA, STRANA, VODA_Z), (0, 0, 0))


def river_bank(seed=41):
    """Břeh — svah podél JEDNÉ hrany vodního pole, od hladiny nahoru k úrovni
    souše. Kanonicky leží na stavitelském +Y (na mapě hrana k sousedovi −q);
    renderer ho otáčí po 90° na každou stranu, za kterou voda končí.

    Svah je NAKLONĚNÝ i z technického důvodu: v rohu pásu se potkávají dva břehy
    a dvě šikmé plochy se protnou v čisté hraně (vypadá to jako sbíhající se
    pláž). Dvě vodorovné desky by se v tom rohu překrývaly a blikaly proti sobě.

    Svah se skládá ze ČTYŘ kusů s různě daleko vysunutou vnitřní hranou, takže
    čára vody meandruje místo pravítka. Vnější konec i sklon zůstávají všem
    společné — kusy tak leží v jedné rovině a nemají mezi sebou schod ani na
    hranici polí. `seed` dělá varianty (river_bank, _b, _c), aby se dlouhý břeh
    neopakoval dílek po dílku.
    """
    random.seed(seed)
    s = STRANA / 2
    y_ven, z_ven = s, 0.152            # u souše: o chlup výš než deska pole
    y_dov, z_dov = s - 0.42, 0.068     # druhý konec mizí pod hladinou
    beta = math.atan2(z_ven - z_dov, y_ven - y_dov)
    sklon = math.tan(beta)
    t = 0.22
    kusu = 4
    for i in range(kusu):
        odsun = random.uniform(-0.02, 0.13)          # jak daleko couvne od vody
        y0, z0 = y_dov + odsun, z_dov + odsun * sklon
        delka = math.hypot(y_ven - y0, z_ven - z0)
        b = box(M["bank"], (STRANA / kusu + 0.004, delka, t), (0, 0, 0))
        # deska se naklopí kolem svého středu — posun o půl tloušťky po normále
        # vrátí HORNÍ plochu přesně na spojnici obou konců
        b.location = (-s + STRANA * (i + 0.5) / kusu,
                      (y_ven + y0) / 2 + math.sin(beta) * t / 2,
                      (z_ven + z0) / 2 - math.cos(beta) * t / 2)
        b.rotation_euler[0] = beta

    def na_svahu(y):
        return z_dov + (y - y_dov) * sklon

    # čára pěny na hladině — po kusech, ať břeh není pravítko
    y_pena = y_dov + (VODA_Z - z_dov) / sklon
    x = -s + random.uniform(0.04, 0.2)
    while x < s - 0.2:
        d = random.uniform(0.18, 0.42)
        box(M["foam"], (d, 0.07, 0.012), (x + d / 2, y_pena + random.uniform(0.0, 0.06),
                                          VODA_Z - 0.004))
        x += d + random.uniform(0.12, 0.3)
    # oblázky nad čárou vody a drny nahoře u souše
    for i in range(9):
        y = random.uniform(y_pena - 0.03, y_ven - 0.09)
        x = random.uniform(-s + 0.06, s - 0.06)
        cone(M["stone" if i % 3 else "stone_dark"], random.uniform(0.03, 0.065), 0.055,
             (x, y, na_svahu(y) - 0.02), vertices=5, rot_z=random.uniform(0, 3))
    for i in range(4):
        y = random.uniform(y_ven - 0.16, y_ven - 0.03)
        x = random.uniform(-s + 0.12, s - 0.12)
        blob(M["a_grass2"], random.uniform(0.06, 0.1), (x, y, na_svahu(y)),
             squash=0.4, nerovny=0.25)


def bridge_head(pulka):
    """Nástavba mostu: kamenná hlava na břehu a lávka do PŮLKY řeky. Dvě hlavy
    proti sobě se koncem potkají nad středem toku, takže z nich je jeden most
    přes celý pás — a hráč vidí, že přechod patří oběma břehům zároveň.

    `pulka` je vzdálenost do středu řeky ve světových jednotkách. Úhlopříčné
    řeky mají břehy 4,899 od sebe, osové 6,928 (pás je v mřížce vidět jinak
    široký), proto se pečou dva modely.

    Zem pod mostem model NEKRESLÍ — tu dodá obyčejný dílek biomu. Renderer
    totiž lávku otáčí k protějšímu břehu i o 45° a čtvercová deska by se z
    mřížky vyklopila. Kanonicky míří lávka na stavitelské +Y.
    """
    random.seed(43)
    # Kamenná hlava a schod na souši. POZOR na výšku: horní plocha hlavy nesmí
    # ležet PŘESNĚ v rovině mostovky — dvě splývající plochy se navzájem
    # přebíjejí a v renderu z toho je ČERNÝ obdélník přes celou hlavu.
    box(M["stone"], (0.60, 0.80, 0.12), (0, -0.10, 0.14))
    box(M["stone_dark"], (0.50, 0.20, 0.09), (0, -0.60, 0.14))
    # pilíře v korytě: nohy trestle + příčné břevno
    y = 1.0
    while y < pulka - 0.15:
        for x in (-0.20, 0.20):
            cylinder(M["stone_dark"], 0.075, MOST_Z - 0.06, (x, y, 0.0), vertices=7)
        box(M["wood_dark"], (0.58, 0.08, 0.06), (0, y, MOST_Z - 0.10))
        y += 1.05
    # lávka: mostovka od hlavy až do půlky toku
    d0, d1 = -0.45, pulka
    box(M["wood"], (0.52, d1 - d0, 0.06), (0, (d0 + d1) / 2, MOST_Z - 0.06))
    # Prkna napříč. Řadí se od SPÁRY zpátky k břehu, aby obě půlky navazovaly
    # rytmem a spára uprostřed toku nebyla vidět jako vynechané prkno.
    y = d1 - 0.105
    while y > d0:
        box(M["wood_dark"], (0.56, 0.07, 0.075), (0, y, MOST_Z - 0.075))
        y -= 0.21
    # zábradlí se sloupky (madlo až ke spáře, jinak by tam byl zub)
    for side in (-1, 1):
        box(M["wood_dark"], (0.05, d1 - d0 - 0.05, 0.045),
            (0.27 * side, (d0 + 0.05 + d1) / 2, MOST_Z + 0.10))
        y = d1 - 0.2
        while y > d0 + 0.1:
            cylinder(M["wood_dark"], 0.028, 0.16, (0.27 * side, y, MOST_Z - 0.02), vertices=6)
            y -= 0.55


def river_tile(angle_deg):
    """PŮVODNÍ řeka jako KORYTO přes pole — pás vody od rohu k rohu, ne celá
    deska. Od v0.41 se nepoužívá (hladina je river_flat + river_bank), stavitel
    zůstává, aby šly staré dílky river_a–d znovu vyrobit.
    angle_deg je směr koryta ve stavitelských souřadnicích (−45° = po exportní
    otočce světová osa X, +45° = osa Z)."""
    random.seed(7)   # oblázky vždy stejně — dílek se exportuje jen jednou
    hex_base(M["sand"])
    a = math.radians(angle_deg)
    box(M["water"], (2 * DIAG + 0.06, 0.5, 0.022), (0, 0, 0.132), rot_z=a)
    # oblázky a drny na březích
    for i in range(6):
        u = random.uniform(-0.6, 0.6)
        v = random.uniform(0.36, 0.52) * (1 if i % 2 else -1)
        x, y = math.cos(a) * u - math.sin(a) * v, math.sin(a) * u + math.cos(a) * v
        cone(M["stone" if i % 3 else "stone_dark"], 0.05, 0.07, (x, y, 0.14),
             vertices=5, rot_z=u * 3)


def bridge(angle_deg):
    # PŮVODNÍ most JEDNÍM polem uprostřed vody (do v0.40); od v0.41 ho nahradily
    # dvě hlavy bridge_head na březích. angle_deg = směr LÁVKY, koryto teče kolmo.
    river_tile(angle_deg + 90)
    a = math.radians(angle_deg)
    # dřevěná lávka přes celé pole, natočená kolmo k řece
    deck = box(M["wood"], (2.0, 0.5, 0.06), (0, 0, 0.18), rot_z=a)
    for i in range(-4, 5):
        box(M["wood_dark"], (0.09, 0.54, 0.075),
            (math.cos(a) * i * 0.21, math.sin(a) * i * 0.21, 0.175), rot_z=a)
    # zábradlí
    for side in (-1, 1):
        ox, oy = -math.sin(a) * 0.27 * side, math.cos(a) * 0.27 * side
        box(M["wood_dark"], (1.9, 0.04, 0.05), (ox, oy, 0.30), rot_z=a)
        for i in (-0.8, -0.3, 0.3, 0.8):
            cylinder(M["wood_dark"], 0.025, 0.12, (math.cos(a) * i + ox, math.sin(a) * i + oy, 0.21), vertices=6)


def wall_tile(angle_deg):
    """Hradba jako VAL od rohu k rohu (−45° = světová osa X, +45° = osa Z).
    Prstenec z takových dílků vypadá na obrazovce jako souvislá rovná zeď."""
    hex_base(M["c_ash"])
    a = math.radians(angle_deg)
    ca, sa = math.cos(a), math.sin(a)
    box(M["stone_dark"], (2 * DIAG + 0.1, 0.44, 0.16), (0, 0, 0.14), rot_z=a)  # podezdívka
    box(M["stone"], (2 * DIAG + 0.1, 0.32, 0.36), (0, 0, 0.30), rot_z=a)
    # zuby cimbuří po obou hranách valu
    for i in range(-5, 6):
        u = i * 0.225
        for side in (-1, 1):
            box(M["stone_dark"], (0.11, 0.06, 0.13),
                (ca * u - sa * 0.13 * side, sa * u + ca * 0.13 * side, 0.66), rot_z=a)
    # dvě strážní věžičky
    for u in (-0.6, 0.6):
        cylinder(M["stone"], 0.12, 0.6, (ca * u, sa * u, 0.14), vertices=8)
        cone(M["stone_dark"], 0.16, 0.14, (ca * u, sa * u, 0.74), vertices=8)


# ---------- biomy nových frakcí (v0.25) ----------

def mrtvy_strom(x, y, s=1.0):
    """Bezlistý strom Bezesných plání: kmen + nakloněné haluze."""
    cylinder(M["vh_dead"], 0.045 * s, 0.34 * s, (x, y, 0.14), vertices=7)
    for (rx, ry, dz) in [(0.5, 0.2, 0.30), (-0.45, -0.3, 0.24), (0.15, 0.55, 0.34)]:
        c = cone(M["vh_dead"], 0.022 * s, 0.26 * s, (x, y, 0.14 + dz * s), vertices=5)
        c.rotation_euler[0] = rx
        c.rotation_euler[1] = ry


def akacie(x, y, s=1.0):
    """Stepní strom s plochou korunou."""
    cylinder(M["trunk"], 0.035 * s, 0.26 * s, (x, y, 0.14), vertices=7)
    blob(M["sr_leaf"], 0.20 * s, (x, y, 0.14 + 0.28 * s), squash=0.32, nerovny=0.12)


def bk_plains():
    hex_base(M["bk_grass"])
    # kamenná mohyla a runový kámen — trpasličí značky cest
    for (x, y, ss) in [(-0.3, 0.3, 1.0), (0.35, -0.2, 0.7)]:
        skala(M["bk_rock"], 0.16 * ss, 0.22 * ss, (x, y, 0.14), patra=2, vertices=6)
    box(M["stone_dark"], (0.10, 0.06, 0.30), (0.15, 0.35, 0.14), rot_z=0.25)
    for (x, y) in scatter(5, 0.35, 0.85):
        cone(M["bk_rock"], 0.05, 0.06, (x, y, 0.14), vertices=5, rot_z=x * 3)
    for (x, y) in scatter(3, 0.2, 0.8):
        tuft(M["bk_grass"], x, y)


def bk_forest():
    hex_base(M["bk_grass"])
    random.seed(41)
    for (x, y) in scatter(6, 0.15, 0.8):
        s = random.uniform(0.8, 1.15)
        jehlicnan(M["trunk"], M["bk_pine"], x, y, 0.14, s=s, patra=3)
    cone(M["bk_rock"], 0.09, 0.10, (0.45, -0.4, 0.14), vertices=5)


def bk_hills():
    hex_base(M["bk_grass"])
    # žulové štíty se sněhovými čepicemi
    skala(M["bk_rock"], 0.30, 0.62, (-0.18, 0.16, 0.14), patra=4, vertices=7)
    blob(M["bk_snow"], 0.10, (-0.18, 0.16, 0.72), squash=0.5)
    skala(M["bk_rock"], 0.22, 0.4, (0.3, -0.2, 0.14), patra=3, vertices=6)
    blob(M["bk_snow"], 0.07, (0.3, -0.2, 0.51), squash=0.5)
    for (x, y) in scatter(4, 0.5, 0.85):
        cone(M["stone_dark"], 0.06, 0.08, (x, y, 0.14), vertices=5)


def sr_plains():
    hex_base(M["sr_grass"])
    # vlnící se step: trsy, balvan, vyšlapaná stezka stád
    box(M["sr_dry"], (0.9, 0.16, 0.02), (-0.1, 0.05, 0.14), rot_z=0.5)
    for (x, y) in scatter(8, 0.2, 0.85):
        cone(M["sr_dry"], 0.045, 0.13, (x, y, 0.14), vertices=5)
    blob(M["stone"], 0.09, (0.4, 0.3, 0.14), squash=0.5)


def sr_forest():
    hex_base(M["sr_grass"])
    random.seed(43)
    akacie(-0.25, 0.25, 1.1)
    akacie(0.35, -0.1, 0.9)
    akacie(0.05, -0.45, 0.75)
    for (x, y) in scatter(5, 0.4, 0.85):
        cone(M["sr_dry"], 0.04, 0.11, (x, y, 0.14), vertices=5)


def sr_hills():
    hex_base(M["sr_grass"])
    # travnaté vrchy s kamennými čely
    blob(M["sr_grass"], 0.34, (-0.2, 0.2, 0.14), squash=0.5, nerovny=0.12)
    blob(M["sr_grass"], 0.24, (0.3, -0.22, 0.14), squash=0.45, nerovny=0.12)
    skala(M["stone"], 0.13, 0.18, (0.05, 0.45, 0.14), patra=2, vertices=6)
    for (x, y) in scatter(4, 0.5, 0.85):
        cone(M["sr_dry"], 0.04, 0.10, (x, y, 0.14), vertices=5)


def vh_plains():
    hex_base(M["vh_ash"])
    # bledá pláň: náhrobky, kosti, sinalý krystal
    for (x, y, r) in [(-0.3, 0.25, 0.2), (0.28, -0.15, -0.4), (0.1, 0.45, 0.9)]:
        box(M["stone_dark"], (0.09, 0.04, 0.16), (x, y, 0.14), rot_z=r)
    cone(M["vh_glow"], 0.05, 0.16, (0.35, 0.3, 0.14), vertices=6)
    for (x, y) in scatter(4, 0.3, 0.8):
        blob(M["vh_kost"], 0.035, (x, y, 0.15), squash=0.5)


def vh_forest():
    hex_base(M["vh_ash"])
    random.seed(47)
    mrtvy_strom(-0.25, 0.25, 1.15)
    mrtvy_strom(0.3, -0.05, 0.95)
    mrtvy_strom(-0.05, -0.4, 0.8)
    mrtvy_strom(0.42, 0.38, 0.7)
    cone(M["vh_glow"], 0.04, 0.12, (-0.45, -0.15, 0.14), vertices=6)


def vh_hills():
    hex_base(M["vh_ash"])
    # bledé útesy prorostlé sinalými krystaly
    skala(M["c_ash2"], 0.28, 0.5, (-0.18, 0.18, 0.14), patra=3, vertices=7)
    skala(M["c_ash2"], 0.2, 0.34, (0.3, -0.22, 0.14), patra=3, vertices=6)
    cone(M["vh_glow"], 0.06, 0.2, (0.05, 0.02, 0.14), vertices=6)
    cone(M["vh_glow"], 0.04, 0.13, (0.14, -0.06, 0.14), vertices=6)
    for (x, y) in scatter(3, 0.55, 0.85):
        cone(M["stone_dark"], 0.05, 0.07, (x, y, 0.14), vertices=5)


def gr_plains():
    hex_base(M["gr_mud"])
    # rozrytá zem roje: louže, výkopky, mechové fleky
    box(M["gr_voda"], (0.3, 0.2, 0.015), (-0.25, 0.25, 0.14), rot_z=0.4)
    cone(M["gr_mud"], 0.14, 0.10, (0.05, 0.4, 0.14), vertices=6)      # halda výkopků
    blob(M["gr_moss"], 0.14, (0.35, -0.15, 0.14), squash=0.25)
    blob(M["gr_moss"], 0.10, (-0.4, -0.3, 0.14), squash=0.25)
    for (x, y) in scatter(4, 0.4, 0.85):
        cone(M["stone_dark"], 0.045, 0.06, (x, y, 0.14), vertices=5)


def gr_forest():
    hex_base(M["gr_mud"])
    random.seed(53)
    # pokroucené stromy a pařezy po skřetí těžbě
    for (x, y, ss) in [(-0.28, 0.28, 1.0), (0.32, 0.05, 0.85)]:
        c = cylinder(M["wood_dark"], 0.05 * ss, 0.3 * ss, (x, y, 0.14), vertices=7)
        c.rotation_euler[0] = 0.18
        blob(M["gr_moss"], 0.16 * ss, (x + 0.05, y + 0.03, 0.14 + 0.3 * ss), squash=0.5, nerovny=0.2)
    stump(-0.1, -0.35, 1.1)
    stump(0.45, -0.35, 0.8)
    stump(-0.5, -0.05, 0.9)


def gr_hills():
    hex_base(M["gr_mud"])
    # rozhryzané vrchy: díry nor a hromady hlušiny
    skala(M["gr_mud"], 0.28, 0.4, (-0.2, 0.18, 0.14), patra=3, vertices=7)
    cylinder(M["wood_dark"], 0.09, 0.05, (-0.1, -0.05, 0.14), vertices=8)  # ústí nory
    cone(M["stone_dark"], 0.16, 0.14, (0.32, -0.25, 0.14), vertices=6)     # hlušina
    cone(M["stone_dark"], 0.11, 0.10, (0.45, 0.1, 0.14), vertices=6)
    blob(M["gr_moss"], 0.1, (-0.35, 0.45, 0.14), squash=0.3)


def wall_rohova():
    """Rohový díl hradby: dvě poloviční ramena od středu k rohům (světová +X
    a +Z) s nárožní věží. Prstenec Manhattan má rohy na osách — bez brány tam
    val zahýbá o 90°. Ostatní orientace řeší otočka instance v render3d."""
    hex_base(M["c_ash"])
    vez = 0.16
    for uhel in (-45, 45):   # rameno k +X a rameno k +Z (po exportní otočce)
        a = math.radians(uhel)
        ca, sa = math.cos(a), math.sin(a)
        stred = DIAG / 2 + 0.03
        box(M["stone_dark"], (DIAG + 0.1, 0.44, 0.16), (ca * stred, sa * stred, 0.14), rot_z=a)
        box(M["stone"], (DIAG + 0.1, 0.32, 0.36), (ca * stred, sa * stred, 0.30), rot_z=a)
        for i in range(3):
            u = 0.35 + i * 0.3
            for side in (-1, 1):
                box(M["stone_dark"], (0.11, 0.06, 0.13),
                    (ca * u - sa * 0.13 * side, sa * u + ca * 0.13 * side, 0.66), rot_z=a)
    # mohutná nárožní věž ve středu zlomu
    cylinder(M["stone"], 0.22, 0.7, (0, 0, 0.14), vertices=8)
    cone(M["stone_dark"], 0.27, 0.16, (0, 0, 0.84), vertices=8)


def capital_brakkar():
    # trpasličí hlubina: kamenné terasy zaříznuté do skály, bronzová vrata
    hex_base(M["d_dirt2"])
    bronz = mat("bk_bronz", (0.55, 0.38, 0.18), rough=0.4, metal=0.8)
    box(M["stone_dark"], (1.5, 1.5, 0.2), (0, 0, 0.14))
    box(M["stone"], (1.1, 1.1, 0.3), (0, 0.05, 0.34))
    # čelo síně s vraty a dvěma sloupy
    box(M["stone_dark"], (0.7, 0.16, 0.5), (0, -0.5, 0.34))
    box(bronz, (0.3, 0.05, 0.34), (0, -0.58, 0.36))
    for sx in (-1, 1):
        box(M["stone"], (0.12, 0.12, 0.62), (sx * 0.42, -0.52, 0.34))
        cone(M["stone_dark"], 0.1, 0.1, (sx * 0.42, -0.52, 0.96), vertices=4, rot_z=math.radians(45))
    # stupňovitá hora nad síní
    skala(M["stone"], 0.5, 0.8, (0, 0.25, 0.6), patra=4, vertices=7)
    cone(bronz, 0.05, 0.16, (0, 0.25, 1.44), vertices=6)
    for (x, y) in [(-0.55, 0.4), (0.55, 0.35)]:
        skala(M["stone_dark"], 0.22, 0.35, (x, y, 0.34), patra=3, vertices=6)
    banner(M["f_brakkar"], M["wood_dark"], (-0.5, -0.55, 0.14), h=0.5)
    banner(M["f_brakkar"], M["wood_dark"], (0.5, -0.6, 0.14), h=0.55)


def capital_sarn():
    # jezdecké klany: kruh jurt kolem totemu koně, ohrada z kůlů
    hex_base(M["sr_grass"])
    kuze = mat("sr_kuze", (0.64, 0.5, 0.32), rough=0.9)
    for i in range(10):
        a = math.radians(i * 36 + 18)
        cylinder(M["wood_dark"], 0.03, 0.2, (math.cos(a) * 0.78, math.sin(a) * 0.78, 0.14), vertices=6)
    # jurty: nízké válce s kuželovou střechou
    for (x, y, s) in [(0.35, 0.3, 1.0), (-0.35, 0.35, 0.9), (0.42, -0.3, 0.85),
                      (-0.4, -0.25, 0.95), (0.0, 0.5, 0.8)]:
        cylinder(kuze, 0.17 * s, 0.14 * s, (x, y, 0.14), vertices=10)
        cone(M["wheat"], 0.2 * s, 0.15 * s, (x, y, 0.14 + 0.14 * s), vertices=10)
    # totem koně: vysoký kůl s "hlavou"
    cylinder(M["wood"], 0.05, 0.85, (0, -0.02, 0.14), vertices=8)
    b = box(M["wood_dark"], (0.26, 0.08, 0.12), (0.06, -0.02, 0.95))
    b.rotation_euler[1] = -0.3
    banner(M["f_sarn"], M["wood_dark"], (-0.55, 0.0, 0.14), h=0.6)
    banner(M["f_sarn"], M["wood_dark"], (0.55, 0.12, 0.14), h=0.5)


def capital_vhorren():
    # bezesná říše: bledá nekropole — obelisky, kostěné věže, sinalá záře
    hex_base(M["c_ash2"])
    kost = mat("vh_kost", (0.78, 0.76, 0.68), rough=0.6)
    for i in range(8):
        a = math.radians(i * 45 + 22)
        x, y = math.cos(a) * 0.72, math.sin(a) * 0.72
        box(M["stone_dark"], (0.1, 0.08, 0.3 + (i % 3) * 0.1), (x, y, 0.14), rot_z=a)
    # ústřední mauzoleum s obeliskem
    box(kost, (0.62, 0.62, 0.26), (0, 0.02, 0.14))
    box(M["stone_dark"], (0.4, 0.4, 0.14), (0, 0.02, 0.40))
    cone(kost, 0.13, 0.85, (0, 0.02, 0.54), vertices=4, rot_z=math.radians(45), r2=0.03)
    blob(M["arcane"], 0.06, (0, 0.02, 1.42), squash=1.0)
    # dvě kostěné věžky a náhrobky
    for sx in (-1, 1):
        cylinder(kost, 0.09, 0.55, (sx * 0.45, -0.32, 0.14), vertices=6)
        cone(M["stone_dark"], 0.11, 0.14, (sx * 0.45, -0.32, 0.69), vertices=6)
    for (x, y) in scatter(4, 0.45, 0.8):
        box(kost, (0.08, 0.04, 0.14), (x, y, 0.14), rot_z=x * 2)


def capital_gryk():
    # skřetí roj: palisáda z klád, šikmé chatrče, kostěný totem
    hex_base(M["d_dirt"])
    for i in range(12):
        a = math.radians(i * 30 + 8)
        c = cylinder(M["wood_dark"], 0.045, 0.3 + (i % 3) * 0.07,
                     (math.cos(a) * 0.8, math.sin(a) * 0.8, 0.14), vertices=5)
        c.rotation_euler[0] = random.uniform(-0.12, 0.12)
    # chatrče nakřivo
    for (x, y, s, r) in [(0.25, 0.25, 1.0, 0.3), (-0.3, 0.3, 0.85, -0.4), (0.3, -0.3, 0.9, 0.8)]:
        b = box(M["wood"], (0.3 * s, 0.26 * s, 0.2 * s), (x, y, 0.14), rot_z=r)
        c = cone(M["wheat2"], 0.24 * s, 0.16 * s, (x, y, 0.14 + 0.2 * s), vertices=5, rot_z=r)
        c.rotation_euler[0] = 0.1
    # kostěný totem s lebkou (bledý blob)
    kost = mat("gr_kost", (0.8, 0.77, 0.68), rough=0.7)
    cylinder(M["wood_dark"], 0.05, 0.7, (-0.05, -0.05, 0.14), vertices=6)
    blob(kost, 0.09, (-0.05, -0.05, 0.86), squash=0.9)
    for a in (0.5, 2.2, 4.1):
        cone(kost, 0.04, 0.14, (math.cos(a) * 0.5, math.sin(a) * 0.5, 0.14), vertices=4)
    banner(M["f_gryk"], M["wood_dark"], (0.5, 0.45, 0.14), h=0.45)


def ruins():
    hex_base(M["c_ash"])
    # rozbité sloupořadí a trosky
    for (x, y, h) in [(-0.35, 0.25, 0.5), (-0.05, 0.35, 0.32), (0.3, 0.28, 0.55),
                      (-0.3, -0.2, 0.24), (0.35, -0.25, 0.4)]:
        cylinder(M["stone"], 0.07, h, (x, y, 0.14), vertices=10)
    b = box(M["stone_dark"], (0.5, 0.14, 0.1), (0.0, -0.05, 0.2), rot_z=0.5)
    b.rotation_euler[0] = 0.15
    for (x, y) in scatter(4, 0.4, 0.8):
        cone(M["stone_dark"], 0.07, 0.1, (x, y, 0.14), vertices=5)


# ---------- struktury ----------

def ctvercove_hradby(mat_zed, wall_r, delka, tl=0.09, vyska=0.22, vez_r=0.075, vez_h=0.3):
    """Čtyři zdi rovnoběžné s hranami desky + věže v rozích — po exportní
    otočce hradby lícují s kosočtvercem pole."""
    for i in range(4):
        a = math.radians(90 * i)
        box(mat_zed, (delka, tl, vyska), (math.cos(a) * wall_r, math.sin(a) * wall_r, 0.14),
            rot_z=a + math.pi / 2)
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        cylinder(mat_zed, vez_r, vez_h, (sx * wall_r, sy * wall_r, 0.14), vertices=8)


def city():
    hex_base(M["a_grass"])
    ctvercove_hradby(M["wall"], 0.62, 1.18)
    box(M["stone"], (0.34, 0.34, 0.34), (0, 0.05, 0.14))
    cone(M["roof"], 0.26, 0.22, (0, 0.05, 0.48), vertices=4, rot_z=math.radians(45))
    cylinder(M["stone"], 0.09, 0.62, (0.16, -0.14, 0.14), vertices=10)
    cone(M["roof"], 0.12, 0.18, (0.16, -0.14, 0.76), vertices=10)
    for (x, y, s) in [(-0.32, -0.22, 1.0), (0.30, 0.38, 0.85), (-0.28, 0.34, 0.8)]:
        box(M["wall"], (0.2 * s, 0.24 * s, 0.16 * s), (x, y, 0.14))
        cone(M["roof"], 0.17 * s, 0.14 * s, (x, y, 0.14 + 0.16 * s), vertices=4, rot_z=math.radians(45))


def fortress():
    # těžká šedá pevnost — brána skrz hradební prstenec
    hex_base(M["c_ash2"])
    # dvě mohutné nárožní věže a brána mezi nimi
    for side in (-1, 1):
        t = cylinder(M["stone"], 0.22, 0.75, (side * 0.42, 0.0, 0.14), vertices=10)
        cone(M["stone_dark"], 0.26, 0.12, (side * 0.42, 0.0, 0.89), vertices=10)
        for i in range(5):
            a = math.radians(i * 72)
            box(M["stone_dark"], (0.09, 0.07, 0.1),
                (side * 0.42 + math.cos(a) * 0.2, math.sin(a) * 0.2, 0.86), rot_z=a)
    # hradba s bránou
    box(M["stone"], (0.5, 0.26, 0.5), (0, 0, 0.14))
    box(M["stone_dark"], (0.2, 0.3, 0.3), (0, 0, 0.14))  # tmavý průjezd brány
    box(M["stone"], (0.56, 0.3, 0.1), (0, 0, 0.64))
    for mx in (-0.2, 0, 0.2):
        box(M["stone_dark"], (0.1, 0.1, 0.1), (mx, 0, 0.74))
    # zadní nižší dvůr
    box(M["stone_dark"], (0.34, 0.2, 0.24), (0, 0.45, 0.14))


def outpost():
    # dřevěná strážní věž s palisádou — hráčská stavba za kámen
    hex_base(M["a_grass"])
    for i in range(10):
        a = math.radians(i * 36 + 10)
        cylinder(M["wood_dark"], 0.035, 0.22, (math.cos(a) * 0.55, math.sin(a) * 0.55, 0.14), vertices=6)
    for (sx, sy) in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
        cylinder(M["wood"], 0.035, 0.5, (sx * 0.14, sy * 0.14, 0.14), vertices=6)
    box(M["wood"], (0.46, 0.46, 0.06), (0, 0, 0.64))
    box(M["wood_dark"], (0.34, 0.34, 0.18), (0, 0, 0.70))
    cone(M["stone_dark"], 0.3, 0.18, (0, 0, 0.88), vertices=4, rot_z=math.radians(45))
    cone(M["gold"], 0.02, 0.12, (0, 0, 1.05), vertices=5)


def grandfort():
    # velká pevnost: srdce vnějšího prstence — mohutná citadela (síla 500)
    hex_base(M["c_ash2"])
    box(M["stone_dark"], (1.64, 1.64, 0.16), (0, 0, 0.14))
    box(M["stone"], (1.16, 1.16, 0.34), (0, 0, 0.30))
    # cimbuří po obvodu horní terasy
    for i in range(4):
        a = math.radians(90 * i)
        for j in (-0.38, 0, 0.38):
            box(M["stone_dark"], (0.09, 0.14, 0.12),
                (math.cos(a) * 0.54 - math.sin(a) * j, math.sin(a) * 0.54 + math.cos(a) * j, 0.64),
                rot_z=a)
    # centrální donjon + čtyři nárožní věže
    cone(M["stone"], 0.3, 0.75, (0, 0, 0.64), vertices=8, r2=0.2)
    box(M["stone_dark"], (0.24, 0.24, 0.14), (0, 0, 1.39))
    cone(M["roof"], 0.2, 0.22, (0, 0, 1.53), vertices=8)
    for i in range(4):
        a = math.radians(45 + i * 90)
        x, y = math.cos(a) * 0.5, math.sin(a) * 0.5
        cylinder(M["stone"], 0.12, 0.7, (x, y, 0.3), vertices=8)
        cone(M["roof"], 0.15, 0.2, (x, y, 1.0), vertices=8)
    # zlatá špice na donjonu
    cone(M["gold"], 0.045, 0.14, (0, 0, 1.62), vertices=6)


def bastion():
    # bašta: rameno velké pevnosti — těžce opevněný val (síla 300)
    hex_base(M["c_ash2"])
    box(M["stone"], (1.5, 1.5, 0.4), (0, 0, 0.14))
    for i in range(4):
        a = math.radians(90 * i)
        for j in (-0.5, 0, 0.5):
            box(M["stone_dark"], (0.1, 0.15, 0.13),
                (math.cos(a) * 0.71 - math.sin(a) * j, math.sin(a) * 0.71 + math.cos(a) * j, 0.54),
                rot_z=a)
    cylinder(M["stone_dark"], 0.18, 0.4, (0.25, -0.2, 0.54), vertices=8)
    cone(M["stone"], 0.21, 0.1, (0.25, -0.2, 0.94), vertices=8)
    box(M["stone_dark"], (0.3, 0.2, 0.16), (-0.25, 0.25, 0.54))


def throne():
    # Trůnní město: temná citadela se zlatými akcenty
    hex_base(M["c_ash2"])
    # soustředné terasy (čtvercové — lícují s deskou pole)
    box(M["stone_dark"], (1.54, 1.54, 0.14), (0, 0, 0.14))
    box(M["stone"], (1.12, 1.12, 0.16), (0, 0, 0.28))
    # hlavní věž
    cone(M["stone_dark"], 0.3, 1.15, (0, 0, 0.44), vertices=8, r2=0.14)
    cone(M["gold"], 0.16, 0.3, (0, 0, 1.59), vertices=8)
    # čtyři boční věžky se zlatými hroty
    for i in range(4):
        a = math.radians(45 + i * 90)
        x, y = math.cos(a) * 0.52, math.sin(a) * 0.52
        cylinder(M["stone"], 0.09, 0.5, (x, y, 0.28), vertices=8)
        cone(M["gold"], 0.11, 0.18, (x, y, 0.78), vertices=8)
    # žhavý příkop kolem paty citadely
    for i in range(8):
        a = math.radians(i * 45 + 20)
        box(M["h_ember"], (0.22, 0.03, 0.015), (math.cos(a) * 0.9, math.sin(a) * 0.9, 0.135), rot_z=a + math.pi / 2)


def capital_aldar():
    # lidské hrazené město: kamenné hradby, věž, domky, modré praporce
    hex_base(M["a_grass"])
    ctvercove_hradby(M["wall"], 0.68, 1.3, tl=0.1, vyska=0.26, vez_r=0.08, vez_h=0.36)
    box(M["stone"], (0.36, 0.36, 0.44), (0, 0.02, 0.14))
    cone(M["roof"], 0.28, 0.24, (0, 0.02, 0.58), vertices=4, rot_z=math.radians(45))
    cylinder(M["stone"], 0.1, 0.78, (0.2, -0.18, 0.14), vertices=10)
    cone(M["f_aldar"], 0.13, 0.2, (0.2, -0.18, 0.92), vertices=10)
    banner(M["f_aldar"], M["wood_dark"], (-0.2, -0.3, 0.14), h=0.55)
    banner(M["f_aldar"], M["wood_dark"], (0.05, 0.42, 0.14), h=0.5)
    for (x, y, s) in [(-0.34, -0.1, 0.9), (0.3, 0.32, 0.8), (-0.25, 0.36, 0.85), (0.38, -0.35, 0.7)]:
        box(M["wall"], (0.18 * s, 0.22 * s, 0.15 * s), (x, y, 0.14))
        cone(M["roof"], 0.16 * s, 0.13 * s, (x, y, 0.14 + 0.15 * s), vertices=4, rot_z=math.radians(45))


def capital_yllien():
    # elfí město: štíhlé bílé věže mezi stromy, tyrkysové střechy
    hex_base(M["y_grass"])
    spires = [((0, 0.05), 0.14, 1.1), ((-0.35, -0.25), 0.1, 0.75), ((0.35, -0.2), 0.11, 0.85),
              ((0.1, 0.45), 0.09, 0.6), ((-0.4, 0.3), 0.08, 0.55)]
    white = mat("y_white", (0.85, 0.87, 0.82), rough=0.5)
    for (x, y), r, h in spires:
        cylinder(white, r, h, (x, y, 0.14), vertices=10)
        cone(M["f_yllien"], r * 1.5, h * 0.35, (x, y, 0.14 + h), vertices=10)
    for (x, y) in [(0.5, 0.2), (-0.15, -0.45), (0.4, -0.45), (-0.55, 0.0)]:
        s = random.uniform(0.8, 1.0)
        cylinder(M["trunk"], 0.035 * s, 0.25 * s, (x, y, 0.14), vertices=8)
        cone(M["y_leaf"], 0.15 * s, 0.42 * s, (x, y, 0.14 + 0.2 * s), vertices=9)
    cone(M["y_crystal"], 0.07, 0.3, (0.22, 0.22, 0.14), vertices=6)


def capital_durgar():
    # orčí železná tvrz: hranaté kovové bloky, komín výhně, oranžové praporce
    hex_base(M["d_dirt2"])
    box(M["d_rock"], (0.7, 0.6, 0.3), (0, 0.05, 0.14))
    box(M["d_iron"], (0.5, 0.42, 0.28), (0, 0.05, 0.44))
    box(M["d_rock"], (0.3, 0.26, 0.24), (0, 0.05, 0.72))
    # rohové železné hroty
    for (sx, sy) in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
        cone(M["d_iron"], 0.09, 0.35, (sx * 0.32, 0.05 + sy * 0.27, 0.58), vertices=6)
    # komín výhně se žhnutím
    cylinder(M["d_rock"], 0.09, 0.55, (0.42, -0.35, 0.14), vertices=8)
    cylinder(M["h_ember"], 0.055, 0.03, (0.42, -0.35, 0.69), vertices=8)
    banner(M["f_durgar"], M["wood_dark"], (-0.42, -0.35, 0.14), h=0.6)
    banner(M["f_durgar"], M["wood_dark"], (-0.15, 0.5, 0.14), h=0.5)
    for (x, y) in scatter(3, 0.6, 0.85):
        cone(M["d_rock"], 0.08, 0.12, (x, y, 0.14), vertices=5)


def capital_horda():
    # démoní citadela: ostré čedičové jehly kolem žhnoucího jícnu
    hex_base(M["h_basalt"])
    cone(M["h_rock"], 0.34, 1.05, (0, 0.05, 0.14), vertices=6, r2=0.05)
    for i in range(5):
        a = math.radians(20 + i * 72)
        x, y = math.cos(a) * 0.45, math.sin(a) * 0.45
        c = cone(M["h_rock"], 0.14, random.uniform(0.45, 0.7), (x, y, 0.14), vertices=5)
        c.rotation_euler[0] = random.uniform(-0.12, 0.12)
        c.rotation_euler[1] = random.uniform(-0.12, 0.12)
    # žhavý jícen a praskliny
    cylinder(M["h_lava"], 0.14, 0.02, (0, 0.05, 0.42), vertices=8)
    for i in range(4):
        a = math.radians(i * 90 + 30)
        box(M["h_ember"], (0.35, 0.035, 0.02), (math.cos(a) * 0.55, math.sin(a) * 0.55, 0.135),
            rot_z=a)
    banner(M["f_horda"], M["h_burnt"], (0.5, -0.4, 0.14), h=0.55)
    banner(M["f_horda"], M["h_burnt"], (-0.5, 0.35, 0.14), h=0.5)


# ---------- surovinové rekvizity ----------
# Průhledné overlay sprity kreslené přes terén: druh suroviny pole a jeho
# mohutnost (1 = úroveň 1–4, 2 = 5–8, 3 = 9–12). Bez hex podstavy; stíny
# chytá shadow catcher, takže rekvizity sedí na zemi existujících spritů.
# Kamera hledí z −Y: dolní část obrazu = −Y, tam je ⚔ jmenovka — rekvizity
# proto drží spíš horní polovinu (y >= -0.15).

def catcher():
    bpy.ops.mesh.primitive_plane_add(size=2.6, location=(0, 0, 0.141))
    ob = bpy.context.object
    ob.is_shadow_catcher = True
    # bílá plocha nesmí přisvětlovat rekvizity odrazem (vymývá barvy)
    ob.visible_diffuse = False
    ob.visible_glossy = False
    ob.visible_transmission = False


def log_piece(x, y, rot=0.0, s=1.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.055 * s, depth=0.46 * s,
                                        location=(x, y, 0.14 + 0.055 * s))
    ob = bpy.context.object
    ob.rotation_euler = (math.pi / 2, 0, rot)
    ob.data.materials.append(M["trunk"])
    return ob


def stump(x, y, s=1.0):
    cylinder(M["trunk"], 0.07 * s, 0.09 * s, (x, y, 0.14), vertices=9)
    cylinder(M["wood"], 0.055 * s, 0.012, (x, y, 0.14 + 0.09 * s), vertices=9)


def sheaf(x, y, s=1.0):
    cone(M["wheat"], 0.065 * s, 0.17 * s, (x, y, 0.14), vertices=8, r2=0.018)


def wheat_field(x, y, w, d, rot=0.25):
    box(M["wheat2"], (w, d, 0.028), (x, y, 0.14), rot_z=rot)
    n = max(2, int(d / 0.12))
    for i in range(n):
        off = (i - (n - 1) / 2) * (d / n)
        box(M["wheat"], (w * 0.94, 0.04, 0.05),
            (x - off * math.sin(rot), y + off * math.cos(rot), 0.152), rot_z=rot)


def ore_rock(x, y, s=1.0, rz=0.0):
    cone(M["d_rock"], 0.14 * s, 0.2 * s, (x, y, 0.14), vertices=5, rot_z=rz)
    blob(M["d_ore"], 0.045 * s, (x + 0.05 * s, y - 0.07 * s, 0.2 + 0.04 * s), squash=0.8)
    blob(M["d_ore"], 0.03 * s, (x - 0.06 * s, y - 0.03 * s, 0.17 + 0.03 * s), squash=0.8)


def wheel(x, y, z, s=1.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.06 * s, depth=0.03,
                                        location=(x, y, z))
    ob = bpy.context.object
    ob.rotation_euler = (math.pi / 2, 0, 0)
    ob.data.materials.append(M["wood_dark"])


def menhir(x, y, s=1.0, rz=0.2):
    box(M["stone_dark"], (0.1 * s, 0.08 * s, 0.36 * s), (x, y, 0.14), rot_z=rz)
    blob(M["arcane"], 0.028 * s, (x, y - 0.05 * s, 0.14 + 0.24 * s), squash=1.0)


def crystal(x, y, s=1.0):
    cone(M["arcane"], 0.07 * s, 0.16 * s, (x, y, 0.2 + 0.06 * s), vertices=6, r2=0.005)
    c = cone(M["arcane"], 0.07 * s, 0.1 * s, (x, y, 0.2 + 0.06 * s), vertices=6, r2=0.005)
    c.rotation_euler[0] = math.pi
    c.location.z = 0.2 + 0.06 * s - 0.05 * s


# --- jídlo: obilné pole → statek s větrným mlýnem ---

def res_food_1():
    catcher()
    wheat_field(-0.2, 0.28, 0.4, 0.3)
    sheaf(0.3, 0.05); sheaf(0.42, 0.22, 0.85)


def res_food_2():
    catcher()
    wheat_field(-0.22, 0.3, 0.62, 0.44)
    wheat_field(0.38, -0.05, 0.34, 0.26, rot=-0.15)
    sheaf(0.15, 0.5); sheaf(0.3, 0.38, 0.9); sheaf(-0.62, 0.0, 0.9)
    for i in range(3):
        cylinder(M["wood_dark"], 0.016, 0.1, (-0.5 + i * 0.13, -0.18, 0.14), vertices=6)
    box(M["wood"], (0.4, 0.016, 0.04), (-0.37, -0.18, 0.19))


def res_food_3():
    catcher()
    wheat_field(-0.3, 0.32, 0.62, 0.46)
    wheat_field(0.42, 0.28, 0.36, 0.3, rot=-0.2)
    sheaf(0.05, 0.05); sheaf(0.2, 0.14, 0.9)
    # větrný mlýn — lopatky široké v X, ať jsou vidět z kamery
    box(M["wall"], (0.2, 0.2, 0.3), (-0.42, -0.2, 0.14))
    cone(M["roof"], 0.15, 0.12, (-0.42, -0.2, 0.44), vertices=6)
    for k in range(4):
        b = box(M["wood"], (0.34, 0.014, 0.035), (-0.42, -0.32, 0.0))
        b.location.z = 0.46
        b.rotation_euler[1] = math.radians(45 + k * 90)
    blob(M["wood_dark"], 0.03, (-0.42, -0.33, 0.46), squash=1.0)


# --- dřevo: pár klád → dřevorubecký tábor ---

def res_wood_1():
    catcher()
    log_piece(0.05, 0.3, rot=0.4)
    log_piece(0.2, 0.14, rot=0.5)
    stump(-0.35, 0.1)


def res_wood_2():
    catcher()
    log_piece(-0.1, 0.32, rot=0.2); log_piece(-0.05, 0.18, rot=0.25)
    log_piece(-0.08, 0.25, rot=0.22, s=0.95)
    stump(0.42, 0.05); stump(0.3, 0.35, 0.85)
    box(M["wood"], (0.3, 0.2, 0.05), (-0.45, -0.12, 0.14))  # hranice prken


def res_wood_3():
    catcher()
    # velká hranice klád ve dvou patrech + koza na řezání
    for i, (x, y) in enumerate([(-0.15, 0.34), (-0.1, 0.2), (-0.2, 0.27)]):
        log_piece(x, y, rot=0.18 + i * 0.03, s=1.1)
    log_piece(-0.13, 0.27, rot=0.2, s=1.0).location.z = 0.14 + 0.16
    stump(0.35, 0.45, 0.9); stump(0.5, 0.12); stump(0.18, 0.02, 0.8)
    box(M["wood"], (0.34, 0.24, 0.07), (-0.5, -0.14, 0.14))
    box(M["wood_dark"], (0.05, 0.2, 0.16), (0.42, -0.3, 0.14), rot_z=0.3)
    box(M["wood_dark"], (0.2, 0.05, 0.16), (0.42, -0.3, 0.14), rot_z=0.3)


# --- kámen: balvany → lom s otesanými kvádry ---

def res_stone_1():
    catcher()
    cone(M["stone"], 0.16, 0.2, (0.05, 0.3, 0.14), vertices=5, rot_z=0.3)
    cone(M["stone_dark"], 0.1, 0.13, (0.3, 0.12, 0.14), vertices=5, rot_z=1.1)


def res_stone_2():
    catcher()
    cone(M["stone"], 0.2, 0.26, (-0.2, 0.32, 0.14), vertices=5, rot_z=0.4)
    box(M["stone"], (0.16, 0.16, 0.14), (0.28, 0.18, 0.14), rot_z=0.2)
    box(M["stone_dark"], (0.14, 0.14, 0.12), (0.42, -0.05, 0.14), rot_z=0.5)
    box(M["stone"], (0.12, 0.12, 0.1), (0.3, 0.18, 0.28), rot_z=0.4)


def res_stone_3():
    catcher()
    # terasovitý lom + jeřábová kladka
    for i in range(3):
        box(M["stone_dark" if i % 2 else "stone"],
            (0.62 - i * 0.16, 0.4 - i * 0.1, 0.1), (-0.2, 0.3, 0.14 + i * 0.1), rot_z=0.15)
    box(M["stone"], (0.15, 0.15, 0.13), (0.35, -0.08, 0.14), rot_z=0.3)
    box(M["stone_dark"], (0.13, 0.13, 0.11), (0.52, 0.12, 0.14), rot_z=0.7)
    cylinder(M["wood_dark"], 0.022, 0.5, (0.28, -0.32, 0.14), vertices=7)
    b = box(M["wood_dark"], (0.4, 0.022, 0.04), (0.38, -0.32, 0.0))
    b.location.z = 0.62
    b.rotation_euler[1] = math.radians(-18)


# --- železo: rudné balvany → důl s vozíkem ---

def res_iron_1():
    catcher()
    ore_rock(0.05, 0.3, 1.0, 0.4)
    ore_rock(0.32, 0.08, 0.75, 1.2)


def res_iron_2():
    catcher()
    cone(M["d_rock"], 0.3, 0.4, (-0.2, 0.35, 0.14), vertices=6, rot_z=0.3)
    # vstup do štoly s výdřevou (čelem ke kameře)
    box(M["wood_dark"], (0.05, 0.05, 0.2), (-0.34, 0.14, 0.14))
    box(M["wood_dark"], (0.05, 0.05, 0.2), (-0.06, 0.14, 0.14))
    box(M["wood_dark"], (0.36, 0.06, 0.06), (-0.2, 0.14, 0.32))
    ore_rock(0.3, 0.1, 0.85, 0.9)
    blob(M["d_ore"], 0.09, (0.42, -0.12, 0.16), squash=0.5)


def res_iron_3():
    catcher()
    cone(M["d_rock"], 0.38, 0.55, (-0.25, 0.38, 0.14), vertices=6, rot_z=0.2)
    box(M["wood_dark"], (0.06, 0.06, 0.24), (-0.42, 0.12, 0.14))
    box(M["wood_dark"], (0.06, 0.06, 0.24), (-0.08, 0.12, 0.14))
    box(M["wood_dark"], (0.44, 0.07, 0.07), (-0.25, 0.12, 0.36))
    # důlní vozík plný rudy
    box(M["d_iron"], (0.2, 0.13, 0.1), (0.3, -0.05, 0.2))
    blob(M["d_ore"], 0.07, (0.3, -0.05, 0.3), squash=0.6)
    wheel(0.22, -0.13, 0.17); wheel(0.38, -0.13, 0.17)
    blob(M["d_ore"], 0.11, (0.52, 0.18, 0.17), squash=0.55)
    ore_rock(0.05, 0.02, 0.7, 0.8)


# --- ✦ všechny suroviny: menhir → prastarý kruh s krystalem ---

def res_all_1():
    catcher()
    menhir(0.05, 0.25, 0.9)
    cone(M["stone_dark"], 0.07, 0.06, (0.3, 0.05, 0.14), vertices=5)


def res_all_2():
    catcher()
    menhir(-0.2, 0.3, 1.0, 0.3)
    menhir(0.28, 0.15, 0.85, -0.4)
    crystal(0.03, -0.05, 0.8)


def res_all_3():
    catcher()
    for i, a in enumerate([90, 210, 330]):
        x, y = math.cos(math.radians(a)) * 0.4, math.sin(math.radians(a)) * 0.4 + 0.1
        menhir(x, y, 1.15, 0.2 + i * 0.5)
    crystal(0, 0.1, 1.4)
    cylinder(M["stone_dark"], 0.2, 0.03, (0, 0.1, 0.14), vertices=12)


# ---------- render ----------

def render_tile(name, builder, seed):
    random.seed(seed)  # deterministické, ale každý sprite jiný
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
    jobs = [
        ("aldar_plains", a_plains), ("aldar_forest", a_forest), ("aldar_hills", a_hills),
        ("yllien_plains", y_plains), ("yllien_forest", y_forest), ("yllien_hills", y_hills),
        ("durgar_plains", d_plains), ("durgar_forest", d_forest), ("durgar_hills", d_hills),
        ("horda_plains", h_plains), ("horda_forest", h_forest), ("horda_hills", h_hills),
        ("center_plains", c_plains), ("center_forest", c_forest), ("center_hills", c_hills),
        ("brakkar_plains", bk_plains), ("brakkar_forest", bk_forest), ("brakkar_hills", bk_hills),
        ("sarn_plains", sr_plains), ("sarn_forest", sr_forest), ("sarn_hills", sr_hills),
        ("vhorren_plains", vh_plains), ("vhorren_forest", vh_forest), ("vhorren_hills", vh_hills),
        ("gryk_plains", gr_plains), ("gryk_forest", gr_forest), ("gryk_hills", gr_hills),
        ("water", water),
        # v0.41: voda je jedna hladina + břehy zvlášť, most je nástavba na břehu
        # (úhlopříčné řeky mají břehy 4·DIAG od sebe, osové 4·STRANA)
        ("river_flat", river_flat),
        ("river_bank", river_bank), ("river_bank_b", lambda: river_bank(77)),
        ("river_bank_c", lambda: river_bank(113)),
        ("bridge_short", lambda: bridge_head(2 * DIAG)),
        ("bridge_long", lambda: bridge_head(2 * STRANA)),
        # −45° ve stavitelských souřadnicích = po exportní otočce světová osa X,
        # +45° = osa Z; _a = val podél X, _b podél Z
        ("wall_a", lambda: wall_tile(-45)), ("wall_b", lambda: wall_tile(45)),
        ("wall_c", wall_rohova),
        ("ruins", ruins),
        ("city", city), ("fortress", fortress), ("throne", throne),
        ("capital_aldar", capital_aldar), ("capital_yllien", capital_yllien),
        ("capital_durgar", capital_durgar), ("capital_horda", capital_horda),
        ("capital_brakkar", capital_brakkar), ("capital_sarn", capital_sarn),
        ("capital_vhorren", capital_vhorren), ("capital_gryk", capital_gryk),
        ("outpost", outpost), ("grandfort", grandfort), ("bastion", bastion),
        # surovinové overlaye: druh × mohutnost (1–3)
        ("res_food_1", res_food_1), ("res_food_2", res_food_2), ("res_food_3", res_food_3),
        ("res_wood_1", res_wood_1), ("res_wood_2", res_wood_2), ("res_wood_3", res_wood_3),
        ("res_stone_1", res_stone_1), ("res_stone_2", res_stone_2), ("res_stone_3", res_stone_3),
        ("res_iron_1", res_iron_1), ("res_iron_2", res_iron_2), ("res_iron_3", res_iron_3),
        ("res_all_1", res_all_1), ("res_all_2", res_all_2), ("res_all_3", res_all_3),
    ]
    only = os.environ.get("ONLY")  # ONLY=prefix — přerenderuje odpovídající sprity
    for i, (name, fn) in enumerate(jobs):
        if only and not name.startswith(only):
            continue
        render_tile(name, fn, seed=100 + i)
    print("HOTOVO ->", OUT_DIR)


main()
