import { multiplayerConfig } from '../../../lib/multiplayer-config';

export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  try {
    return Response.json(multiplayerConfig(request.url, process.env.COLYSEUS_URL), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'The multiplayer server is not configured correctly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
