const DEFAULT_GAME_SERVER = 'https://crossfire-arena-mateo.mbarroso243620.chatgpt.site';
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function forwardGameRequest(request: Request, server: string, fetcher: typeof fetch = fetch) {
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== new URL(request.url).host) return fail('Cross-origin requests are not supported.', 403);
    const upstream = new URL('/api/game', server);
    if (!['http:', 'https:'].includes(upstream.protocol) || upstream.host === new URL(request.url).host) return fail('The match server URL is not configured correctly.', 503);
    if (Number(request.headers.get('content-length') || 0) > 4096) return fail('Request too large.', 413);
    const body = request.method === 'GET' ? undefined : await request.text();
    if (body && body.length > 4096) return fail('Request too large.', 413);
    const response = await fetcher(upstream, {
      method: request.method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(6000)]),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) return fail('The match server is unavailable. Please try again.', 503);
    return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return fail('Could not reach the match server. Please try again.', 503);
  }
}

export function proxyGameRequest(request: Request) {
  return forwardGameRequest(request, process.env.CROSSFIRE_GAME_SERVER_URL || DEFAULT_GAME_SERVER);
}
