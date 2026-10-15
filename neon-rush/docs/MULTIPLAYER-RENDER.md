# Deploy the multiplayer arena on Render

Deploy the updated backend before the frontend: the new frontend uses protocol 2 sequenced input batches and delta snapshots. The backend still accepts legacy clients. See the [performance guide](MULTIPLAYER-PERFORMANCE.md#configuration-and-diagnostics) for rate configuration and diagnostics.

Keep the frontend as a Render Static Site. Multiplayer uses a separate Node Web Service for WebSockets; Render routes public WebSockets through its Web Services using `wss://`. [Render WebSocket documentation](https://render.com/docs/websocket).

## 1. Push the updated repository

Include the frontend changes and the `neon-rush/server/` and `neon-rush/shared/` directories. Commit `server/package-lock.json`; keep `node_modules`, `.env`, and `.npm-cache` out of Git. This guide uses manual service configuration in the Render dashboard.

## 2. Create the arena Web Service

In the Render dashboard, choose **New → Web Service**, connect this repository, and configure the service manually with these settings:

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
| `ALLOWED_ORIGINS` | Your frontend origin, e.g. `https://YOUR-FRONTEND.onrender.com` |

The root directory must include both `server/` and `shared/`. The service listens on Render's `PORT` and binds to `0.0.0.0`. The origin value has **no trailing slash**. Additional site origins can be comma-separated if you later add a custom domain. Create this backend alongside the existing Static Site. Choose the service plan explicitly in the dashboard before deploying.

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

## Operations and further reading

Run one backend instance: rooms and sessions are in memory, so a restart ends active rooms. For controls, architecture, reconnect behavior, voice networking limits, and scaling, see the [developer architecture guide](MULTIPLAYER-ARCHITECTURE.md). For local setup and standard checks, see the [README](../../README.md#run-locally) and [verification commands](../../README.md#verification).
