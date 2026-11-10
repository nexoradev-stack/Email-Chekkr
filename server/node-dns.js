// Truvio API — domain lookups with Node's built-in DNS module (no third-party service).
// Returns the same { status, records } shape as the browser's DNS-over-HTTPS resolver,
// so the shared engine (site/assets/js/engine) works unchanged on the server.

import { promises as dnsPromises } from 'node:dns';

// Error codes that mean "the name exists but has no records of this type"
const NO_DATA = new Set(['ENODATA']);
// Error codes that mean "the domain does not exist"
const NOT_FOUND = new Set(['ENOTFOUND']);

/**
 * @param {{ timeoutMs?: number, tries?: number, servers?: string[], Resolver?: any }} options
 * @returns {(name: string, type: 'MX'|'A'|'AAAA') => Promise<{ status: 'ok'|'nxdomain'|'error', records: string[], error?: string }>}
 */
export function createNodeResolver({ timeoutMs = 5000, tries = 2, servers = [], Resolver = dnsPromises.Resolver } = {}) {
  const resolver = new Resolver({ timeout: timeoutMs, tries });
  if (servers.length) resolver.setServers(servers);

  return async function resolve(name, type) {
    try {
      if (type === 'MX') {
        const rows = await resolver.resolveMx(name);
        // "10 mx1.example.com" — an empty exchange is a null MX (RFC 7505)
        return { status: 'ok', records: rows.map((r) => `${r.priority} ${r.exchange || '.'}`) };
      }
      const rows = type === 'A' ? await resolver.resolve4(name) : await resolver.resolve6(name);
      return { status: 'ok', records: rows.map(String) };
    } catch (error) {
      const code = error?.code;
      if (NO_DATA.has(code)) return { status: 'ok', records: [] };
      if (NOT_FOUND.has(code)) return { status: 'nxdomain', records: [] };
      return { status: 'error', records: [], error: code || String(error?.message || error) };
    }
  };
}
