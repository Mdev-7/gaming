export type MultiplayerConfig = { transport: 'colyseus'; endpoint: string } | { transport: 'legacy' };
export const DEFAULT_COLYSEUS_URL = 'https://crossfire-colyseus-mdev7.fly.dev';

export function multiplayerConfig(requestUrl: string, configured?: string): MultiplayerConfig {
  const page = new URL(requestUrl);
  if (configured?.trim() === 'legacy') return { transport: 'legacy' };
  if (!configured?.trim() && ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname)) return { transport: 'colyseus', endpoint: 'http://' + page.hostname + ':2567' };
  {
    const endpoint = new URL(configured?.trim() || DEFAULT_COLYSEUS_URL);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Invalid Colyseus endpoint');
    if (page.protocol === 'https:' && !['https:', 'wss:'].includes(endpoint.protocol)) throw new Error('An HTTPS site needs a secure Colyseus endpoint');
    return { transport: 'colyseus', endpoint: endpoint.toString().replace(/\/$/, '') };
  }
}
