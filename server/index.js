#!/usr/bin/env node
// Truvio API — starts the HTTP server.  Run: npm start

import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { buildService, jsonLog } from './runtime.js';

const config = loadConfig();
const { service, disposableCount } = await buildService(config);
const app = createApp({ config, service, log: jsonLog });

const server = createServer(app);
server.requestTimeout = 120_000;
server.headersTimeout = 20_000;
server.keepAliveTimeout = 65_000;

server.listen(config.port, config.host, () => {
  const { port } = server.address();
  jsonLog({
    level: 'info',
    msg: 'Truvio API started',
    url: `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${port}`,
    disposable_domains: disposableCount,
    api_keys: config.apiKeys.size,
    public_access: config.publicAccess
  });
});

function shutdown(signal) {
  jsonLog({ level: 'info', msg: `Received ${signal}, shutting down` });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
