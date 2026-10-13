# Deploy the multiplayer arena on Render

The existing site is **https://neon-rush-rsii.onrender.com**. Keep it as a Render Static Site. Multiplayer uses a separate Node Web Service for WebSockets; Render routes public WebSockets through its Web Services using `wss://`. [Render WebSocket documentation](https://render.com/docs/websocket).

## 1. Push the updated repository

Include the frontend changes, the `neon-rush/server/` and `neon-rush/shared/` directories, and the root `render.yaml`. Commit `server/package-lock.json`; keep `node_modules`, `.env`, and `.npm-cache` out of Git.

## 2. Create the arena Web Service

Connect the repository to a new Render Blueprint using the included [render.yaml](../../render.yaml), or create one **Web Service** manually with these settings:

| Setting | Value |
| --- | --- |
| Name | `neon-rush-arena` |
| Runtime | Node |
| Root Directory | `neon-rush` |
| Build Command | `npm ci --prefix server --omit=dev` |
| Start Command | `npm --prefix server start` |
| Health Check Path | `/health` |
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGINS` | `https://neon-rush-rsii.onrender.com` |

The root directory must include both `server/` and `shared/`. The service listens on Render's `PORT` and binds to `0.0.0.0`. The origin value has **no trailing slash**. Additional site origins can be comma-separated if you later add a custom domain. The Blueprint creates only the backend; it does not replace the existing Static Site. [Render Blueprint reference](https://render.com/docs/blueprint-spec).

The Blueprint selects the free plan to avoid creating a paid resource. Free services can sleep when idle and take time to wake; pick an always-on plan in Render if that delay is unsuitable for your production players. [Render free-service limitations](https://render.com/docs/free).

## 3. Connect the existing Static Site

After the backend deploys, copy **the actual service URL shown by Render**. On the existing **Static Site**, add this environment variable:

```text
VITE_MULTIPLAYER_URL=https://YOUR-ACTUAL-ARENA-SERVICE.onrender.com
```

This must point to the new **Web Service**, not the existing frontend site. The app converts it to `wss://…/ws`. Rebuild and redeploy the Static Site: Vite embeds environment variables during its build. Keep the site's current frontend build command and publish directory (`neon-rush/dist` when building from the repository root, or `dist` when its root directory is `neon-rush`).

Without this value, the production game shows that the online arena is unavailable; solo play remains available. No server credentials or API tokens belong in a `VITE_` variable.

## 4. Verify from two devices

1. Open the backend's `/health` URL; expect `status: "ok"`.
2. Open the production site and choose **Multiplayer Arena**.
3. Enter a name, create a room, and send its invite link or six-character code to a friend.
4. Join from another browser/device with a different name. Both players should appear in the live roster.
5. Both select **I'm Ready**. The host selects **Start Match**.
6. Confirm movement, names, health, hits, and kills update on both screens. The live radar shows opponents outside the camera view.

## Controls and match rules

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | WASD / arrow keys | Left pad |
| Aim | Mouse over arena | Right pad |
| Fire | Hold left mouse button or F | Hold/drag right pad |
| Dash | Space / Shift while moving | Dash while moving |
| Reload | R or Reload button | Reload button |

Rooms hold 2–6 players. Everyone must be ready. Rounds last 3 minutes or end when someone reaches 10 eliminations. The highest elimination count wins; equal counts share the win. Players respawn after 3 seconds. Spawn shields last 1.5 seconds, and firing ends protection. Cover stops movement and shots. The server controls movement speed, ammunition, damage, respawns, and results. Weapon/armor upgrades from solo play do not change PvP stats.

Matches continue when a tab loses focus; input stops automatically. A disconnected player has 20 seconds to reconnect with the same browser tab/session. Refreshing an active match restores that session during the grace period. A connected player takes over hosting when the host disconnects. Intentional departure releases the slot immediately. Display names are room nicknames, not authenticated accounts.

## Hosting model

Run **one backend instance**. Rooms and scores live in that process's memory and are removed when the room empties. Redeploying/restarting the backend ends active rooms; the client reconnects and asks players to create/join a new room. This implementation does not persist ranked results. Multiple instances require a shared room store and cross-instance messaging before scaling horizontally.

The backend restricts WebSocket origins, limits messages and payload size, rejects client-supplied health/score/positions, uses private random reconnect tokens, sends heartbeats, and expires disconnected sessions. Names are validated and rendered as text. Reconnect tokens are never included in shared room snapshots.

## Local development and checks

From `neon-rush/`, install the backend once:

```sh
npm ci --prefix server
```

Run these in two terminals:

```sh
npm run server
```

```sh
npm run dev -- --port 5187
```

Vite proxies `/ws` to port 3001; no local environment file is needed. The default backend origin allowlist includes localhost:5173 and 127.0.0.1:5173/5187. If using another port or a LAN hostname, set `ALLOWED_ORIGINS` on the backend to the exact frontend origin. For a local **production preview**, build with `VITE_MULTIPLAYER_URL=http://127.0.0.1:3001`, and allow that preview's origin on the backend.

```sh
npm test
npm run test:multiplayer
npm run build
node scripts/multiplayer-browser-check.mjs
```

The browser check requires both servers running at their default ports and a Playwright Chromium browser, or `NEON_BROWSER` set to a Chrome/Chromium executable. It exercises separate player sessions, invites, readiness, synchronized movement, actual PvP hits and kills, respawn/reload, refresh recovery, two-finger touch controls, rematches, and return to solo mode.
