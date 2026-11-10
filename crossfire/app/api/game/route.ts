import { env } from 'cloudflare:workers';
import { addPlayer, addPracticeBots, advanceRoom, applyInput, cleanName, newRoom, snapshot, type Room, type Input } from '../../../lib/game';

export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
type Body = { action?: string; code?: string; name?: string; id?: string; token?: string; input?: Partial<Input> };
type Row = { state: string; version: number };
class GameError extends Error { constructor(message: string, public status = 400) { super(message); } }
function db() { if (!env.DB) throw new GameError('The match server is not configured yet.', 503); return env.DB; }
function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}
async function mutate<T>(code: string, operation: (room: Room, now: number) => T): Promise<{ state: ReturnType<typeof snapshot>; result: T }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await db().prepare('SELECT state, version FROM arena_rooms WHERE code = ?').bind(code).first<Row>();
    if (!row) throw new GameError('Room not found. Check the code and try again.', 404);
    const room: Room = JSON.parse(row.state);
    const now = Date.now() / 1000;
    advanceRoom(room, now);
    const result = operation(room, now);
    const update = await db().prepare('UPDATE arena_rooms SET state = ?, version = version + 1, touched_at = ? WHERE code = ? AND version = ?').bind(JSON.stringify(room), Math.floor(now), code, row.version).run();
    if (update.meta.changes === 1) return { state: snapshot(room), result };
  }
  throw new GameError('Match is busy. Reconnecting…', 503);
}
export async function GET() { return reply({ service: 'Crossfire Arena', transport: 'shared authoritative rooms', maxPlayers: 8 }); }
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== new URL(request.url).host) throw new GameError('Cross-origin requests are not supported.', 403);
    const text = await request.text();
    if (text.length > 4096) throw new GameError('Request too large.', 413);
    let body: Body;
    try { body = JSON.parse(text); } catch { throw new GameError('Invalid request.'); }
    if (!body || typeof body !== 'object') throw new GameError('Invalid request.');
    const now = Date.now() / 1000;
    if (['create', 'quick', 'practice', 'join'].includes(body.action || '')) {
      let code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
      if (body.action !== 'join') {
        code = body.action === 'quick' ? 'OPEN01' : roomCode();
        const room = newRoom(code, now, body.action === 'practice');
        if (body.action === 'practice') addPracticeBots(room, now);
        await db().prepare('INSERT OR IGNORE INTO arena_rooms (code, state, version, touched_at) VALUES (?, ?, 0, ?)').bind(code, JSON.stringify(room), Math.floor(now)).run();
        // Empty abandoned rooms expire without retaining player/session data.
        if (body.action !== 'quick') await db().prepare('DELETE FROM arena_rooms WHERE touched_at < ?').bind(Math.floor(now) - 1800).run();
      }
      if (!/^[A-Z2-9]{6}$/.test(code) && code !== 'OPEN01') throw new GameError('Enter a valid 6-character room code.');
      const id = crypto.randomUUID().slice(0, 12), token = crypto.randomUUID();
      const { state } = await mutate(code, (room, t) => { addPlayer(room, id, token, cleanName(body.name), t); });
      return reply({ code, id, token, state });
    }
    if (body.action === 'sync' || body.action === 'leave') {
      const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
      if (!/^[A-Z0-9]{6}$/.test(code)) throw new GameError('Invalid room.');
      const { state } = await mutate(code, (room, t) => {
        const player = room.players[body.id || ''];
        if (!player || !body.token || player.token !== body.token || player.bot) throw new GameError('Your session expired. Join the room again.', 401);
        if (body.action === 'leave') { delete room.players[player.id]; return; }
        if (!body.input || typeof body.input !== 'object') throw new GameError('Missing player input.');
        applyInput(player, body.input, t);
      });
      return reply({ state });
    }
    throw new GameError('Unknown action.');
  } catch (error) {
    if (error instanceof GameError) return reply({ error: error.message }, error.status);
    if (error instanceof Error && error.message.includes('room is full')) return reply({ error: error.message }, 409);
    console.error('Match request failed:', error instanceof Error ? error.message : 'Unknown error');
    return reply({ error: 'Could not reach the match server. Please try again.' }, 503);
  }
}
