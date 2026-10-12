# Neon Rush

A complete 3D endless runner built with React 19, TypeScript, Vite, React Three Fiber, and Three.js. Everything in the circuit is rendered in real time; no models, textures, audio files, API keys, or backend are required.

## Run locally

Use Node.js 22.15 or newer.

```sh
npm install
npm run dev
```

Open the local URL Vite prints. To create and serve the production build:

```sh
npm run build
npm run preview
```

## Controls

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

Upload `dist/` to a static host after building. The project includes a Sites hosting manifest. Fonts are optionally fetched from Google Fonts with local system fallbacks; gameplay does not depend on that request. No external game assets are loaded.
