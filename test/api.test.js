// Tests for the Truvio API and MCP server. DNS is faked, so no network is needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { createService } from '../server/service.js';
import { createMcpHandler } from '../server/mcp.js';
import { createRateLimiter } from '../server/rate-limit.js';
import { createNodeResolver } from '../server/node-dns.js';

const ZONES = {
  'acmecorp.com': { MX: ['10 mx1.acmecorp.com', '20 mx2.acmecorp.com'] },
  'gmail.com': { MX: ['5 gmail-smtp-in.l.google.com'] },
  'mailinator.com': { MX: ['10 mail.mailinator.com'] },
  'nomail.example': { MX: ['0 .'] }
};

function fakeResolve(name, type) {
  if (name === 'slow.example') return Promise.resolve({ status: 'error', records: [] });
  const zone = ZONES[name];
  if (!zone) return Promise.resolve({ status: 'nxdomain', records: [] });
  return Promise.resolve({ status: 'ok', records: zone[type] || [] });
}

const KEY = 'test-key-123';

async function startApi(env = {}) {
  const config = loadConfig({ TRUVIO_API_KEYS: KEY, TRUVIO_CORS_ORIGINS: 'https://allowed.example', ...env });
  const service = createService({ resolve: fakeResolve, disposable: new Set(['mailinator.com']) });
  const server = createServer(createApp({ config, service }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    close: () => new Promise((r) => server.close(r)),
    get: (path, headers = {}) => fetch(base + path, { headers }),
    post: (path, body, headers = {}) =>
      fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  };
}

test('config: defaults and parsing', () => {
  const c = loadConfig({});
  assert.equal(c.port, 8787);
  assert.equal(c.limits.publicPerWindow, 30);
  assert.equal(c.limits.publicBatchMax, 50);
  assert.equal(c.limits.keyPerWindow, 120);
  assert.equal(c.limits.keyBatchMax, 500);
  assert.equal(c.publicAccess, true);
  const d = loadConfig({ PORT: '9000', TRUVIO_API_KEYS: 'a, b ,', TRUVIO_PUBLIC_ACCESS: 'false', TRUVIO_KEY_BATCH_MAX: '99999' });
  assert.equal(d.port, 9000);
  assert.deepEqual([...d.apiKeys], ['a', 'b']);
  assert.equal(d.publicAccess, false);
  assert.equal(d.limits.keyBatchMax, 1000);
});

test('rate limiter: blocks after the limit and resets after the window', () => {
  let t = 0;
  const rl = createRateLimiter({ windowMs: 1000, now: () => t });
  assert.equal(rl.hit('a', 2).allowed, true);
  assert.equal(rl.hit('a', 2).allowed, true);
  const third = rl.hit('a', 2);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
  assert.equal(rl.hit('b', 2).allowed, true);
  t = 1001;
  assert.equal(rl.hit('a', 2).allowed, true);
});

test('node resolver: maps answers and errors', async () => {
  class FakeResolver {
    setServers() {}
    async resolveMx(name) {
      if (name === 'null.example') return [{ priority: 0, exchange: '' }];
      if (name === 'none.example') throw Object.assign(new Error('x'), { code: 'ENOTFOUND' });
      if (name === 'nodata.example') throw Object.assign(new Error('x'), { code: 'ENODATA' });
      if (name === 'fail.example') throw Object.assign(new Error('x'), { code: 'ETIMEOUT' });
      return [{ priority: 10, exchange: 'mx.acme.com' }];
    }
    async resolve4() { return ['1.2.3.4']; }
    async resolve6() { return []; }
  }
  const resolve = createNodeResolver({ Resolver: FakeResolver, servers: ['1.1.1.1'] });
  assert.deepEqual(await resolve('acme.com', 'MX'), { status: 'ok', records: ['10 mx.acme.com'] });
  assert.deepEqual(await resolve('null.example', 'MX'), { status: 'ok', records: ['0 .'] });
  assert.equal((await resolve('none.example', 'MX')).status, 'nxdomain');
  assert.deepEqual(await resolve('nodata.example', 'MX'), { status: 'ok', records: [] });
  assert.equal((await resolve('fail.example', 'MX')).status, 'error');
  assert.deepEqual(await resolve('acme.com', 'A'), { status: 'ok', records: ['1.2.3.4'] });
});

test('service: domain check', async () => {
  const service = createService({ resolve: fakeResolve, disposable: new Set(['mailinator.com']) });
  const acme = await service.checkDomain('jane@AcmeCorp.com');
  assert.equal(acme.domain, 'acmecorp.com');
  assert.equal(acme.accepts_email, true);
  assert.deepEqual(acme.mx, ['mx1.acmecorp.com', 'mx2.acmecorp.com']);
  assert.equal((await service.checkDomain('mailinator.com')).disposable, true);
  assert.equal((await service.checkDomain('gmail.com')).free_provider, true);
  assert.equal((await service.checkDomain('nomail.example')).mail, 'null-mx');
  assert.equal((await service.checkDomain('not a domain')).valid_format, false);
});

test('API: health, version, home and 404', async () => {
  const api = await startApi();
  try {
    assert.deepEqual(await (await api.get('/health')).json(), { status: 'ok' });
    assert.equal((await (await api.get('/version')).json()).name, 'truvio');
    assert.ok((await (await api.get('/')).json()).endpoints.length >= 4);
    const missing = await api.get('/nope');
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'not_found');
  } finally {
    await api.close();
  }
});

test('API: verify one email (GET and POST)', async () => {
  const api = await startApi();
  try {
    const res = await api.get('/v1/verify?email=' + encodeURIComponent('jane@acmecorp.com'));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('ratelimit-limit'), '30');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.json();
    assert.equal(body.status, 'valid');
    assert.equal(body.score, 95);

    const typo = await (await api.post('/v1/verify', { email: 'sam@gmial.com' })).json();
    assert.equal(typo.suggestion, 'sam@gmail.com');

    const missing = await api.post('/v1/verify', {});
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).error.code, 'invalid_input');
  } finally {
    await api.close();
  }
});

test('API: batch keeps order, counts statuses and applies limits', async () => {
  const api = await startApi();
  try {
    const emails = ['jane@acmecorp.com', 'bad@@x', 'temp@mailinator.com', 'x@slow.example'];
    const body = await (await api.post('/v1/verify/batch', { emails })).json();
    assert.deepEqual(body.results.map((r) => r.status), ['valid', 'invalid', 'risky', 'unknown']);
    assert.deepEqual(body.summary, { total: 4, valid: 1, risky: 1, invalid: 1, unknown: 1 });

    const tooMany = Array.from({ length: 51 }, (_, i) => `u${i}@acmecorp.com`);
    const blocked = await api.post('/v1/verify/batch', { emails: tooMany });
    assert.equal(blocked.status, 400);
    assert.equal((await blocked.json()).error.code, 'batch_too_large');

    const withKey = await api.post('/v1/verify/batch', { emails: tooMany }, { authorization: `Bearer ${KEY}` });
    assert.equal(withKey.status, 200);
    assert.equal(withKey.headers.get('ratelimit-limit'), '120');
    assert.equal((await withKey.json()).summary.valid, 51);

    const notList = await api.post('/v1/verify/batch', { emails: 'a@b.com' });
    assert.equal(notList.status, 400);
  } finally {
    await api.close();
  }
});

test('API: domain endpoint', async () => {
  const api = await startApi();
  try {
    const body = await (await api.get('/v1/domain?domain=acmecorp.com')).json();
    assert.equal(body.accepts_email, true);
    assert.equal((await api.get('/v1/domain')).status, 400);
  } finally {
    await api.close();
  }
});

test('API: keys, public access switch and bad requests', async () => {
  const api = await startApi({ TRUVIO_PUBLIC_ACCESS: 'false' });
  try {
    const noKey = await api.get('/v1/verify?email=a@acmecorp.com');
    assert.equal(noKey.status, 401);
    assert.equal((await noKey.json()).error.code, 'api_key_required');
    const wrongKey = await api.get('/v1/verify?email=a@acmecorp.com', { 'x-api-key': 'wrong' });
    assert.equal(wrongKey.status, 401);
    assert.equal((await wrongKey.json()).error.code, 'invalid_api_key');
    const ok = await api.get('/v1/verify?email=a@acmecorp.com', { 'x-api-key': KEY });
    assert.equal(ok.status, 200);

    const notJson = await fetch(api.base + '/v1/verify', { method: 'POST', headers: { 'x-api-key': KEY, 'content-type': 'text/plain' }, body: 'a' });
    assert.equal(notJson.status, 415);
    const broken = await fetch(api.base + '/v1/verify', { method: 'POST', headers: { 'x-api-key': KEY, 'content-type': 'application/json' }, body: '{' });
    assert.equal(broken.status, 400);
    assert.equal((await broken.json()).error.code, 'invalid_json');
  } finally {
    await api.close();
  }
});

test('API: rate limit returns 429 with Retry-After', async () => {
  const api = await startApi({ TRUVIO_PUBLIC_RATE_LIMIT: '2' });
  try {
    await api.get('/v1/verify?email=a@acmecorp.com');
    await api.get('/v1/verify?email=a@acmecorp.com');
    const third = await api.get('/v1/verify?email=a@acmecorp.com');
    assert.equal(third.status, 429);
    assert.ok(Number(third.headers.get('retry-after')) >= 1);
    assert.equal((await third.json()).error.code, 'rate_limited');
    // Health checks are never rate limited
    assert.equal((await api.get('/health')).status, 200);
  } finally {
    await api.close();
  }
});

test('API: CORS only for allowed sites', async () => {
  const api = await startApi();
  try {
    const allowed = await fetch(api.base + '/v1/verify', { method: 'OPTIONS', headers: { origin: 'https://allowed.example' } });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://allowed.example');
    const other = await api.get('/health', { origin: 'https://evil.example' });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
  } finally {
    await api.close();
  }
});

test('MCP handler: initialize, list tools, call tools, errors', async () => {
  const service = createService({ resolve: fakeResolve, disposable: new Set(['mailinator.com']) });
  const handle = createMcpHandler({ service, batchMax: 3 });

  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.equal(init.result.serverInfo.name, 'truvio');
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);

  const list = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map((t) => t.name), ['verify_email', 'verify_emails_batch', 'check_domain']);

  const one = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'verify_email', arguments: { email: 'jane@acmecorp.com' } } });
  assert.equal(one.result.structuredContent.status, 'valid');
  assert.equal(one.result.isError, false);
  assert.match(one.result.content[0].text, /"status": "valid"/);

  const batch = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'verify_emails_batch', arguments: { emails: ['a@acmecorp.com', 'b@mailinator.com'] } } });
  assert.equal(batch.result.structuredContent.summary.risky, 1);

  const tooBig = await handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'verify_emails_batch', arguments: { emails: ['a@a.com', 'b@b.com', 'c@c.com', 'd@d.com'] } } });
  assert.equal(tooBig.result.isError, true);

  const domain = await handle({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'check_domain', arguments: { domain: 'mailinator.com' } } });
  assert.equal(domain.result.structuredContent.disposable, true);

  assert.equal((await handle({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'nope' } })).error.code, -32602);
  assert.equal((await handle({ jsonrpc: '2.0', id: 8, method: 'nope' })).error.code, -32601);
  assert.equal((await handle({ id: 9 })).error.code, -32600);
  assert.deepEqual((await handle({ jsonrpc: '2.0', id: 10, method: 'ping' })).result, {});
});

test('API: MCP over HTTP needs a key', async () => {
  const api = await startApi();
  try {
    const msg = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
    assert.equal((await api.post('/mcp', msg)).status, 401);
    const ok = await api.post('/mcp', msg, { authorization: `Bearer ${KEY}` });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).result.tools.length, 3);
    const note = await api.post('/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' }, { authorization: `Bearer ${KEY}` });
    assert.equal(note.status, 202);
    assert.equal((await api.get('/mcp')).status, 405);
  } finally {
    await api.close();
  }

  const noKeys = await startApi({ TRUVIO_API_KEYS: '' });
  try {
    assert.equal((await noKeys.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' })).status, 503);
  } finally {
    await noKeys.close();
  }
});
