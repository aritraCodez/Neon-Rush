import bpy
from mathutils import Vector

path = r"d:\my project\neon-rush\Neon-Rush\neon-rush\public\models\neon-runner.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
deps = bpy.context.evaluated_depsgraph_get()
print("OBJECTS")
for obj in sorted(bpy.data.objects, key=lambda o: o.name):
    if obj.type != "MESH":
        continue
    eval_obj = obj.evaluated_get(deps)
    corners = [eval_obj.matrix_world @ Vector(c) for c in eval_obj.bound_box]
    xs, ys, zs = zip(*[(c.x, c.y, c.z) for c in corners])
    print(f"{obj.name:16} hide={obj.hide_viewport} verts={len(obj.data.vertices):4} "
          f"x={min(xs):7.3f}:{max(xs):7.3f} y={min(ys):7.3f}:{max(ys):7.3f} z={min(zs):7.3f}:{max(zs):7.3f} "
          f"parent={obj.parent.name if obj.parent else '-'} bone={obj.parent_bone!r}")
