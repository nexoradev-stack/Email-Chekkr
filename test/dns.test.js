// Email Chekkr — domain and mail server (DNS) tests. Run with: npm test (no network needed).

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMx, checkMailDomain, createDohResolver } from '../site/assets/js/engine/dns.js';
import { fakeResolve } from './helpers.js';

test('dns: parses MX records', () => {
  assert.deepEqual(parseMx('10 mx1.example.com.'), { priority: 10, host: 'mx1.example.com' });
  assert.deepEqual(parseMx('0 .'), { priority: 0, host: '' });
});

test('dns: classifies domains', async () => {
  assert.equal((await checkMailDomain('example.com', fakeResolve)).result, 'mx');
  assert.deepEqual((await checkMailDomain('example.com', fakeResolve)).mx, ['mx1.example.com', 'mx2.example.com']);
  assert.equal((await checkMailDomain('webonly.com', fakeResolve)).result, 'a-fallback');
  assert.equal((await checkMailDomain('nomail.com', fakeResolve)).result, 'null-mx');
  assert.equal((await checkMailDomain('parked.com', fakeResolve)).result, 'no-mail');
  assert.equal((await checkMailDomain('missing.com', fakeResolve)).result, 'nxdomain');
  assert.equal((await checkMailDomain('slow.com', fakeResolve)).result, 'error');
});

test('dns: DoH resolver reads answers, NXDOMAIN and falls back on failure', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('dns.google')) throw new Error('blocked');
    if (url.includes('missing.com')) return { ok: true, json: async () => ({ Status: 3 }) };
    return { ok: true, json: async () => ({ Status: 0, Answer: [{ type: 15, data: '10 mx.example.com.' }, { type: 5, data: 'cname.' }] }) };
  };
  const resolve = createDohResolver({ fetchImpl, timeoutMs: 1000 });
  assert.deepEqual(await resolve('example.com', 'MX'), { status: 'ok', records: ['10 mx.example.com.'] });
  assert.equal((await resolve('missing.com', 'MX')).status, 'nxdomain');
  assert.ok(calls.some((u) => u.includes('cloudflare-dns.com')), 'falls back to Cloudflare');
});

test('dns: DoH resolver reports an error when every provider fails', async () => {
  const resolve = createDohResolver({ fetchImpl: async () => { throw new Error('offline'); }, timeoutMs: 100 });
  assert.equal((await resolve('example.com', 'MX')).status, 'error');
});

test('checkMailDomain: empty MX answer but address lookups say the domain does not exist', async () => {
  const resolve = async (name, type) => (type === 'MX' ? { status: 'ok', records: [] } : { status: 'nxdomain', records: [] });
  assert.equal((await checkMailDomain('gone.example', resolve)).result, 'nxdomain');
});
