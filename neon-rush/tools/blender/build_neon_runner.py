"""Restyle RobotExpressive for Neon Rush and export a game-ready GLB.

Scale and grounding are applied in the game so bone-parented meshes stay intact.
"""
from __future__ import annotations

import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REFERENCE = os.path.join(ROOT, "assets", "reference", "RobotExpressive.glb")
BLEND_OUT = os.path.join(ROOT, "assets", "neon-runner.blend")
GLB_OUT = os.path.join(ROOT, "public", "models", "neon-runner.glb")

ION_ARMOR = (0.086, 0.132, 0.184)
ION_TRIM = (0.82, 0.89, 0.95)
ION_DARK = (0.035, 0.055, 0.075)
ION_GLOW = (0.12, 0.85, 0.97)


def principled(mat):
    return mat.node_tree.nodes.get("Principled BSDF") if mat.node_tree else None


def set_pbr(mat, color, metallic=0.78, roughness=0.28, emission=None, emit=0.0, coat=0.25):
    node = principled(mat)
    if not node:
        return
    node.inputs["Base Color"].default_value = (*color, 1.0)
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in node.inputs:
        node.inputs["Coat Weight"].default_value = coat
        if "Coat Roughness" in node.inputs:
            node.inputs["Coat Roughness"].default_value = 0.12
    if emission is not None:
        if "Emission Color" in node.inputs:
            node.inputs["Emission Color"].default_value = (*emission, 1.0)
        elif "Emission" in node.inputs:
            node.inputs["Emission"].default_value = (*emission, 1.0)
        if "Emission Strength" in node.inputs:
            node.inputs["Emission Strength"].default_value = emit


def attach_like(obj, template):
    obj.parent = template.parent
    obj.parent_type = template.parent_type
    obj.parent_bone = template.parent_bone
    obj.matrix_parent_inverse = template.matrix_parent_inverse.copy()
    obj.matrix_world = template.matrix_world.copy()


def empty_like(name, template):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.12
    bpy.context.collection.objects.link(obj)
    attach_like(obj, template)
    return obj


def main():
    if not os.path.exists(REFERENCE):
        raise SystemExit(f"Missing reference model: {REFERENCE}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=REFERENCE)

    icosphere = bpy.data.objects.get("Icosphere")
    if icosphere:
        bpy.data.objects.remove(icosphere, do_unlink=True)

    armor = bpy.data.materials.get("Main")
    trim = bpy.data.materials.get("Grey")
    dark = bpy.data.materials.get("Black")
    armor.name = "NR_ARMOR"
    trim.name = "NR_TRIM"
    dark.name = "NR_DARK"
    set_pbr(armor, ION_ARMOR, metallic=0.86, roughness=0.22, coat=0.5)
    set_pbr(trim, ION_TRIM, metallic=0.6, roughness=0.18, coat=0.25)
    set_pbr(dark, ION_DARK, metallic=0.72, roughness=0.34, coat=0.12)
    glow = bpy.data.materials.new("NR_GLOW")
    glow.use_nodes = True
    set_pbr(glow, ION_GLOW, metallic=0.2, roughness=0.16, emission=ION_GLOW, emit=7.5, coat=0.0)

    # Give the visor/eye plates the glow finish by swapping dark materials on the head.
    head = bpy.data.objects["Head"]
    for slot in head.material_slots:
        if slot.material and slot.material.name == "NR_DARK":
            slot.material = glow

    empty_like("NR_body", bpy.data.objects["Torso"])
    empty_like("NR_head", head)
    empty_like("NR_arm_L", bpy.data.objects["Arm.L"])
    empty_like("NR_arm_R", bpy.data.objects["Arm.R"])
    empty_like("NR_leg_L", bpy.data.objects["Leg.L"])
    empty_like("NR_leg_R", bpy.data.objects["Leg.R"])
    empty_like("NR_knee_L", bpy.data.objects["LowerLeg.L"])
    empty_like("NR_knee_R", bpy.data.objects["LowerLeg.R"])
    empty_like("NR_weapon", bpy.data.objects["Hand.R"])

    root = bpy.data.objects.get("RootNode")
    if root:
        root.name = "NEON_RUSH_RUNNER"

    keep = {"Idle": "idle", "Running": "run", "Jump": "jump", "Punch": "aim"}
    for action in list(bpy.data.actions):
        if action.name in keep:
            action.name = keep[action.name]
        else:
            bpy.data.actions.remove(action)

    os.makedirs(os.path.dirname(BLEND_OUT), exist_ok=True)
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_yup=True,
    )
    print(f"Exported {GLB_OUT}")
    print("Actions", [a.name for a in bpy.data.actions])
    print("Materials", [m.name for m in bpy.data.materials])


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("BUILD_FAILED", error, file=sys.stderr)
        raise
