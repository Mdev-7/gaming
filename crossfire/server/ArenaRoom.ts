import { Room, type Client } from '@colyseus/core';
import { addPlayer, addPracticeBots, advanceRoom, applyInput, EMPTY_INPUT, newRoom, snapshot, type Room as GameRoom, type Input } from '../lib/game.js';

export const SIMULATION_HZ = 60;
export const SNAPSHOT_HZ = 30;
export type JoinOptions = { name?: string; mode?: string; public?: boolean };

export class ArenaRoom extends Room {
  game!: GameRoom;
  private elapsed = 0;
  private snapshotElapsed = 0;
  private latches = new Map<string, { fire: boolean; jump: boolean; reload: boolean }>();
  private rate = new Map<string, { at: number; count: number }>();

  onCreate(options: JoinOptions) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    this.roomId = Array.from(crypto.getRandomValues(new Uint8Array(6)), n => alphabet[n % alphabet.length]).join('');
    const practice = options.mode === 'practice';
    this.game = newRoom(this.roomId, Date.now() / 1000, practice);
    if (practice) addPracticeBots(this.game, this.game.time);
    this.maxClients = practice ? 5 : 8;
    this.maxMessagesPerSecond = 120;
    this.setPrivate(options.public !== true || practice);
    this.setMetadata({ mode: this.game.mode, public: options.public === true && !practice });
    this.onMessage('input', (client, raw: unknown) => this.input(client, raw));
    this.onMessage('snapshot', () => this.wireSnapshot());
    this.setSimulationInterval(dt => this.tick(dt), 1000 / SIMULATION_HZ);
  }

  onJoin(client: Client, options: JoinOptions) {
    addPlayer(this.game, client.sessionId, crypto.randomUUID(), options.name || 'Rookie', this.game.time);
    client.send('snapshot', this.wireSnapshot());
  }

  private input(client: Client, raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const p = this.game.players[client.sessionId];
    if (!p) return;
    const now = performance.now();
    let limit = this.rate.get(client.sessionId);
    if (!limit || now - limit.at > 1000) { limit = { at: now, count: 0 }; this.rate.set(client.sessionId, limit); }
    if (++limit.count > 100) return;
    const previous = p.seq;
    applyInput(p, raw as Partial<Input>, this.game.time);
    if (p.seq <= previous) return;
    // Preserve brief button presses that arrive between two simulation ticks.
    const latch = this.latches.get(client.sessionId) || { fire: false, jump: false, reload: false };
    latch.fire ||= p.input.fire; latch.jump ||= p.input.jump; latch.reload ||= p.input.reload;
    this.latches.set(client.sessionId, latch);
  }

  private tick(milliseconds: number) {
    this.elapsed += Math.min(milliseconds, 250);
    const step = 1000 / SIMULATION_HZ;
    while (this.elapsed >= step) {
      const restore = new Map<string, Input>();
      for (const [id, latch] of this.latches) {
        const p = this.game.players[id];
        if (!p) continue;
        restore.set(id, p.input);
        p.input = { ...p.input, fire: p.input.fire || latch.fire, jump: p.input.jump || latch.jump, reload: p.input.reload || latch.reload };
      }
      advanceRoom(this.game, this.game.time + 1 / SIMULATION_HZ);
      for (const [id, input] of restore) {
        const p = this.game.players[id];
        if (p && p.hp > 0) p.input = input;
      }
      this.latches.clear();
      this.elapsed -= step;
      this.snapshotElapsed += step;
      if (this.snapshotElapsed >= 1000 / SNAPSHOT_HZ - 0.001) {
        this.broadcast('snapshot', this.wireSnapshot());
        this.snapshotElapsed = 0;
      }
    }
  }

  private wireSnapshot() {
    const state = snapshot(this.game);
    state.events = state.events.filter(e => e.type !== 'shot' || state.time - e.at < 0.25);
    return state;
  }

  async onDrop(client: Client) {
    const p = this.game.players[client.sessionId];
    if (p) { p.input = { ...EMPTY_INPUT, seq: p.seq, weapon: p.weapon }; p.ready = false; }
    this.latches.delete(client.sessionId);
    try { await this.allowReconnection(client, 10); } catch { /* onLeave removes the expired session */ }
  }

  onReconnect(client: Client) {
    const p = this.game.players[client.sessionId];
    if (p) { p.lastSeen = this.game.time; p.protectedUntil = this.game.time + 1.5; }
    client.send('snapshot', this.wireSnapshot());
  }

  onLeave(client: Client) {
    delete this.game.players[client.sessionId];
    this.latches.delete(client.sessionId); this.rate.delete(client.sessionId);
  }
}
