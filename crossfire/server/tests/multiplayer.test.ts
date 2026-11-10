import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, type Room as ClientRoom } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../server.js';
import { type ArenaRoom } from '../ArenaRoom.js';
import { EMPTY_INPUT, type Snapshot, type Input } from '../../lib/game.js';

let server: ReturnType<typeof createGameServer>, endpoint: string;
before(async () => {
  server = createGameServer();
  await server.listen(0, '127.0.0.1');
  const address = server.transport.server!.address();
  assert.ok(address && typeof address !== 'string');
  endpoint = 'http://127.0.0.1:' + address.port;
});
after(async () => { await server.gracefullyShutdown(false); });

async function waitFor(condition: () => boolean, timeout = 3000) {
  const deadline = performance.now() + timeout;
  while (!condition()) { if (performance.now() > deadline) throw new Error('Timed out waiting for match state'); await delay(15); }
}
async function watch(room: ClientRoom) {
  let state: Snapshot;
  let count = 0;
  room.onMessage<Snapshot>('snapshot', next => { state = next; count++; });
  state = await room.request<undefined, Snapshot>('snapshot');
  return { room, get state() { return state; }, get count() { return count; } };
}
type Watching = Awaited<ReturnType<typeof watch>>;
function input(client: Watching, seq: number, update: Partial<Input> = {}) { client.room.send('input', { ...EMPTY_INPUT, active: true, ...update, seq }); }

test('pushes room snapshots at 30 Hz without any input polling and hides session tokens', async () => {
  const sdk = new Client(endpoint);
  const alice = await watch(await sdk.create('arena', { name: 'Alice', mode: 'online', public: false }));
  const bob = await watch(await sdk.joinById(alice.room.roomId, { name: 'Bob' }));
  try {
    const before = bob.state.time, count = bob.count;
    await delay(700);
    const updates = bob.count - count;
    assert.ok(updates >= 14 && updates <= 27, 'received ' + updates + ' autonomous snapshots in 700 ms');
    assert.ok(bob.state.time - before > 0.5);
    assert.equal(Object.keys(bob.state.players).length, 2);
    assert.ok(!JSON.stringify(bob.state).includes('"token"'));
    assert.ok(!JSON.stringify(bob.state).includes('"input"'));
    const p = alice.state.players[alice.room.sessionId], x = p.x;
    input(alice, 1, { mx: x > 0 ? -999 : 999, id: bob.room.sessionId } as Partial<Input>);
    await delay(250);
    const moved = alice.state.players[alice.room.sessionId];
    assert.ok(Math.hypot(moved.x - p.x, moved.z - p.z) < 2, 'server clamps speed');
    assert.equal(bob.state.players[bob.room.sessionId].seq, 0, 'an input cannot impersonate another socket');
    console.log('WebSocket snapshots per second:', Math.round(updates / 0.7));
  } finally { await Promise.all([alice.room.leave(), bob.room.leave()]); }
});

test('replicates authoritative kills, respawns, reloads, and very brief trigger presses', async () => {
  const sdk = new Client(endpoint);
  const alice = await watch(await sdk.create('arena', { name: 'Alice', mode: 'online', public: false }));
  const bob = await watch(await sdk.joinById(alice.room.roomId, { name: 'Bob' }));
  let seq = 0;
  let command: Partial<Input> = {};
  const send = (update: Partial<Input> = {}) => { command = { ...command, ...update }; input(alice, ++seq, command); };
  const heartbeat = setInterval(() => send(), 1000 / 30);
  try {
    const authoritative = matchMaker.getLocalRoomById(alice.room.roomId) as ArenaRoom;
    const a = authoritative.game.players[alice.room.sessionId], b = authoritative.game.players[bob.room.sessionId];
    Object.assign(a, { x: 12, y: 0, z: 12, yaw: 0, ready: true, protectedUntil: 0 });
    Object.assign(b, { x: 12, y: 0, z: 7, yaw: Math.PI, ready: true, protectedUntil: 0 });
    send({ fire: true, yaw: 0, pitch: -0.05 }); input(bob, 1);
    await waitFor(() => bob.state.players[b.id].hp === 0);
    send({ fire: false });
    await waitFor(() => alice.state.players[a.id].kills === 1);
    assert.equal(bob.state.players[b.id].deaths, 1);
    await waitFor(() => bob.state.players[b.id].hp === 100, 4500);
    const ammunition = a.ammo[0];
    send({ fire: true }); send({ fire: false });
    await waitFor(() => a.ammo[0] === ammunition - 1);
    a.ammo[0] = 3;
    send({ reload: true }); send({ reload: false });
    await waitFor(() => a.ammo[0] === 30, 2500);
    send({ weapon: 2 });
    await waitFor(() => bob.state.players[a.id].weapon === 2);
  } finally { clearInterval(heartbeat); await Promise.all([alice.room.leave(), bob.room.leave()]); }
});

test('keeps practice and private rooms out of quick matchmaking and enforces eight-player capacity', async () => {
  const sdk = new Client(endpoint), rooms: ClientRoom[] = [];
  try {
    const privateRoom = await sdk.create('arena', { name: 'Private', mode: 'online', public: false }); rooms.push(privateRoom);
    const practice = await watch(await sdk.create('arena', { name: 'Practice', mode: 'practice', public: false })); rooms.push(practice.room);
    assert.equal(Object.values(practice.state.players).filter(p => p.bot).length, 3);
    const quick = await sdk.joinOrCreate('arena', { name: 'Quick A', mode: 'online', public: true }); rooms.push(quick);
    const quickB = await sdk.joinOrCreate('arena', { name: 'Quick B', mode: 'online', public: true }); rooms.push(quickB);
    assert.equal(quick.roomId, quickB.roomId); assert.notEqual(quick.roomId, privateRoom.roomId); assert.notEqual(quick.roomId, practice.room.roomId);
    for (let i = 0; i < 7; i++) rooms.push(await sdk.joinById(privateRoom.roomId, { name: 'Guest ' + i }));
    await assert.rejects(() => sdk.joinById(privateRoom.roomId, { name: 'Overflow' }));
    await assert.rejects(() => sdk.joinById('XXXXXX', { name: 'Missing room' }));
  } finally { await Promise.all(rooms.map(room => room.leave())); }
});

test('automatically reconnects the same player and stops movement during a dropped connection', async () => {
  const sdk = new Client(endpoint);
  const alice = await watch(await sdk.create('arena', { name: 'Alice', mode: 'online', public: false }));
  const bob = await watch(await sdk.joinById(alice.room.roomId, { name: 'Bob' }));
  try {
    alice.room.reconnection.minDelay = 100; alice.room.reconnection.minUptime = 0;
    let dropped = false, reconnected = false;
    alice.room.onDrop(() => { dropped = true; }); alice.room.onReconnect(() => { reconnected = true; });
    const id = alice.room.sessionId;
    const authoritative = matchMaker.getLocalRoomById(alice.room.roomId) as ArenaRoom;
    authoritative.game.players[id].kills = 2;
    input(alice, 1, { mx: 1, fire: true });
    void alice.room.leave(false);
    await waitFor(() => dropped && reconnected, 7000);
    await waitFor(() => bob.state.players[id]?.kills === 2);
    assert.equal(alice.room.sessionId, id); assert.equal(authoritative.game.players[id].input.fire, false);
    assert.equal(Object.keys(bob.state.players).length, 2);
  } finally { await Promise.all([alice.room.leave(), bob.room.leave()]); }
});
