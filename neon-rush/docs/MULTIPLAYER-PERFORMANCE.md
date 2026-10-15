# Multiplayer performance implementation and verification

Verified locally on 14 October 2026 with Node 22.15.0. No dependencies, infrastructure, gameplay modes, room rules, graphics, or transport were replaced.

## Findings before implementation

The frontend is React 19, TypeScript, Vite, Three.js and React Three Fiber. The backend is a single Node process using `ws`; active rooms live in memory. There are no database calls in the simulation path.

* Controls were sampled every 50 ms. Local movement waited for a server update, then eased toward it at render time. There were no input acknowledgements, prediction, or replay. This added sampling, round-trip, snapshot and visual easing delays to movement.
* Remote movement eased toward the most recently received position without a timestamp buffer. This could not absorb variable arrival intervals. Projectile positions changed only on snapshots.
* The server interval was nominally 30 Hz, but simulation consumed variable wall-clock deltas, clamped to 100 ms. Physics used smaller substeps; tick scheduling and snapshot scheduling were coupled.
* Full room snapshots were serialized separately for each recipient, including unchanged names, colors and other metadata. Every received snapshot published React state.
* The send helper silently dropped all message types once the socket queue reached its soft limit, including control responses. Heartbeats, room isolation, reconnection tokens, origin validation and cleanup already existed and have been retained.

The implementation order was shared movement and fixed stepping, sequenced commands and prediction, snapshot interpolation and deltas, diagnostics, then deterministic, real-socket and browser regression tests.

## Resulting architecture

The client samples the existing keyboard/mouse and touch controls through `requestAnimationFrame`. A 60 Hz fixed command step predicts movement immediately, using the same speed normalization, axis-separated cover collision, boundaries, dash speed and dash timers as the server. Arena gameplay has dash rather than jumping; solo jumping and its physics are unchanged. Long display frames contribute at most 100 ms of simulation, and pending commands are bounded to 120.

Each command has a strictly increasing sequence number and represents exactly 1/60 second. Inputs travel in batches of at most eight, at a configurable maximum send rate. Both a timer and input frames service the same rate-limited sender: browser timer delays must not strand commands while frames continue running. Dash and reload edges remain buffered across short frames and unsuccessful sends.

The server validates and queues commands, consumes at most one per 1/60-second substep, and acknowledges processed sequences in snapshots. Client positions, scores, health and elapsed time have no authority. A duplicate cannot execute again, a sequence gap is rejected, and a flood cannot increase movement speed. An empty command queue stops translation while preserving aim and briefly held fire; fire expires after 500 ms without new commands. Death, respawn, reconnect and round changes clear obsolete commands. Round identifiers exclude in-flight commands from previous matches.

Prediction resets to each authoritative position and replays unacknowledged commands. Corrections below 0.75 world units use a short visual offset decay; larger errors and lifecycle transitions apply immediately. Damage, shots, reload outcomes, shields, scoring and match results remain authoritative.

The server uses a monotonic accumulator with configurable 20/30/60 Hz ticks and 60 Hz collision substeps. Catch-up is bounded to five ticks; discarded wall time is measured. Snapshot sending has a separate timer. Simulation does not perform socket sends or database work.

Remote rendering uses up to 32 timestamped snapshots, shortest-path angle interpolation, a 75–220 ms adaptive buffer, and at most 80 ms of collision-aware extrapolation. Respawn/death transitions are not interpolated across. Bullets advance from their buffered authoritative trajectory between snapshots. Render transforms and animation poses are mutable; room HUD state publishes at about 10 Hz, with phase changes published immediately.

Protocol 2 sends changed player fields and changed room fields. Bullets remain a compact complete array when changed. Each delta names its baseline. Initial connections, reconnects, roster/phase changes, congestion recovery, explicit resync and periodic two-second keyframes send full snapshots. Missing baselines request a resync. Stale snapshots cannot rewind prediction. Serialization is shared across room recipients. Legacy protocol-1 clients still receive full snapshots and remain server-authoritative; deploy the backend before the new frontend.

Only replaceable snapshots/presence updates are skipped above the soft queue limit. Reliable events and control responses use the ordered WebSocket queue. A connection exceeding the 1 MiB hard limit closes explicitly and recovers through the existing session mechanism. Fresh full state replaces skipped deltas after congestion. No unrelated room receives the room's snapshots or events.

## Configuration and diagnostics

| Setting | Default | Supported values / use |
| --- | --- | --- |
| Backend `ARENA_TICK_RATE` | `30` | `20`, `30`, `60`; start with 30 |
| Backend `ARENA_SNAPSHOT_RATE` | `15` | Integer 5 through tick rate; start with 15 |
| Frontend `VITE_ARENA_INPUT_RATE` | `30` | Clamped to 10–60 messages/s; rebuild frontend after changing |
| Simulation command step | 60 Hz | Fixed protocol duration, independent of batch rate |
| Reconnect grace | 20 seconds | Existing session behavior |

Press **F3**, or open the game with `?netdebug=1`, to toggle the overlay. It displays RTT, interarrival jitter, FPS, configured tick rate, received snapshots/s, sent input batches/s, pending inputs, snapshot age, correction frequency/magnitude, approximate payload bandwidth and socket queue bytes. It is hidden by default and refreshes twice per second. Payload estimates exclude WebSocket/TLS overhead; non-ASCII text can make character counts understate bytes.

`GET /health` adds simulation step duration, maximum step duration, tick count, discarded catch-up time, skipped snapshots, transmitted bytes, event-loop p99 delay, process RSS and cumulative CPU usage. Use FPS/frame stalls to investigate rendering, simulation and event-loop metrics for backend stalls, RTT/jitter for transport, and correction/pending counts for synchronization. RTT is sampled by heartbeat and includes browser/server scheduling; it is not a pure link-latency measurement.

## Reproduce verification

Use the [README verification commands](../../README.md#verification) for the standard test suites and production build. The additional browser/network checks below focus on multiplayer performance.

Run `npm run server` and `npm run dev -- --port 5187` in separate terminals, then:

```sh
node scripts/multiplayer-browser-check.mjs
```

If a shell/npm combination strips forwarded arguments, use `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5187 --strictPort`. Set `NEON_BROWSER` to an installed Chromium/Chrome executable if the matching Playwright browser is unavailable. Screenshots are written to `test-results/`.

**Automated results:** 38 frontend/game/simulation tests and 11 server/WebSocket tests passed. TypeScript checking and Vite production build passed. Vite retains a warning for the existing approximately 965 kB Three.js chunk; this work does not reduce the graphics bundle.

The deterministic network tests run six players for 20 simulated seconds each. They include rapid direction changes, dash, cover collision and idle convergence. RTT is explicitly the round-trip delay. Jitter is added per direction. The loss scenario delays the ordered stream by 150 ms with 5% probability to model retransmission/head-of-line stalls; WebSocket application messages are not incorrectly treated as lossy datagrams.

| Simulated condition | First local movement | Maximum pending inputs | Largest remote displacement per 60 Hz frame |
| --- | --- | --- | --- |
| 20 ms RTT | 16.7 ms | 6 | 0.327 units |
| 50 ms RTT | 16.7 ms | 7 | 0.327 units |
| 100 ms RTT | 16.7 ms | 11 | 0.327 units |
| 200 ms RTT | 16.7 ms | 18 | 0.327 units |
| 100 ms RTT, ±35 ms jitter, 5% retransmission stalls | 16.7 ms | 34 | 0.879 units |

All scenarios converged to within 0.01 world units of server positions after stopping. None recorded ordinary local corrections above the 0.01-unit diagnostic threshold. Separate forced-error tests verify small-error smoothing, large authoritative corrections, death and rematch resets. These are deterministic simulation measurements, not hardware FPS or Internet benchmarks.

For the 100 ms RTT scenario, serializing each full room state totaled 603,451 characters; the corresponding delta representations totaled 133,644. This comparison excludes keyframes, envelopes, reliable events, input traffic and transport overhead, so it is not a claim of total network bandwidth savings.

A real six-player WebSocket run, with a seventh connection in a second isolated room, measured 30.03 ticks/s, a 1.005 ms maximum simulation step, 40.174 ms event-loop p99 and 61.0 MiB process RSS on this Windows host. These short local observations are not server capacity guarantees. Tests also cover origins, session expiry, host migration, forged coordinates, sequence flooding, duplicate rejection, reliable events under simulated sender congestion, full-state recovery and reconnect acknowledgement continuity.

The final desktop/mobile browser smoke test passed room invites, readiness, countdown, movement, mouse aim and real damage, kills, reload, respawn, refresh recovery, two-finger controls, dash, rematch and return to solo mode, with zero browser runtime errors. An earlier run exposed a timer-only sender stall; the rate-limited frame fallback addresses it, and the browser test checks for input-queue reconnects. The final run recorded none. One overlay sample during software-rendered testing showed 10 FPS, 10 ms RTT, 25.4 ms interarrival jitter, 13.6 snapshots/s, 9.7 input batches/s, 38 pending commands and a zero-byte socket queue. That constrained rendering sample does not meet 60 FPS; hardware-accelerated device performance remains to be measured.

## Files changed

| Files | Purpose |
| --- | --- |
| `shared/movement.js`, `shared/movement.d.ts` | Shared input validation, fixed command duration, movement and collision rules |
| `shared/snapshots.js`, `shared/snapshots.d.ts`, `shared/multiplayer.ts` | Baseline-checked deltas, acknowledgements and timing fields |
| `server/timing.mjs`, `server/arena.mjs`, `server/index.mjs` | Fixed loop, authoritative command queue, independent broadcasts, reliable event handling and metrics |
| `src/multiplayer/simulation.ts`, `client.ts` | Prediction/replay, interpolation history, sequence/session handling, batch sender and diagnostics counters |
| `src/multiplayer/useArenaControls.ts`, `ArenaScene.tsx` | Frame-based input sampling, predicted local transforms, buffered remote transforms and projectile motion |
| `src/multiplayer/NetworkDiagnostics.tsx`, `Multiplayer.tsx`, `multiplayer.css` | Optional diagnostic overlay and integration |
| `tests/multiplayer.test.ts`, `server/tests/network.test.mjs`, `scripts/multiplayer-browser-check.mjs`, `package.json` | Deterministic conditions, real sockets, browser regressions and test command |
| `.env.example`, this document, `MULTIPLAYER-RENDER.md`, root `README.md` | Configuration, deployment order and verification report |

## Remaining limits

* Actual device FPS still depends on GPU/CPU and scene cost. The software-rendered browser smoke run is a functional check, not proof of 60 FPS on every device.
* TCP retransmission and long stalls can still freeze or visibly correct remote movement. The jitter scenario's 0.879-unit worst frame is larger than the ordinary 0.327-unit dash step. Prediction is bounded; sufficiently long acknowledgement stalls reconnect rather than accumulating unlimited stale actions.
* Local translation is predicted; hits, damage and firing feedback still wait for server authority. No historical hit rewind/lag compensation was added.
* The backend remains one in-memory process. Restart loses rooms; horizontal scaling and persistent ranked results remain out of scope. No Redis or new transport was introduced.
* JSON remains the wire format. Current measurements do not justify binary-format complexity. Very large load, mobile thermal throttling and production WAN routes need deployment-specific profiling.

## Android controls and fullscreen follow-up

The arena now fits phone portrait and landscape viewport heights, exposes dual thumb pads based on touch capability (including wide landscape phones), and respects display safe areas. Pads have a center dead zone, separate pointer ownership, direct knob transforms, and release on cancellation, rotation, lost focus or page hiding. Another finger pressing Dash no longer clears a held pad merely by moving focus. Reload and Dash have larger touch targets.

Use the in-arena fullscreen button or **Alt+Enter** on PC; press Escape or the exit button to leave. A dismissible screen-fit layout is available when the browser declines native fullscreen. Solo mode retains its existing fullscreen button.

Rendering now memoizes runner components and adjusts pixel ratio after sustained slow frames, from a starting cap of 1.25 on touch devices / 1.5 on desktop down to 0.75. Resolution recovers slowly after sustained fast frames; models, effects, collisions and game rules are preserved. These changes target device load and do not guarantee 60 FPS on every Android phone. Browser checks emulate touch devices; physical Android hardware remains untested.

Follow-up validation passed the production build and expanded browser smoke test with zero runtime errors. Touch layouts were checked at 390?844, 844?390, 320?568 and 568?320, including simultaneous move/fire, cancellation, visible in-viewport pads, non-overlapping health/reload panels, desktop fullscreen/Alt+Enter, and fullscreen denial fallback. Screenshots are in `test-results/multiplayer-touch-320.png`, `multiplayer-touch-568.png` and `multiplayer-combat-landscape.png`.
