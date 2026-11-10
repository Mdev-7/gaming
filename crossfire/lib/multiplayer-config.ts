export type MultiplayerConfig = { transport: 'colyseus'; endpoint: string } | { transport: 'legacy' };

export function multiplayerConfig(requestUrl: string, configured?: string): MultiplayerConfig {
  const page = new URL(requestUrl);
  if (configured?.trim()) {
    const endpoint = new URL(configured.trim());
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Invalid Colyseus endpoint');
    if (page.protocol === 'https:' && !['https:', 'wss:'].includes(endpoint.protocol)) throw new Error('An HTTPS site needs a secure Colyseus endpoint');
    return { transport: 'colyseus', endpoint: endpoint.toString().replace(/\/$/, '') };
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(page.hostname)) return { transport: 'colyseus', endpoint: 'http://' + page.hostname + ':2567' };
  // Keep existing deployments playable until the new server URL is configured.
  return { transport: 'legacy' };
}
