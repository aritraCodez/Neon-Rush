import bpy

path = r"d:\my project\neon-rush\Neon-Rush\neon-rush\assets\reference\RobotExpressive.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    print(f"{obj.name:16} parent_type={obj.parent_type:10} parent_bone={obj.parent_bone!r:16} mods={[m.type for m in obj.modifiers]} groups={[g.name for g in obj.vertex_groups][:8]}")
