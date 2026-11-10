# Crossfire — Multiplayer Arena

A 3D browser shooter with a separate Colyseus WebSocket server. Three.js renders the game; Next.js/Vinext serves the frontend.

## Local setup

Use Node.js 24 or newer. From `crossfire/`:

```sh
npm ci
npm run server:install
npm run server:dev
```

Keep that terminal running. In another terminal:

```sh
npm run dev
```

Open http://localhost:5173. Local frontends automatically connect to the local Colyseus server on port 2567. No database or D1 migration is needed for Colyseus.

For the Vercel build path, use `npm run build:vercel` then `npm run start:vercel`; it serves on http://localhost:3000 and uses the same local game server.

## Play

Enter a callsign and choose **Quick Play**, or **Create Room** and send its invite link to friends. **Warm up against bots** creates a separate practice match with three labelled opponents. All players must use frontends configured with the same Colyseus URL.

Up to eight total players share a room. First to 15 kills wins; rounds last five minutes. Players respawn after three seconds. New players stay protected until deploying and briefly after respawning. Practice bots occupy three room slots.

| Control | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look |
| Left / right click | Shoot / aim |
| Space / Shift | Jump / sprint |
| R | Reload |
| 1 / 2 / 3 | Assault rifle / shotgun / marksman rifle |
| Tab / Esc | Scoreboard / menu |

Gameplay needs a desktop keyboard and mouse. The lobby adapts to small screens. Embedded browsers that deny mouse capture can use right-drag to look.

## Networking

The browser connects **directly to Colyseus**, bypassing Vercel functions and the database for gameplay. `server/ArenaRoom.ts` owns each match in memory, runs a fixed 60 Hz simulation, and pushes MessagePack snapshots 30 times per second. Clients send input 30 times per second plus immediate weapon/button edges. Sending does not wait for an acknowledgment. Brief trigger and reload presses survive the interval between simulation ticks.

The server validates speed, collision, weapon cooldowns, ammunition, damage, reloads, spawn protection, and scores. Each socket controls its own session; it cannot select another player's ID. Public snapshots omit session secrets. Input size and message rates are bounded.

Clients predict local movement, replay inputs after server acknowledgments, and smooth small corrections. Remote players interpolate buffered snapshots with a 75 ms rendering delay. The HUD reports WebSocket round-trip latency and displays **WS 30 HZ** when Colyseus is active. A dropped connection stops the player's input and reserves the session for ten seconds while the SDK reconnects; scores are retained. Empty rooms are disposed automatically.

Matches are transient. Deploying or restarting the backend ends its rooms. This setup intentionally runs **one backend instance**. Before scaling horizontally, add a shared Colyseus Redis presence/driver and appropriate routing; do not simply start independent replicas behind a random load balancer.

## Deploy the server

The backend must run on a persistent container or Node service with WebSocket support. A regular Vercel Next.js function is not the room host.

### Fly.io / Sydney

From `crossfire/`, authenticate Fly's CLI, select an available app name in `fly.toml`, and create that app. Then run:

```sh
fly deploy --ha=false
```

The supplied configuration selects Sydney, keeps one machine running, and exposes the server through HTTPS/WSS. Review your Fly account's costs before creating resources.

### Docker or another Node host

Build with `docker build -f Dockerfile.colyseus -t crossfire-colyseus .` from `crossfire/`, then expose port 2567 through an HTTPS/WebSocket reverse proxy. Alternatively, install with `npm ci` in `server/`, run `npm run build`, then `npm start`. The build includes the shared simulation from `../lib/game.ts`, so deploy the repository layout rather than copying only `server/`.

Backend environment:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `2567` | HTTP matchmaking, health checks, and WebSockets |
| `ALLOWED_ORIGINS` | Empty | Optional comma-separated frontend origins; empty allows public browser access |

To verify a deployed backend, set `COLYSEUS_URL=https://your-server.example` and run `npm run server:smoke` from `crossfire/`. This opens two real sockets and checks room membership, snapshot frequency, movement, and ping.

## Connect Vercel

Use **Root Directory: `crossfire`**, **Framework: Next.js**, **Build Command: `npm run build:vercel`**, and **Output Directory: `.next`**. The repository's `vercel.json` provides those build settings.

Production frontends default to the Sydney service at `https://crossfire-colyseus-mdev7.fly.dev`; redeploy the latest GitHub commit to switch to it. No new Vercel environment variable is required. To override the default server, set:

```text
COLYSEUS_URL=https://your-colyseus-service.example
```

Redeploy after setting it. `/api/config` supplies that public URL once when joining; gameplay then goes directly through WSS. HTTPS frontends require an HTTPS/WSS backend. `COLYSEUS_URL` must point to the game service, not back to the frontend.

For a deliberate rollback, set `COLYSEUS_URL=legacy` and redeploy; the HUD labels that connection **HTTP**. Colyseus failures report a connection error rather than silently switching transports. The old `CROSSFIRE_GAME_SERVER_URL` affects only the legacy HTTP proxy.

## Checks

```sh
npm test
npm run server:build
npm run test:multiplayer
npm run build:vercel
```

The multiplayer tests start a real local Colyseus server and test two-client damage, kills, respawn, reload, short trigger taps, matchmaking isolation, eight-player capacity, and reconnection. They also confirm autonomous snapshots arrive at approximately 30 Hz without HTTP polling. `npm run test:legacy` retains the previous HTTP integration test for transitional deployments.

## Existing Sites / Cloudflare frontend

`.openai/hosting.json` keeps the current Site identity and legacy D1 binding. `npm run build` still builds the Cloudflare frontend unless `VERCEL=1`. Set the hosted frontend's `COLYSEUS_URL` to use the new backend. The Cloudflare Worker itself is not the Colyseus room server.
