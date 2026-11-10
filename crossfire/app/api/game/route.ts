import { proxyGameRequest } from '../../../lib/game-proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Vercel hosts the UI; authoritative multiplayer stays on the shared game server.
export const GET = proxyGameRequest;
export const POST = proxyGameRequest;
