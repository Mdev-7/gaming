import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import cors from 'cors';
import { ArenaRoom, SIMULATION_HZ, SNAPSHOT_HZ } from './ArenaRoom.js';

export function createGameServer() {
  const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allowed = (origin: string | null | undefined) => !origin || origins.length === 0 || origins.includes(origin);
  const server = new Server({
    greet: false,
    transport: new WebSocketTransport({
      maxPayload: 4096,
      perMessageDeflate: false,
      beforeUpgrade(request) {
        if (!allowed(request.headers.get('origin'))) return new Response('Origin not allowed', { status: 403 });
      },
    }),
    express(app) {
      app.use(cors({ origin(origin, callback) { callback(null, allowed(origin)); } }));
      app.get('/health', (_req, res) => res.json({ ok: true, service: 'Crossfire Colyseus', simulationHz: SIMULATION_HZ, snapshotHz: SNAPSHOT_HZ }));
      app.get('/', (_req, res) => res.json({ service: 'Crossfire Colyseus', health: '/health', transport: 'websocket' }));
    },
  });
  server.define('arena', ArenaRoom).filterBy(['mode', 'public']);
  return server;
}
