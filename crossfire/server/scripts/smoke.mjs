import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@colyseus/sdk';

const endpoint = process.env.COLYSEUS_URL || 'http://127.0.0.1:2567';
const client = new Client(endpoint);
const rooms = [];
const zero = { mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, sprint: false, fire: false, reload: false, weapon: 0, active: true };
try {
  const alice = await client.create('arena', { name: 'Smoke Alice', mode: 'online', public: false }); rooms.push(alice);
  alice.onMessage('snapshot', () => {});
  const bob = await client.joinById(alice.roomId, { name: 'Smoke Bob' }); rooms.push(bob);
  let state, updates = 0;
  bob.onMessage('snapshot', next => { state = next; updates++; });
  state = await bob.request('snapshot');
  assert.equal(Object.keys(state.players).length, 2);
  assert.ok(!JSON.stringify(state).includes('"token"'));
  const started = performance.now();
  await delay(1200);
  const hz = Math.round(updates / ((performance.now() - started) / 1000));
  assert.ok(hz >= 15, 'Expected live snapshots; received ' + hz + '/sec');
  const original = state.players[alice.sessionId];
  const direction = original.x > 0 ? -1 : 1;
  let seq = 0;
  const heartbeat = setInterval(() => alice.send('input', { ...zero, seq: ++seq, mx: direction }), 1000 / 30);
  await delay(250); clearInterval(heartbeat);
  alice.send('input', { ...zero, seq: ++seq });
  await delay(350);
  const moved = state.players[alice.sessionId];
  assert.ok(Math.abs(moved.x - original.x) > 0.2, 'movement replicated to the second browser');
  assert.ok(Math.abs(moved.x - original.x) < 3, 'movement stays bounded');
  const pingMs = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Ping timed out')), 5000);
    bob.ping(ms => { clearTimeout(timeout); resolve(Math.round(ms)); });
  });
  console.log(JSON.stringify({ passed: true, endpoint, clients: 2, snapshotsPerSecond: hz, pingMs, checks: ['room join', 'token isolation', 'autonomous snapshots', 'replicated movement', 'WebSocket ping'] }));
} finally { await Promise.all(rooms.map(room => room.leave())); }
