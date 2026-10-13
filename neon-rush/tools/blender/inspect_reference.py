import bpy
import json
from mathutils import Vector

path = r"d:\my project\neon-rush\Neon-Rush\neon-rush\assets\reference\RobotExpressive.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

objects = []
for obj in bpy.data.objects:
    dims = [round(v, 4) for v in obj.dimensions]
    loc = [round(v, 4) for v in obj.location]
    info = {
        "name": obj.name,
        "type": obj.type,
        "loc": loc,
        "dims": dims,
        "parent": obj.parent.name if obj.parent else None,
        "verts": len(obj.data.vertices) if obj.type == "MESH" else 0,
    }
    objects.append(info)

anims = [a.name for a in bpy.data.actions]
mats = [m.name for m in bpy.data.materials]

min_c = Vector((1e9, 1e9, 1e9))
max_c = Vector((-1e9, -1e9, -1e9))
for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    for corner in obj.bound_box:
        world = obj.matrix_world @ Vector(corner)
        min_c.x, min_c.y, min_c.z = min(min_c.x, world.x), min(min_c.y, world.y), min(min_c.z, world.z)
        max_c.x, max_c.y, max_c.z = max(max_c.x, world.x), max(max_c.y, world.y), max(max_c.z, world.z)

report = {
    "objects": objects,
    "actions": anims,
    "materials": mats,
    "bounds_min": [round(min_c.x, 4), round(min_c.y, 4), round(min_c.z, 4)],
    "bounds_max": [round(max_c.x, 4), round(max_c.y, 4), round(max_c.z, 4)],
    "height": round(max_c.z - min_c.z, 4) if max_c.z > min_c.z else round(max_c.y - min_c.y, 4),
}
print("REPORT_JSON_START")
print(json.dumps(report, indent=2))
print("REPORT_JSON_END")
