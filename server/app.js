// Email Chekkr API — HTTP routes. Built on Node's own http module (no framework needed).
//
//   GET  /                  short description and links
//   GET  /health            for the host's health checks
//   GET  /version
//   GET  /v1/verify?email=  check one address
//   POST /v1/verify         { "email": "..." }
//   POST /v1/verify/batch   { "emails": ["...", "..."] }
//   GET  /v1/domain?domain= check a domain
//   POST /mcp               MCP for AI tools (needs an API key)
//
// Without an API key: 30 requests a minute per IP address, 50 emails per batch.
// With an API key:   120 requests a minute per key, 500 emails per batch.
// (All limits can be changed with environment variables; see config.js.)

import { createHash, timingSafeEqual } from 'node:crypto';
import { createRateLimiter } from './rate-limit.js';
import { createMcpHandler, SERVER_INFO } from './mcp.js';

const JSON_TYPE = 'application/json; charset=utf-8';

class HttpError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

const sha256 = (value) => createHash('sha256').update(String(value)).digest();

/** Compares a key against the allowed keys without leaking timing information. */
function makeKeyChecker(keys) {
  const hashed = [...keys].map(sha256);
  return (candidate) => {
    const c = sha256(candidate);
    let ok = false;
    for (const h of hashed) ok = timingSafeEqual(c, h) || ok;
    return ok;
  };
}

function readApiKey(req) {
  const auth = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (match) return match[1].trim();
  const header = req.headers['x-api-key'];
  return typeof header === 'string' && header.trim() ? header.trim() : null;
}

function clientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // The last entry is the one added by the host's own proxy, so it can't be faked by the caller
    if (forwarded.length) return forwarded[forwarded.length - 1];
  }
  return req.socket?.remoteAddress || 'unknown';
}

async function readJson(req, maxBytes) {
  const type = String(req.headers['content-type'] || '');
  if (!/^application\/json\b/i.test(type)) {
    throw new HttpError(415, 'unsupported_media_type', 'Send the body as JSON with "Content-Type: application/json".');
  }
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > maxBytes) throw new HttpError(413, 'body_too_large', `The body is larger than ${maxBytes} bytes.`);

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'body_too_large', `The body is larger than ${maxBytes} bytes.`);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
  } catch {
    throw new HttpError(400, 'invalid_json', 'The body is not valid JSON.');
  }
}

/**
 * @param {{ config: ReturnType<import('./config.js').loadConfig>, service: ReturnType<import('./service.js').createService>,
 *           log?: (line: object) => void, now?: () => number }} deps
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createApp({ config, service, log = () => {}, now = Date.now }) {
  const { limits } = config;
  const limiter = createRateLimiter({ windowMs: limits.windowMs, now });
  const isValidKey = makeKeyChecker(config.apiKeys);
  const anyOrigin = config.corsOrigins.includes('*');
  const mcp = createMcpHandler({ service, batchMax: limits.keyBatchMax });

  function setCors(req, res) {
    const origin = req.headers.origin;
    if (!origin) return;
    if (anyOrigin || config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', anyOrigin ? '*' : origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, Mcp-Protocol-Version');
      res.setHeader('Access-Control-Expose-Headers', 'RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    res.setHeader('Vary', 'Origin');
  }

  function send(res, status, body, headers = {}) {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    if (status === 204 || status === 202 || body === undefined) {
      res.writeHead(status);
      res.end();
      return;
    }
    res.writeHead(status, { 'Content-Type': JSON_TYPE });
    res.end(JSON.stringify(body));
  }

  /** Works out who is calling and applies their rate limit. */
  function admit(req, res, { requireKey = false } = {}) {
    const key = readApiKey(req);
    let tier = 'public';
    if (key !== null) {
      if (!isValidKey(key)) throw new HttpError(401, 'invalid_api_key', 'The API key is not valid.');
      tier = 'key';
    } else if (requireKey || !config.publicAccess) {
      throw new HttpError(401, 'api_key_required', 'An API key is required. Send it as "Authorization: Bearer <key>".');
    }

    const bucket = tier === 'key' ? `key:${sha256(key).toString('hex').slice(0, 24)}` : `ip:${clientIp(req, config.trustProxy)}`;
    const limit = tier === 'key' ? limits.keyPerWindow : limits.publicPerWindow;
    const r = limiter.hit(bucket, limit);
    res.setHeader('RateLimit-Limit', String(r.limit));
    res.setHeader('RateLimit-Remaining', String(r.remaining));
    res.setHeader('RateLimit-Reset', String(r.resetSeconds));
    if (!r.allowed) {
      throw new HttpError(429, 'rate_limited', `Too many requests. Try again in ${r.resetSeconds} seconds.`, {
        'Retry-After': String(r.resetSeconds)
      });
    }
    return { tier, batchMax: tier === 'key' ? limits.keyBatchMax : limits.publicBatchMax };
  }

  function requireString(value, field) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new HttpError(400, 'invalid_input', `"${field}" is required and must be text.`);
    }
    if (value.length > 1000) throw new HttpError(400, 'invalid_input', `"${field}" is too long.`);
    return value;
  }

  async function route(req, res, url) {
    const { pathname } = url;
    const method = req.method;

    if (method === 'OPTIONS') return send(res, 204);

    if (pathname === '/' && method === 'GET') {
      return send(res, 200, {
        name: SERVER_INFO.title,
        version: SERVER_INFO.version,
        docs: 'https://nexoradev-stack.github.io/Email Chekkr-Email-verification/api.html',
        endpoints: ['GET /v1/verify?email=', 'POST /v1/verify', 'POST /v1/verify/batch', 'GET /v1/domain?domain=', 'POST /mcp']
      });
    }
    if (pathname === '/health' && method === 'GET') return send(res, 200, { status: 'ok' });
    if (pathname === '/version' && method === 'GET') return send(res, 200, { name: SERVER_INFO.name, version: SERVER_INFO.version });

    if (pathname === '/v1/verify' && (method === 'GET' || method === 'POST')) {
      admit(req, res);
      const email = method === 'GET' ? url.searchParams.get('email') : (await readJson(req, limits.maxBodyBytes))?.email;
      return send(res, 200, await service.verifyEmail(requireString(email, 'email')));
    }

    if (pathname === '/v1/verify/batch' && method === 'POST') {
      const { batchMax } = admit(req, res);
      const body = await readJson(req, limits.maxBodyBytes);
      const emails = body?.emails;
      if (!Array.isArray(emails) || emails.length === 0) {
        throw new HttpError(400, 'invalid_input', '"emails" must be a non-empty list.');
      }
      if (emails.length > batchMax) {
        throw new HttpError(400, 'batch_too_large', `At most ${batchMax} emails per batch${batchMax === limits.publicBatchMax ? ' without an API key' : ''}.`);
      }
      emails.forEach((e, i) => requireString(e, `emails[${i}]`));
      return send(res, 200, await service.verifyEmails(emails));
    }

    if (pathname === '/v1/domain' && method === 'GET') {
      admit(req, res);
      return send(res, 200, await service.checkDomain(requireString(url.searchParams.get('domain'), 'domain')));
    }

    if (pathname === '/mcp') {
      if (method !== 'POST') {
        // This server answers each MCP request directly; it doesn't open a stream
        return send(res, 405, { error: { code: 'method_not_allowed', message: 'Use POST for MCP requests.' } }, { Allow: 'POST' });
      }
      if (config.apiKeys.size === 0) {
        throw new HttpError(503, 'mcp_disabled', 'MCP over HTTP needs at least one API key (set EMAIL_CHEKKR_API_KEYS).');
      }
      admit(req, res, { requireKey: true });
      const body = await readJson(req, limits.maxBodyBytes);
      const messages = Array.isArray(body) ? body : [body];
      const replies = (await Promise.all(messages.map((m) => mcp(m)))).filter(Boolean);
      if (replies.length === 0) return send(res, 202);
      return send(res, 200, Array.isArray(body) ? replies : replies[0]);
    }

    throw new HttpError(404, 'not_found', 'There is nothing at this address. See GET / for the endpoints.');
  }

  return async function handler(req, res) {
    const started = now();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    setCors(req, res);

    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      url = new URL('http://localhost/');
    }

    try {
      await route(req, res, url);
    } catch (error) {
      if (error instanceof HttpError) {
        send(res, error.status, { error: { code: error.code, message: error.message } }, error.headers);
      } else {
        log({ level: 'error', msg: 'unhandled', error: String(error?.stack || error) });
        send(res, 500, { error: { code: 'internal_error', message: 'Something went wrong. Try again.' } });
      }
    } finally {
      // Logs the path only — never the query string or body, so email addresses are never logged
      log({ level: 'info', method: req.method, path: url.pathname, status: res.statusCode, ms: now() - started });
    }
  };
}
