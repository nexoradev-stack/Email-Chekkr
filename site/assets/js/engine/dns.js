// Truvio — domain and mail-server (MX) lookups.
// In the browser we use DNS-over-HTTPS (Google Public DNS, with Cloudflare as a fallback).
// Only the domain is sent (e.g. "example.com"), never the full email address.

const PROVIDERS = [
  (name, type) => `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
  (name, type) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`
];

const RCODE_NXDOMAIN = 3;
const TYPE_MX = 15;
const TYPE_A = 1;
const TYPE_AAAA = 28;

async function queryOnce(url, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { accept: 'application/dns-json' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`DNS HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Creates a resolver that answers { status, records } for a name and record type.
 *   status: 'ok' | 'nxdomain' | 'error'
 */
export function createDohResolver({ fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  return async function resolve(name, type) {
    let lastError;
    for (const build of PROVIDERS) {
      try {
        const json = await queryOnce(build(name, type), timeoutMs, fetchImpl);
        if (json.Status === RCODE_NXDOMAIN) return { status: 'nxdomain', records: [] };
        if (json.Status !== 0) throw new Error(`DNS status ${json.Status}`);
        const wanted = type === 'MX' ? TYPE_MX : type === 'A' ? TYPE_A : TYPE_AAAA;
        const records = (json.Answer || []).filter((a) => a.type === wanted).map((a) => String(a.data));
        return { status: 'ok', records };
      } catch (error) {
        lastError = error;
      }
    }
    return { status: 'error', records: [], error: lastError ? String(lastError.message || lastError) : 'DNS lookup failed' };
  };
}

/** Parses "10 mx1.example.com." into { priority: 10, host: "mx1.example.com" }. */
export function parseMx(record) {
  const [priority, host = ''] = String(record).trim().split(/\s+/);
  return { priority: Number(priority), host: host.replace(/\.$/, '').toLowerCase() };
}

/**
 * Checks whether a domain can receive email.
 * @returns {Promise<{ result: 'mx' | 'a-fallback' | 'null-mx' | 'no-mail' | 'nxdomain' | 'error', mx: string[] }>}
 */
export async function checkMailDomain(domain, resolve) {
  const mx = await resolve(domain, 'MX');
  if (mx.status === 'nxdomain') return { result: 'nxdomain', mx: [] };
  if (mx.status === 'error') return { result: 'error', mx: [] };

  const hosts = mx.records.map(parseMx).sort((a, b) => a.priority - b.priority);
  // RFC 7505 "null MX": the domain says it never accepts mail
  if (hosts.length === 1 && (hosts[0].host === '' || hosts[0].host === '.')) return { result: 'null-mx', mx: [] };
  if (hosts.length > 0) return { result: 'mx', mx: hosts.map((h) => h.host).filter(Boolean) };

  // No MX: mail servers fall back to the domain's address (A/AAAA) record
  const a = await resolve(domain, 'A');
  if (a.status === 'ok' && a.records.length) return { result: 'a-fallback', mx: [] };
  const aaaa = await resolve(domain, 'AAAA');
  if (aaaa.status === 'ok' && aaaa.records.length) return { result: 'a-fallback', mx: [] };
  if (a.status === 'nxdomain' && aaaa.status === 'nxdomain') return { result: 'nxdomain', mx: [] };
  if (a.status === 'error' && aaaa.status === 'error') return { result: 'error', mx: [] };
  return { result: 'no-mail', mx: [] };
}
