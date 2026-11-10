import test from 'node:test';
import assert from 'node:assert/strict';
import { forwardGameRequest } from '../lib/game-proxy.ts';

const request = (body: string, headers: Record<string, string> = {}) => new Request('https://game.vercel.app/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });

test('forwards game input and authentication errors without forwarding browser credentials', async () => {
  let called = false;
  const body = JSON.stringify({ action: 'sync', code: 'ABCDEF', token: 'player-session' });
  const fetcher: typeof fetch = async (url, init) => {
    called = true;
    assert.equal(String(url), 'https://matches.example/api/game');
    assert.equal(init?.method, 'POST'); assert.equal(init?.body, body);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('cookie'), null); assert.equal(headers.get('origin'), null);
    assert.equal(headers.get('authorization'), null); assert.equal(init?.cache, 'no-store');
    return Response.json({ error: 'Session expired' }, { status: 401, headers: { 'Set-Cookie': 'upstream=hidden' } });
  };
  const response = await forwardGameRequest(request(body, { origin: 'https://game.vercel.app', cookie: 'private=cookie', authorization: 'private-token' }), 'https://matches.example', fetcher);
  assert.equal(called, true); assert.equal(response.status, 401);
  assert.equal(response.headers.get('set-cookie'), null); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'Session expired' });
});

test('rejects cross-origin requests, oversized payloads, and proxy loops before fetching', async () => {
  const neverFetch: typeof fetch = async () => { throw new Error('must not fetch'); };
  assert.equal((await forwardGameRequest(request('{}', { origin: 'https://another.example' }), 'https://matches.example', neverFetch)).status, 403);
  assert.equal((await forwardGameRequest(request('x'.repeat(4097)), 'https://matches.example', neverFetch)).status, 413);
  assert.equal((await forwardGameRequest(request('{}'), 'https://game.vercel.app', neverFetch)).status, 503);
});

test('returns a controlled error when the backend is offline or serves an HTML sign-in page', async () => {
  const unavailable: typeof fetch = async () => { throw new TypeError('network failure'); };
  const html: typeof fetch = async () => new Response('<html>sign in</html>', { headers: { 'Content-Type': 'text/html' } });
  for (const fetcher of [unavailable, html]) {
    const response = await forwardGameRequest(request('{}'), 'https://matches.example', fetcher);
    assert.equal(response.status, 503); assert.match(response.headers.get('content-type') || '', /application\/json/);
  }
});

test('forwards health requests without a body', async () => {
  const fetcher: typeof fetch = async (_url, init) => {
    assert.equal(init?.method, 'GET'); assert.equal(init?.body, undefined);
    return Response.json({ service: 'Crossfire Arena', maxPlayers: 8 });
  };
  const response = await forwardGameRequest(new Request('https://game.vercel.app/api/game'), 'https://matches.example', fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { service: 'Crossfire Arena', maxPlayers: 8 });
});
