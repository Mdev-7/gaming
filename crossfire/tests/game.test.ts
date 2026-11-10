import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_INPUT, WEAPONS, addPlayer, advanceRoom, applyInput, cleanName, movePlayer, newRoom, sanitizeInput, snapshot } from '../lib/game.ts';

test('normalizes movement, stops at cover, and lands jumps', () => {
  const straight = { x: 12, y: 0, z: 12, vy: 0 }, diagonal = { ...straight };
  movePlayer(straight, { ...EMPTY_INPUT, mx: 1 }, 0.1);
  movePlayer(diagonal, { ...EMPTY_INPUT, mx: 1, mz: 1 }, 0.1);
  assert.ok(Math.abs(Math.hypot(diagonal.x - 12, diagonal.z - 12) - (straight.x - 12)) < 0.00001);
  const againstWall = { x: 3, y: 0, z: 0, vy: 0 };
  for (let i = 0; i < 100; i++) movePlayer(againstWall, { ...EMPTY_INPUT, mx: -1 }, 1 / 60);
  assert.ok(againstWall.x >= 2.46, 'cannot walk through the center pillar');
  movePlayer(straight, { ...EMPTY_INPUT, jump: true }, 1 / 60);
  assert.ok(straight.y > 0);
  for (let i = 0; i < 120; i++) movePlayer(straight, EMPTY_INPUT, 1 / 60);
  assert.equal(straight.y, 0);
  assert.equal(straight.vy, 0);
});

test('rejects invalid values and never exposes session secrets', () => {
  const input = sanitizeInput({ mx: Infinity, mz: -999, yaw: NaN, weapon: 999, pitch: 9, fire: 'yes' as unknown as boolean });
  assert.equal(input.mx, 0); assert.equal(input.mz, -1); assert.equal(input.weapon, 2); assert.equal(input.pitch, 1.45); assert.equal(input.fire, false);
  assert.equal(cleanName('<script>Rookie!</script>'), 'scriptRookiescript');
  const room = newRoom('TESTAA', 100);
  addPlayer(room, 'alice', 'secret-token', 'Alice', 100);
  const publicState = JSON.stringify(snapshot(room));
  assert.ok(!publicState.includes('secret-token'));
  assert.ok(!publicState.includes('"input"'));
});

function duel() {
  const room = newRoom('TESTAA', 100), a = addPlayer(room, 'alice', 'a-secret', 'Alice', 100), b = addPlayer(room, 'bob', 'b-secret', 'Bob', 100);
  Object.assign(a, { x: 12, y: 0, z: 12, yaw: 0, protectedUntil: 0, ready: true });
  Object.assign(b, { x: 12, y: 0, z: 7, yaw: Math.PI, protectedUntil: 0, ready: true });
  return { room, a, b };
}
test('server shots consume ammunition, deal damage, score kills, and respawn', () => {
  const { room, a, b } = duel();
  applyInput(a, { ...EMPTY_INPUT, seq: 1, fire: true, pitch: -0.05 }, 100);
  for (let i = 1; i <= 12; i++) { a.lastSeen = 100 + i * 0.1; b.lastSeen = a.lastSeen; advanceRoom(room, a.lastSeen); }
  assert.equal(b.hp, 0); assert.equal(a.kills, 1); assert.equal(b.deaths, 1);
  assert.ok(a.ammo[0] < WEAPONS[0].magazine);
  assert.ok(room.events.some(e => e.type === 'kill' && e.by === a.id && e.target === b.id));
  a.input.fire = false;
  a.lastSeen = 106; b.lastSeen = 106; advanceRoom(room, 106);
  assert.equal(b.hp, 100); assert.equal(b.ammo[0], 30);
});

test('cover blocks hits and spawn protection prevents immediate damage', () => {
  const { room, a, b } = duel();
  a.x = 0; a.z = 7; b.x = 0; b.z = -7;
  applyInput(a, { ...EMPTY_INPUT, seq: 1, fire: true }, 100);
  a.lastSeen = 100.3; advanceRoom(room, 100.3);
  assert.equal(b.hp, 100);
  const other = duel(); other.b.protectedUntil = 200;
  applyInput(other.a, { ...EMPTY_INPUT, seq: 1, fire: true }, 100);
  other.a.lastSeen = 100.3; advanceRoom(other.room, 100.3);
  assert.equal(other.b.hp, 100);
});

test('reloads on server time and ignores duplicate or stale inputs', () => {
  const { room, a, b } = duel(); a.ammo[0] = 3;
  applyInput(a, { ...EMPTY_INPUT, seq: 10, reload: true }, 100);
  applyInput(a, { ...EMPTY_INPUT, seq: 9, weapon: 2 }, 100);
  assert.equal(a.weapon, 0); assert.equal(a.seq, 10);
  a.lastSeen = 100.1; advanceRoom(room, 100.1);
  assert.ok(a.reloadUntil > 100);
  a.input.reload = false; a.lastSeen = 102; b.lastSeen = 102; advanceRoom(room, 102);
  assert.equal(a.ammo[0], 30); assert.equal(a.reloadUntil, 0);
});

test('finishes rounds, resets scores, and removes inactive sessions', () => {
  const { room, a, b } = duel(); a.kills = 15;
  advanceRoom(room, 100.1); assert.equal(room.winner, 'Alice');
  a.lastSeen = 109; b.lastSeen = 109; advanceRoom(room, 109);
  assert.equal(room.winner, null); assert.equal(a.kills, 0); assert.ok(room.roundEnd > 400);
  advanceRoom(room, 130); assert.equal(Object.keys(room.players).length, 0);
});

test('spawns face into the arena and players deploy before taking damage', () => {
  const room = newRoom('DEPLOY', 100), a = addPlayer(room, 'a', 'secret', 'Alice', 100);
  const towardCenter = (-Math.sin(a.yaw)) * (-a.x) + (-Math.cos(a.yaw)) * (-a.z);
  assert.ok(towardCenter > 0, 'spawn looks toward center');
  assert.equal(a.ready, false);
  applyInput(a, { ...EMPTY_INPUT, seq: 1, active: true }, 103);
  assert.equal(a.ready, true); assert.equal(a.protectedUntil, 104.5);
  for (let i = 0; i < 7; i++) addPlayer(room, 'guest-' + i, 'token', 'Guest', 103);
  assert.throws(() => addPlayer(room, 'overflow', 'token', 'Guest', 103), /room is full/);
});
