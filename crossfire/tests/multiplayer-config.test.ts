import test from 'node:test';
import assert from 'node:assert/strict';
import { multiplayerConfig, DEFAULT_COLYSEUS_URL } from '../lib/multiplayer-config.ts';

test('uses a direct Colyseus connection when configured', () => {
  assert.deepEqual(multiplayerConfig('https://game.vercel.app/api/config', 'https://matches.example/'), { transport: 'colyseus', endpoint: 'https://matches.example' });
  assert.deepEqual(multiplayerConfig('https://game.vercel.app/api/config', 'wss://matches.example'), { transport: 'colyseus', endpoint: 'wss://matches.example' });
});
test('local development uses the local server and production defaults to Sydney', () => {
  assert.deepEqual(multiplayerConfig('http://localhost:3000/api/config'), { transport: 'colyseus', endpoint: 'http://localhost:2567' });
  assert.deepEqual(multiplayerConfig('http://127.0.0.1:5173/api/config'), { transport: 'colyseus', endpoint: 'http://127.0.0.1:2567' });
  assert.deepEqual(multiplayerConfig('https://game.vercel.app/api/config'), { transport: 'colyseus', endpoint: DEFAULT_COLYSEUS_URL });
  assert.deepEqual(multiplayerConfig('https://game.vercel.app/api/config', 'legacy'), { transport: 'legacy' });
});
test('does not silently downgrade a broken or insecure configured server', () => {
  assert.throws(() => multiplayerConfig('https://game.vercel.app/api/config', 'http://matches.example'));
  assert.throws(() => multiplayerConfig('https://game.vercel.app/api/config', 'file:///server'));
  assert.throws(() => multiplayerConfig('https://game.vercel.app/api/config', 'https://user:secret@matches.example'));
});
