# Válka popela — ZKOUŠKA POVRCHŮ (není součást pipeline, nic nepřepisuje).
#
#   blender -b -P zkouska_textur.py     → ../render/zkouska/*.png
#
# K čemu to je: ukazuje, o kolik se dílek přiblíží realistické předloze, když
# se k němu přidá procedurální variace barvy, mikroreliéf (bump), nerovnoměrná
# drsnost a tříbodové světlo — bez jediného staženého souboru, všechno se
# počítá v Blenderu. Naměřeno: 6–8 s na dílek při 1024 px / 256 vzorcích
# (proti 3,9 s u ostrých spritů), celá sada by tedy trvala ~11 minut.
#
# POZOR — tohle SE NEPŘENESE DO 3D HRY. glTF umí jen hodnoty materiálu a
# obrázkové textury, procedurální šum ne. Až dojde na povrchy ve 3D, musí se
# tenhle recept buď ZAPÉCT do obrázků (samostatný krok), nebo přepsat jako
# shader v enginu. Skript je tu jako podklad a důkaz, že to za to stojí.
#
# Nesahá na make_tiles.py — jen si ho načte a přepíše mu dvě funkce.
import bpy, math, os, sys, time

ZDROJ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "make_tiles.py")
VEN = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    "..", "render", "zkouska"))
os.makedirs(VEN, exist_ok=True)

# načíst make_tiles.py bez jeho main() na konci
src = open(ZDROJ, encoding="utf-8").read()
src = src.rsplit("main()", 1)[0]
mt = {"__file__": ZDROJ, "__name__": "make_tiles"}
exec(compile(src, ZDROJ, "exec"), mt)

RES = 1024
SAMPLES = 256


# Materiál sám bydlí v make_tiles.py jako mat_hq — ať pokus a exportér
# (make_models.py) kreslí z jednoho zdroje a nerozejdou se.



def setup_scene_hq():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.device = "CPU"
    scene.render.film_transparent = True
    scene.render.resolution_x = RES
    scene.render.resolution_y = RES
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    # klíčové slunce — teplé, ostřejší stín
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), 0, math.radians(-40)))
    sun = bpy.context.object
    sun.data.energy = 4.2
    sun.data.angle = math.radians(7)
    sun.data.color = (1.0, 0.94, 0.82)
    sun.name = "RIG_sun"

    # studené doplňkové světlo z protilehlé strany — vyplní stíny
    bpy.ops.object.light_add(type="AREA", location=(-3.0, 2.4, 3.0))
    fill = bpy.context.object
    fill.data.energy = 55
    fill.data.size = 6.0
    fill.data.color = (0.72, 0.82, 1.0)
    fill.rotation_euler = (math.radians(52), 0, math.radians(140))
    fill.name = "RIG_fill"

    # obrysové světlo zezadu — odděluje sprite od pozadí
    bpy.ops.object.light_add(type="AREA", location=(1.6, 3.4, 2.6))
    rim = bpy.context.object
    rim.data.energy = 40
    rim.data.size = 3.0
    rim.data.color = (1.0, 0.88, 0.72)
    rim.rotation_euler = (math.radians(115), 0, math.radians(20))
    rim.name = "RIG_rim"

    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.68, 0.95, 1.0)
    bg.inputs[1].default_value = 0.45

    d = 10.0
    bpy.ops.object.camera_add(
        location=(0, -d * math.sin(mt["CAM_TILT"]), d * math.cos(mt["CAM_TILT"])),
        rotation=(mt["CAM_TILT"], 0, 0))
    cam = bpy.context.object
    cam.name = "RIG_cam"
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = mt["ORTHO_SCALE"]
    scene.camera = cam


mt["mat"] = mt["mat_hq"]
mt["OUT_DIR"] = VEN
setup_scene_hq()
mt["make_materials"]()

ukoly = [("hq_aldar_plains", mt["a_plains"], 100), ("hq_durgar_hills", mt["d_hills"], 108),
         ("hq_city", mt["city"], 120)]
for jmeno, fn, seed in ukoly:
    t0 = time.time()
    mt["render_tile"](jmeno, fn, seed=seed)
    print("CAS %s = %.1f s" % (jmeno, time.time() - t0))
print("HOTOVO ->", VEN)
