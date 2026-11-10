import { Client, type Room } from '@colyseus/sdk';
import type { Input, Snapshot } from './game';
import type { MultiplayerConfig } from './multiplayer-config';

type Callbacks = {
  snapshot(state: Snapshot): void;
  ping(ms: number): void;
  network(connected: boolean): void;
  closed(message: string): void;
};
export type MatchConnection = {
  id: string; code: string; transport: 'colyseus' | 'legacy'; state: Snapshot;
  start(input: () => Input): void;
  flush(): void;
  close(): void;
};
async function legacyApi(body: unknown) {
  const response = await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  const data = await response.json() as { error?: string; code: string; id: string; token: string; state: Snapshot };
  if (!response.ok) throw Object.assign(new Error(data.error || 'Unable to connect. Please try again.'), { status: response.status });
  return data;
}

async function connectLegacy(action: string, name: string, code: string, callbacks: Callbacks): Promise<MatchConnection> {
  const initial = await legacyApi({ action, name, code });
  const auth = { id: initial.id, code: initial.code, token: initial.token };
  let stopped = false, timer: ReturnType<typeof setTimeout>, getInput: () => Input;
  let lastSuccess = performance.now();
  const connection: MatchConnection = {
    id: initial.id, code: initial.code, transport: 'legacy', state: initial.state,
    start(input) { getInput = input; void sync(); },
    flush() { /* Legacy HTTP cannot send while another request is in flight. */ },
    close() { stopped = true; clearTimeout(timer); void legacyApi({ ...auth, action: 'leave' }).catch(() => {}); },
  };
  async function sync() {
    if (stopped) return;
    const at = performance.now();
    try {
      const update = await legacyApi({ ...auth, action: 'sync', input: getInput() });
      if (stopped) return;
      lastSuccess = performance.now(); connection.state = update.state;
      callbacks.ping(Math.round(lastSuccess - at)); callbacks.network(true); callbacks.snapshot(update.state);
    } catch (e) {
      if (stopped) return;
      if (e instanceof Error && 'status' in e && e.status === 401) { callbacks.closed('Your session expired. Join the room again.'); return; }
      if (performance.now() - lastSuccess > 2500) callbacks.network(false);
    }
    if (!stopped) timer = setTimeout(sync, Math.max(30, 110 - (performance.now() - at)));
  }
  return connection;
}

async function connectColyseus(endpoint: string, action: string, name: string, code: string, callbacks: Callbacks): Promise<MatchConnection> {
  const client = new Client(endpoint);
  const options = { name, mode: action === 'practice' ? 'practice' : 'online', public: action === 'quick' };
  let room: Room;
  try {
    room = action === 'join' ? await client.joinById(code.trim().toUpperCase(), { name })
      : action === 'quick' ? await client.joinOrCreate('arena', options) : await client.create('arena', options);
  } catch {
    throw new Error(action === 'join' ? 'Could not join that room. Check the code, or the room may be full.' : 'Could not connect to the game server. Please try again.');
  }
  room.reconnection.minDelay = 200; room.reconnection.maxDelay = 1000; room.reconnection.maxRetries = 8;
  room.reconnection.minUptime = 0; room.reconnection.maxEnqueuedMessages = 0;
  let stopped = false, connected = true, getInput: (() => Input) | null = null;
  let inputTimer: ReturnType<typeof setInterval> | undefined, pingTimer: ReturnType<typeof setInterval> | undefined;
  const connection: MatchConnection = {
    id: room.sessionId, code: room.roomId, transport: 'colyseus', state: null as unknown as Snapshot,
    start(input) {
      getInput = input;
      inputTimer = setInterval(() => connection.flush(), 1000 / 30);
      pingTimer = setInterval(() => { if (connected && !stopped) room.ping(ms => callbacks.ping(Math.round(ms))); }, 1000);
      connection.flush(); room.ping(ms => callbacks.ping(Math.round(ms)));
    },
    flush() { if (!stopped && connected && getInput) room.send('input', getInput()); },
    close() { stopped = true; clearInterval(inputTimer); clearInterval(pingTimer); void room.leave().catch(() => {}); },
  };
  room.onMessage<Snapshot>('snapshot', state => {
    if (stopped) return;
    connection.state = state; callbacks.snapshot(state);
  });
  room.onDrop(() => { if (!stopped) { connected = false; callbacks.network(false); } });
  room.onReconnect(() => { if (!stopped) { connected = true; callbacks.network(true); connection.flush(); } });
  room.onLeave(() => { if (!stopped) { connection.close(); callbacks.closed('Connection lost. Join the room again.'); } });
  try {
    connection.state = await room.request<undefined, Snapshot>('snapshot', undefined, { timeout: 5000 });
    return connection;
  } catch {
    connection.close(); throw new Error('The game server did not respond. Please try again.');
  }
}

export async function connectMatch(action: string, name: string, code: string, callbacks: Callbacks): Promise<MatchConnection> {
  const response = await fetch('/api/config', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('The multiplayer server is not configured correctly.');
  const config = await response.json() as MultiplayerConfig;
  return config.transport === 'colyseus' ? connectColyseus(config.endpoint, action, name, code, callbacks) : connectLegacy(action, name, code, callbacks);
}
