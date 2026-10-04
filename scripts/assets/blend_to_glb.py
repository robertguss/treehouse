# Blender script: converts every .blend/.fbx/.gltf passed after "--" into a .glb.
#   blender -b --factory-startup --python blend_to_glb.py -- <out_dir> <file>...
# Keeps animations, applies modifiers, and prints a one-line summary per file.
import os
import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1 :]
out_dir, sources = args[0], args[1:]
os.makedirs(out_dir, exist_ok=True)

for source in sources:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext = os.path.splitext(source)[1].lower()
    if ext == ".blend":
        bpy.ops.wm.open_mainfile(filepath=source)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=source)
    elif ext in (".gltf", ".glb"):
        bpy.ops.import_scene.gltf(filepath=source)
    else:
        print(f"SKIP {source}")
        continue

    # Drop cameras and lights that come with the source scene.
    for obj in list(bpy.data.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)

    name = os.path.splitext(os.path.basename(source))[0]
    target = os.path.join(out_dir, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=target,
        export_format="GLB",
        export_apply=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    actions = sorted(a.name for a in bpy.data.actions)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    verts = sum(len(o.data.vertices) for o in meshes)
    print(f"OK {name} meshes={len(meshes)} verts={verts} actions={actions} size={os.path.getsize(target)}")
