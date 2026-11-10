#!/usr/bin/env node
// Truvio — MCP server over stdin/stdout, for AI apps on your own computer (Claude Desktop, Cursor, Claude Code).
// Run: npm run mcp     (one JSON-RPC message per line; logs go to stderr)

import { createInterface } from 'node:readline';
import { loadConfig } from './config.js';
import { createMcpHandler } from './mcp.js';
import { buildService, jsonLog } from './runtime.js';

const config = loadConfig();
const { service } = await buildService(config);
const handle = createMcpHandler({ service, batchMax: config.limits.keyBatchMax });

const write = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

const pending = new Set();

async function processLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  const batch = Array.isArray(message) ? message : [message];
  const replies = (await Promise.all(batch.map((m) => handle(m)))).filter(Boolean);
  if (replies.length) write(Array.isArray(message) ? replies : replies[0]);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const job = processLine(line).finally(() => pending.delete(job));
  pending.add(job);
});
// Finish any checks still running before exiting
rl.on('close', async () => {
  await Promise.all(pending);
  process.exit(0);
});

jsonLog({ level: 'info', msg: 'Truvio MCP server ready on stdio' });
