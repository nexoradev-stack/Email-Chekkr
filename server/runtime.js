// Email Chekkr API — wires the pieces together (shared by the HTTP server and the stdio MCP server).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseDomainList } from '../site/assets/js/engine/verify.js';
import { createNodeResolver } from './node-dns.js';
import { createService } from './service.js';

const DEFAULT_DISPOSABLE = fileURLToPath(new URL('../site/assets/data/disposable-domains.txt', import.meta.url));
const DEFAULT_FREE = fileURLToPath(new URL('../site/assets/data/free-providers.txt', import.meta.url));

/** Loads the disposable and free-provider lists and builds the service. */
export async function buildService(config) {
  const disposable = parseDomainList(await readFile(config.disposablePath || DEFAULT_DISPOSABLE, 'utf8'));
  const freeProviders = parseDomainList(await readFile(config.freeProvidersPath || DEFAULT_FREE, 'utf8'));
  const resolve = createNodeResolver(config.dns);
  const service = createService({
    resolve,
    disposable,
    freeProviders,
    csvMaxRows: config.limits.csvMaxRows,
    concurrency: config.concurrency,
    cacheTtlMs: config.dns.cacheTtlMs,
    cacheMax: config.dns.cacheMax
  });
  return { service, disposableCount: disposable.size, freeProviderCount: freeProviders.size };
}

/** One JSON line per log entry, to stderr (stdout is kept free for the stdio MCP server). */
export function jsonLog(entry) {
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);
}
