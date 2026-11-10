import { createGameServer } from './server.js';

const port = Number(process.env.PORT || 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
const server = createGameServer();
await server.listen(port, '0.0.0.0');
console.log('Crossfire Colyseus listening on port ' + port + ' (60 Hz simulation / 30 Hz snapshots)');
