import bpy
import json

path = r"d:\my project\neon-rush\Neon-Rush\neon-rush\assets\reference\RobotExpressive.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
bones = []
for bone in arm.data.bones:
    head = [round(v, 4) for v in (arm.matrix_world @ bone.head_local)]
    tail = [round(v, 4) for v in (arm.matrix_world @ bone.tail_local)]
    bones.append({"name": bone.name, "parent": bone.parent.name if bone.parent else None, "head": head, "tail": tail})

mats = []
for mat in bpy.data.materials:
    node = mat.node_tree.nodes.get("Principled BSDF") if mat.node_tree else None
    info = {"name": mat.name, "use_nodes": mat.use_nodes}
    if node:
        base = node.inputs["Base Color"]
        info["base"] = list(base.default_value)
        info["base_linked"] = bool(base.links)
        info["metallic"] = node.inputs["Metallic"].default_value
        info["roughness"] = node.inputs["Roughness"].default_value
        emit = node.inputs.get("Emission Color") or node.inputs.get("Emission")
        if emit:
            info["emission"] = list(emit.default_value) if hasattr(emit.default_value, "__iter__") else emit.default_value
    mats.append(info)

print("BONES_JSON_START")
print(json.dumps({"armature": arm.name, "bones": bones, "materials": mats, "images": [i.name for i in bpy.data.images]}, indent=2))
print("BONES_JSON_END")
