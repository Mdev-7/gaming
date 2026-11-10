// End-to-end match test against a running server; creates two independent clients.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { BOXES, EYE_HEIGHT, EMPTY_INPUT, wallDistance, type Input, type Snapshot } from '../lib/game.ts';

const base = process.env.CROSSFIRE_URL || 'http://127.0.0.1:5173';
type Client = { code: string; id: string; token: string; seq: number; state: Snapshot };
async function request(body: unknown, expected = 200) {
  const response = await fetch(base + '/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json() as Record<string, unknown>;
  assert.equal(response.status, expected, JSON.stringify(data)); return data;
}
async function sync(client: Client, input: Partial<Input> = {}) {
  const result = await request({ action: 'sync', code: client.code, id: client.id, token: client.token, input: { ...EMPTY_INPUT, active: true, ...input, seq: ++client.seq } });
  client.state = result.state as Snapshot; return client.state;
}
function pathBetween(start: { x: number; z: number }, end: { x: number; z: number }) {
  const sx = Math.round(start.x), sz = Math.round(start.z), gx = Math.round(end.x), gz = Math.round(end.z);
  const key = (x: number, z: number) => x + ',' + z;
  const queue = [{ x: sx, z: sz }], visited = new Map<string, string | null>([[key(sx, sz), null]]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]; if (p.x === gx && p.z === gz) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, z = p.z + dz, k = key(x, z);
      if (Math.abs(x) > 23 || Math.abs(z) > 23 || visited.has(k)) continue;
      if (BOXES.some(b => x + 0.5 > b.x - b.w / 2 && x - 0.5 < b.x + b.w / 2 && z + 0.5 > b.z - b.d / 2 && z - 0.5 < b.z + b.d / 2)) continue;
      visited.set(k, key(p.x, p.z)); queue.push({ x, z });
    }
  }
  const path: { x: number; z: number }[] = []; let at: string | null = key(gx, gz);
  assert.ok(visited.has(at), 'there is a walkable route between players');
  while (at) { const [x, z] = at.split(',').map(Number); path.unshift({ x, z }); at = visited.get(at) || null; }
  return path;
}
const created = await request({ action: 'create', name: 'Network Alice' });
const alice = { ...created, seq: 0 } as unknown as Client;
const joined = await request({ action: 'join', code: alice.code, name: 'Network Bob' });
const bob = { ...joined, seq: 0 } as unknown as Client;
try {
  await Promise.all([sync(alice), sync(bob)]);
  assert.equal(Object.keys(bob.state.players).length, 2);
  assert.equal(bob.state.players[alice.id].name, 'Network Alice');
  assert.ok(!JSON.stringify(bob.state).includes(alice.token), 'opponents never receive session tokens');
  await request({ action: 'sync', code: alice.code, id: bob.id, token: alice.token, input: EMPTY_INPUT }, 401);
  const target = bob.state.players[bob.id];
  const goal = Math.abs(target.z) >= 19 ? { x: target.x + (target.x > 0 ? -6 : 6), z: target.z } : { x: target.x, z: target.z + (target.z > 0 ? -6 : 6) };
  const path = pathBetween(alice.state.players[alice.id], goal);
  let moved = false;
  for (let tick = 0; tick < 400; tick++) {
    const a = alice.state.players[alice.id], b = alice.state.players[bob.id];
    if (a.kills >= 1) break;
    const dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz), pitch = Math.atan2(-0.45, distance);
    const dir = { x: dx / distance * Math.cos(pitch), y: Math.sin(pitch), z: dz / distance * Math.cos(pitch) };
    const clear = wallDistance({ x: a.x, y: a.y + EYE_HEIGHT, z: a.z }, dir) > distance;
    while (path.length > 1 && Math.hypot(path[0].x - a.x, path[0].z - a.z) < 0.7) path.shift();
    const waypoint = path[0], wx = waypoint.x - a.x, wz = waypoint.z - a.z, step = Math.max(1, Math.hypot(wx, wz));
    moved ||= !clear;
    await Promise.all([sync(alice, { mx: clear ? 0 : wx / step, mz: clear ? 0 : wz / step, yaw: Math.atan2(-dx, -dz), pitch, fire: clear, sprint: !clear }), sync(bob)]);
    await delay(100);
  }
  await sync(bob);
  assert.equal(alice.state.players[alice.id].kills, 1, 'server awards a real PvP kill');
  assert.equal(bob.state.players[bob.id].deaths, 1, 'second client sees the same death');
  assert.equal(bob.state.players[bob.id].hp, 0);
  assert.ok(alice.state.players[alice.id].ammo[0] < 30, 'shots consume server ammunition');
  for (let i = 0; i < 34; i++) { await Promise.all([sync(alice), sync(bob)]); await delay(100); }
  assert.equal(bob.state.players[bob.id].hp, 100, 'the victim respawns on both clients');
  await sync(alice, { weapon: 2 }); await sync(bob);
  assert.equal(bob.state.players[alice.id].weapon, 2, 'weapon changes replicate');
  console.log(JSON.stringify({ passed: true, clients: 2, room: alice.code, checks: ['shared room', 'token isolation', 'session authentication', 'authoritative PvP damage', 'kill replication', 'respawn', 'weapon replication'], routedAroundCover: moved }));
} finally {
  await Promise.all([request({ action: 'leave', code: alice.code, id: alice.id, token: alice.token }), request({ action: 'leave', code: bob.code, id: bob.id, token: bob.token })]);
}
