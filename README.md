<img src="assets/icon.svg" width="64" height="64" alt="">

# Crossfire

A 3D multiplayer browser shooter with a Colyseus WebSocket server. Up to eight players share a room, with three weapons, server-checked hits, jumping, sprinting, respawns, and five-minute free-for-all rounds. A separate practice mode includes three labelled bots.

The application lives in [crossfire/](crossfire/). See its [setup instructions](crossfire/README.md) to run locally or deploy. From this directory, `npm run dev`, `npm run build`, and `npm test` forward to the application.

The frontend can run on Vercel; the Colyseus server needs a separate persistent host. A [Dockerfile](crossfire/Dockerfile.colyseus) and [Fly.io configuration for Sydney](crossfire/fly.toml) are included. Set `COLYSEUS_URL` on the frontend to activate the new connection. Existing production deployments retain the legacy transport until that URL is configured.

Created in [T3 Code](https://t3.codes).
