# Runner Lab: Blender and Unreal workflow

Open **Enter Runner Lab** below the game. Drag the model to orbit; scroll or pinch to zoom. The viewer also supports arrow keys, +/−, Home, and labeled camera buttons. Armor finishes apply immediately to the playable character and persist on this browser. Weapon selection here previews models; campaign unlocks and Q weapon switching remain part of gameplay.

**Export 3D Model** downloads a self-contained GLB with the selected finish and weapon. It contains metallic/roughness materials, emissive details, named articulated parts, and four animation clips: `idle`, `run`, `jump`, and `aim`. The model uses rigid object animation, not a skinned humanoid skeleton. Clips animate in place. The game supplies forward movement and jump physics separately.

A verified [Nova runner with the charged laser](../artifacts/neon-runner-nova-laser.glb) is included as a sample export (approximately 196 KiB).

## Blender

1. Export the model from Runner Lab.
2. In Blender, choose **File → Import → glTF 2.0 (.glb, .gltf)** and select the downloaded file.
3. Inspect the named `NR_*` parts in the Outliner. Edit the armor geometry and materials. The imported object animation clips can be inspected in Blender's animation editors.
4. Save a `.blend` working copy. Export GLB when preparing a web asset; keep the named joint hierarchy if retaining these rigid animations.

The playable character is the public RobotExpressive GLB at `public/models/neon-runner.glb` (reference copy in `assets/reference/`). `src/components/RunnerModel.tsx` loads it, plays `Idle` / `Running` / `Jump` / `Punch`, and recolors the `Main` / `Grey` / `Black` materials to the selected armor finish.

Optional Blender restyle (materials and empties) lives in `tools/blender/build_neon_runner.py`. Re-exporting this armature from Blender 5.2 can bake bad bone scale tracks, so the game ships the original clip set. A procedural capsule rig remains as a fallback if the GLB cannot load.

Reference: [Blender glTF import/export manual](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html).

## Unreal Engine

Use Unreal's **File → Import Into Level** with the exported GLB to inspect its scene hierarchy and materials through Interchange. Inspect the import preview before committing asset settings. Check dimensions, orientation, and emissive intensity in your own project.

This repository remains a browser game. A playable Unreal character needs an Unreal project, input/collision logic, and an appropriate animation setup. For a skeletal Animation Blueprint workflow, rig the model in Blender and create/export skeletal animations; the GLB's rigid part animations are not a drop-in Unreal humanoid animation rig. Native editor imports were not run in this workspace.

Reference: [Epic's Interchange import documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/importing-assets-using-interchange-in-unreal-engine).

## Verification

Run `npm test` and `npm run build` from `neon-rush/`. With Vite running at port 5187, run `node scripts/workshop-browser-check.mjs`. Set `NEON_BROWSER` to a Chromium executable if Playwright's browser is unavailable. The smoke check verifies camera interaction, armor persistence, weapon previews, mobile layout, pause/resume, reduced motion, and a downloaded GLB loaded back into Three.js with a functioning animation.
