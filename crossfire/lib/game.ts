// Shared simulation: collision, movement and weapons run on the server.
export type Vec3 = { x: number; y: number; z: number };
export type Box = { x: number; z: number; w: number; d: number; h: number; kind: 'wall' | 'crate' | 'container' | 'pillar'; color?: string };
export const ARENA_SIZE = 25;
export const PLAYER_RADIUS = 0.36;
export const EYE_HEIGHT = 1.55;
export const ROUND_SECONDS = 300;
export const SCORE_LIMIT = 15;
export const BOXES: Box[] = [
  { x: 0, z: -25, w: 51, d: 1, h: 6, kind: 'wall' },
  { x: 0, z: 25, w: 51, d: 1, h: 6, kind: 'wall' },
  { x: -25, z: 0, w: 1, d: 50, h: 6, kind: 'wall' },
  { x: 25, z: 0, w: 1, d: 50, h: 6, kind: 'wall' },
  { x: -8, z: -7, w: 4, d: 10, h: 3.6, kind: 'container', color: '#396a6b' },
  { x: 8, z: 7, w: 4, d: 10, h: 3.6, kind: 'container', color: '#b45b32' },
  { x: 8, z: -10, w: 8, d: 3.4, h: 3.6, kind: 'container', color: '#b45b32' },
  { x: -8, z: 10, w: 8, d: 3.4, h: 3.6, kind: 'container', color: '#396a6b' },
  { x: 0, z: 0, w: 4.2, d: 4.2, h: 2.5, kind: 'pillar' },
  { x: -17, z: 2, w: 3, d: 3, h: 2.1, kind: 'crate' },
  { x: 17, z: -2, w: 3, d: 3, h: 2.1, kind: 'crate' },
  { x: -16, z: -16, w: 4, d: 3, h: 2.1, kind: 'crate' },
  { x: 16, z: 16, w: 4, d: 3, h: 2.1, kind: 'crate' },
  { x: -3, z: -18, w: 3, d: 2.5, h: 1.3, kind: 'crate' },
  { x: 3, z: 18, w: 3, d: 2.5, h: 1.3, kind: 'crate' },
];
export const SPAWNS = [
  { x: -20, z: 19 }, { x: 20, z: -19 }, { x: 20, z: 19 }, { x: -20, z: -19 },
  { x: 0, z: -21 }, { x: 0, z: 21 }, { x: -21, z: -5 }, { x: 21, z: 5 },
];
export const WEAPONS = [
  { id: 0, name: 'Vandal AR', short: 'ASSAULT RIFLE', damage: 24, magazine: 30, interval: 0.12, reload: 1.7, pellets: 1, spread: 0.007, range: 85 },
  { id: 1, name: 'Breach 12', short: 'PUMP SHOTGUN', damage: 13, magazine: 8, interval: 0.78, reload: 2.0, pellets: 8, spread: 0.075, range: 34 },
  { id: 2, name: 'Longshot', short: 'MARKSMAN RIFLE', damage: 85, magazine: 5, interval: 1.05, reload: 2.3, pellets: 1, spread: 0.001, range: 100 },
] as const;
export const COLORS = ['#f8ba45', '#53d3cc', '#fa8068', '#a3a1ff', '#9ed969', '#f38db5', '#65afff', '#e4d291'];
export type Input = { seq: number; mx: number; mz: number; yaw: number; pitch: number; jump: boolean; sprint: boolean; fire: boolean; reload: boolean; weapon: number; active: boolean };
export type Player = Vec3 & {
  id: string; token: string; name: string; color: string; bot: boolean; ready: boolean;
  yaw: number; pitch: number; vy: number; hp: number; weapon: number; ammo: number[];
  kills: number; deaths: number; lastSeen: number; fireAt: number; reloadUntil: number;
  respawnAt: number; protectedUntil: number; seq: number; input: Input;
};
export type GameEvent = { id: string; at: number; type: 'shot' | 'kill' | 'join'; by: string; target?: string; name?: string; victim?: string; weapon?: number; from?: Vec3; to?: Vec3; hit?: boolean; headshot?: boolean };
export type Room = { code: string; mode: 'online' | 'practice'; time: number; roundEnd: number; resetAt: number; winner: string | null; players: Record<string, Player>; events: GameEvent[] };
export type PublicPlayer = Omit<Player, 'token' | 'input'>;
export type Snapshot = Omit<Room, 'players'> & { players: Record<string, PublicPlayer> };
export const EMPTY_INPUT: Input = { seq: 0, mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, sprint: false, fire: false, reload: false, weapon: 0, active: false };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const finite = (v: unknown, fallback = 0) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
export function sanitizeInput(raw: Partial<Input>): Input {
  return { seq: clamp(Math.floor(finite(raw.seq)), 0, 1e12), mx: clamp(finite(raw.mx), -1, 1), mz: clamp(finite(raw.mz), -1, 1), yaw: finite(raw.yaw) % (Math.PI * 2), pitch: clamp(finite(raw.pitch), -1.45, 1.45), jump: raw.jump === true, sprint: raw.sprint === true, fire: raw.fire === true, reload: raw.reload === true, weapon: clamp(Math.floor(finite(raw.weapon)), 0, 2), active: raw.active === true };
}
export function cleanName(name: unknown) {
  return typeof name === 'string' ? name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 18) || 'Rookie' : 'Rookie';
}
export function newRoom(code: string, now: number, practice = false): Room {
  return { code, mode: practice ? 'practice' : 'online', time: now, roundEnd: now + ROUND_SECONDS, resetAt: 0, winner: null, players: {}, events: [] };
}
function spawn(room: Room, player: Player, now: number) {
  const others = Object.values(room.players).filter(p => p.id !== player.id && p.hp > 0);
  const sorted = [...SPAWNS].sort((a, b) => {
    const nearest = (s: typeof a) => others.length ? Math.min(...others.map(p => Math.hypot(p.x - s.x, p.z - s.z))) : Math.random() * 50;
    return nearest(b) - nearest(a);
  });
  const s = sorted[0];
  Object.assign(player, { x: s.x, y: 0, z: s.z, vy: 0, hp: 100, ammo: [30, 8, 5], reloadUntil: 0, respawnAt: 0, protectedUntil: now + 1.5, fireAt: now + 0.2, yaw: Math.atan2(s.x, s.z), pitch: 0 });
  player.input = { ...EMPTY_INPUT, seq: player.seq, yaw: player.yaw, weapon: player.weapon };
}
export function addPlayer(room: Room, id: string, token: string, name: string, now: number, bot = false): Player {
  if (Object.keys(room.players).length >= 8) throw new Error('This room is full. Try another room.');
  const player: Player = { id, token, name: cleanName(name), bot, ready: bot, color: COLORS[Object.keys(room.players).length % COLORS.length], x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vy: 0, hp: 100, weapon: 0, ammo: [30, 8, 5], kills: 0, deaths: 0, lastSeen: now, fireAt: now, reloadUntil: 0, respawnAt: 0, protectedUntil: now, seq: 0, input: { ...EMPTY_INPUT } };
  room.players[id] = player;
  spawn(room, player, now);
  room.events.push({ id: crypto.randomUUID(), at: now, type: 'join', by: id, name: player.name });
  return player;
}
export function addPracticeBots(room: Room, now: number) {
  ['ECHO', 'VECTOR', 'STATIC'].forEach((name, i) => addPlayer(room, 'bot-' + i, '', name, now, true));
}
function collides(x: number, y: number, z: number) {
  return BOXES.some(b => y < b.h && x + PLAYER_RADIUS > b.x - b.w / 2 && x - PLAYER_RADIUS < b.x + b.w / 2 && z + PLAYER_RADIUS > b.z - b.d / 2 && z - PLAYER_RADIUS < b.z + b.d / 2);
}
export function movePlayer(p: Pick<Player, 'x' | 'y' | 'z' | 'vy'>, input: Input, dt: number) {
  let mx = input.mx, mz = input.mz;
  const length = Math.hypot(mx, mz);
  if (length > 1) { mx /= length; mz /= length; }
  const speed = input.sprint && !input.fire ? 8.5 : 6.2;
  const nx = clamp(p.x + mx * speed * dt, -24.1, 24.1);
  const nz = clamp(p.z + mz * speed * dt, -24.1, 24.1);
  if (!collides(nx, p.y, p.z)) p.x = nx;
  if (!collides(p.x, p.y, nz)) p.z = nz;
  if (input.jump && p.y <= 0.001) p.vy = 6.8;
  p.vy -= 19.5 * dt;
  p.y = Math.max(0, p.y + p.vy * dt);
  if (p.y === 0) p.vy = 0;
}
export function rayBox(origin: Vec3, dir: Vec3, min: Vec3, max: Vec3): number {
  let near = 0, far = Infinity;
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(dir[axis]) < 0.00001) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return Infinity;
    } else {
      const a = (min[axis] - origin[axis]) / dir[axis], b = (max[axis] - origin[axis]) / dir[axis];
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return Infinity;
    }
  }
  return near;
}
export function wallDistance(origin: Vec3, dir: Vec3) {
  return Math.min(...BOXES.map(b => rayBox(origin, dir, { x: b.x - b.w / 2, y: 0, z: b.z - b.d / 2 }, { x: b.x + b.w / 2, y: b.h, z: b.z + b.d / 2 })));
}
function reload(p: Player, now: number) {
  if (!p.reloadUntil && p.ammo[p.weapon] < WEAPONS[p.weapon].magazine) p.reloadUntil = now + WEAPONS[p.weapon].reload;
}
function shoot(room: Room, p: Player, now: number) {
  const weapon = WEAPONS[p.weapon];
  if (p.hp <= 0 || p.reloadUntil > 0 || now < p.fireAt || room.winner) return;
  if (p.ammo[p.weapon] <= 0) { reload(p, now); return; }
  p.ammo[p.weapon]--;
  p.fireAt = now + weapon.interval;
  const origin = { x: p.x, y: p.y + EYE_HEIGHT, z: p.z };
  let displayTo: Vec3 | undefined, didHit = false, headshot = false;
  const damage = new Map<string, number>();
  for (let i = 0; i < weapon.pellets; i++) {
    const yaw = p.yaw + (Math.random() - 0.5) * weapon.spread, pitch = p.pitch + (Math.random() - 0.5) * weapon.spread;
    const dir = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
    let distance = Math.min(weapon.range, wallDistance(origin, dir));
    let target: Player | null = null;
    for (const other of Object.values(room.players)) {
      if (other.id === p.id || other.hp <= 0 || !other.ready || other.protectedUntil > now) continue;
      const hit = rayBox(origin, dir, { x: other.x - 0.38, y: other.y + 0.1, z: other.z - 0.38 }, { x: other.x + 0.38, y: other.y + 1.85, z: other.z + 0.38 });
      if (hit < distance) { distance = hit; target = other; }
    }
    const to = { x: origin.x + dir.x * distance, y: origin.y + dir.y * distance, z: origin.z + dir.z * distance };
    if (!displayTo || target) displayTo = to;
    if (target) {
      const head = to.y > target.y + 1.4;
      headshot ||= head; didHit = true;
      damage.set(target.id, (damage.get(target.id) || 0) + weapon.damage * (head ? 1.5 : 1));
    }
  }
  room.events.push({ id: crypto.randomUUID(), at: now, type: 'shot', by: p.id, weapon: p.weapon, from: origin, to: displayTo, hit: didHit, headshot });
  for (const [id, amount] of damage) {
    const target = room.players[id]; target.hp = Math.max(0, target.hp - Math.round(amount));
    if (target.hp === 0) {
      p.kills++; target.deaths++; target.respawnAt = now + 3; target.reloadUntil = 0;
      target.input = { ...EMPTY_INPUT, seq: target.seq };
      room.events.push({ id: crypto.randomUUID(), at: now, type: 'kill', by: p.id, target: id, name: p.name, victim: target.name, weapon: p.weapon, headshot });
    }
  }
}
function botInput(room: Room, p: Player, now: number): Input {
  const candidates = Object.values(room.players).filter(o => o.id !== p.id && o.hp > 0 && o.ready);
  candidates.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  const target = candidates[0];
  if (!target) return { ...EMPTY_INPUT };
  const dx = target.x - p.x, dz = target.z - p.z, distance = Math.hypot(dx, dz);
  // Roaming and strafing keep practice opponents moving around cover.
  const phase = now * 0.65 + Number(p.id.slice(-1)) * 2;
  const angle = Math.atan2(dx, dz) + Math.sin(phase) * 1.3;
  const yaw = Math.atan2(-dx, -dz) + Math.sin(now * 2 + phase) * 0.065;
  const pitch = Math.atan2(target.y - p.y - 0.25, distance);
  const direction = { x: dx / Math.max(distance, 0.1), y: 0, z: dz / Math.max(distance, 0.1) };
  const clear = wallDistance({ x: p.x, y: p.y + EYE_HEIGHT, z: p.z }, direction) > distance;
  return { ...EMPTY_INPUT, mx: Math.sin(angle) * (distance < 6 ? -0.6 : 0.65), mz: Math.cos(angle) * (distance < 6 ? -0.6 : 0.65), yaw, pitch, fire: distance < 30 && clear, reload: p.ammo[0] === 0, jump: Math.sin(phase * 3) > 0.98 };
}
export function applyInput(p: Player, raw: Partial<Input>, now: number) {
  const input = sanitizeInput(raw);
  p.lastSeen = now;
  if (input.seq <= p.seq) return;
  if (input.active && !p.ready) { p.ready = true; p.protectedUntil = now + 1.5; }
  p.seq = input.seq; p.input = input; p.yaw = input.yaw; p.pitch = input.pitch;
  if (p.weapon !== input.weapon) { p.weapon = input.weapon; p.reloadUntil = 0; p.fireAt = Math.max(p.fireAt, now + 0.15); }
}
export function advanceRoom(room: Room, now: number) {
  for (const p of Object.values(room.players)) if (!p.bot && now - p.lastSeen > 18) delete room.players[p.id];
  if (room.winner && now >= room.resetAt) {
    room.winner = null; room.resetAt = 0; room.roundEnd = now + ROUND_SECONDS; room.events = [];
    for (const p of Object.values(room.players)) { p.kills = 0; p.deaths = 0; spawn(room, p, now); }
  }
  // Bound catch-up after a suspended room; never simulate minutes of stale input.
  let t = Math.max(room.time, now - 0.3);
  while (t < now - 0.00001) {
    const dt = Math.min(1 / 30, now - t); t += dt;
    for (const p of Object.values(room.players)) {
      if (p.hp <= 0) { if (t >= p.respawnAt && !room.winner) spawn(room, p, t); continue; }
      if (room.winner || !p.ready) continue;
      if (p.bot) { p.input = botInput(room, p, t); p.yaw = p.input.yaw; p.pitch = p.input.pitch; }
      const active = p.bot || t - p.lastSeen < 0.5;
      if (active) movePlayer(p, p.input, dt);
      if (p.reloadUntil && t >= p.reloadUntil) { p.ammo[p.weapon] = WEAPONS[p.weapon].magazine; p.reloadUntil = 0; }
      if (active && p.input.reload) reload(p, t);
      if (active && p.input.fire) shoot(room, p, t);
    }
  }
  room.time = now;
  const leaders = Object.values(room.players).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  if (!room.winner && leaders.length && (now >= room.roundEnd || leaders[0].kills >= SCORE_LIMIT)) {
    room.winner = leaders[0].name; room.resetAt = now + 8;
  }
  room.events = room.events.filter(e => now - e.at < 8).slice(-70);
}
export function snapshot(room: Room): Snapshot {
  return { ...room, players: Object.fromEntries(Object.entries(room.players).map(([id, p]) => { const { token: _token, input: _input, ...publicPlayer } = p; return [id, publicPlayer]; })) };
}
