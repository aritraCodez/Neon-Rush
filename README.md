# Neon Rush 
 
A 3D action game built with React 19, TypeScript, Vite, React Three Fiber, and Three.js. Solo gameplay and Runner Lab render procedural models locally without external game assets or a backend. Online PvP uses the included Node WebSocket server.

## Run locally

Use Node.js 22.15 or newer.

```sh
cd neon-rush
npm install
npm run dev
```

Open the local URL Vite prints. To create and serve the production build:

```sh
npm run build
npm run preview
```

## Multiplayer arena

Choose **Multiplayer Arena**, enter a name, and create or join a room. Up to six friends can fight in the same 3D arena with live nameplates, health, radar, scores, respawns, and rematches. Keyboard/mouse and touch controls are supported. The server calculates movement, damage, and results.

The production frontend can remain on Render Static Sites. Deploy the new WebSocket backend and set the frontend's `VITE_MULTIPLAYER_URL` before rebuilding. Follow the [Render multiplayer deployment guide](neon-rush/docs/MULTIPLAYER-RENDER.md); the root `render.yaml` adds only the backend service.

## Interactive 3D Runner Lab

Use **Enter Runner Lab** below the game to rotate and zoom the articulated character, choose one of four armor finishes, preview every weapon, inspect its wireframe, and play Idle, Run, Jump, or Aim animations. Armor changes carry into gameplay and are saved locally. Opening the lab pauses an active run.

**Export 3D Model** downloads the selected character and four animations as a GLB. See the [Blender and Unreal workflow](neon-rush/docs/3D-WORKFLOW.md) for editing and import guidance. No native editor installation is needed to play or use the lab.

## Gameplay controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Change lane | Left / Right or A / D | Swipe left / right, or buttons |
| Jump | Up, W, Space | Swipe up, tap track, or Jump button |
| Slide / drop from jump | Down or S | Swipe down or Slide button |
| Pause / resume | Escape or P | Pause / Resume button |
| Start / retry | Enter | Start Run / Run It Back button |

Avoid tall pink blocks, jump orange barriers, and slide under raised pink beams. Each generated row leaves at least one lane clear. Speed gradually increases from 17 to 36 world units per second. Coins award 25 points and distance awards 2 points per meter.

- **Shield (cyan):** absorbs one collision; expires after 10 seconds.
- **Magnet (violet):** collects nearby coins across lanes for 12 seconds.
- **Double score (lime):** doubles distance and coin points for 10 seconds.

The game pauses on tab changes and lost window focus. Pausing freezes physics and power-up timers. Restart resets the run. Best score, sound, bloom, and reduced-motion preferences are stored locally, with graceful fallback if browser storage is unavailable. Reduced motion quiets ambient/menu animations; gameplay still moves. Sound is synthesized with Web Audio after user interaction. Mobile devices can disable bloom in Settings for better performance. WebGL / hardware acceleration is required; a fallback message appears if rendering fails.

## Code map

- `src/game/engine.ts` — rendering-independent simulation, obstacle generation, physics, collisions, score, and state snapshots.
- `src/game/audio.ts` — small Web Audio synthesizer.
- `src/game/useControls.ts` — keyboard input and automatic pause.
- `src/components/Scene.tsx` — city, track, animated runner, instanced obstacles and collectibles, camera, bloom.
- `src/components/Hud.tsx` — score, speed, power-up timers, and mobile controls.
- `src/components/GameOverlay.tsx` — start, countdown, pause, and game-over states.
- `src/components/Modal.tsx` — accessible native settings and instructions dialog.
- `src/App.tsx` — application layout, swipes, preferences, fullscreen, optional WebMCP read/pause integration.
- `src/styles.css` — responsive interface, reduced-motion styles, and transitions.

The simulation runs in bounded 1/120-second substeps to prevent collision tunneling. Mutable positions are updated directly by the render loop; UI snapshots publish at a lower rate. Instanced collectible and hazard meshes keep draw calls bounded. Simulation tests use a deterministic random source.

## Verification

```sh
npm test
npm run build
```

`tests/engine.test.ts` checks state transitions, lane bounds, jumping/sliding, collisions, all power-ups, delayed frames, safe procedural rows, and difficulty. `scripts/browser-check.mjs` provides a Playwright browser smoke check when a Chromium executable is available; set `NEON_BROWSER` if it is not installed in Playwright's default location, then run it with the Vite server running.

The optional WebMCP integration is feature-detected and does nothing in ordinary browsers. A supported WebMCP host was unavailable during validation; standard browser gameplay was tested with Chromium.

## Deployment

Upload `neon-rush/dist/` to a static host after building. The root `render.yaml` configures a separate Render multiplayer backend; see the [multiplayer deployment guide](neon-rush/docs/MULTIPLAYER-RENDER.md) to connect it to the existing Static Site. Fonts are optionally fetched from Google Fonts with local system fallbacks; gameplay does not depend on that request. No external game assets are loaded.
