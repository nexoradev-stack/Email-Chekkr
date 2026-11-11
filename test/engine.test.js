// Email Chekkr engine tests. Run with: npm test (no network needed — DNS is faked).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { checkSyntax } from '../site/assets/js/engine/syntax.js';
import { suggestDomain, editDistance } from '../site/assets/js/engine/typo.js';
import { parseMx, checkMailDomain, createDohResolver } from '../site/assets/js/engine/dns.js';
import { createVerifier, isDisposable, parseDomainList, runPool, STATUS } from '../site/assets/js/engine/verify.js';
import { parseCsv, findEmailColumn, toCsv, safeCell } from '../site/assets/js/engine/csv.js';

// ---------- Fake DNS ----------

const ZONES = {
  'gmail.com': { MX: ['5 gmail-smtp-in.l.google.com.'] },
  'example.com': { MX: ['10 mx1.example.com.', '20 mx2.example.com.'] },
  'mailinator.com': { MX: ['10 mail.mailinator.com.'] },
  'gmial.com': { MX: [], A: ['1.2.3.4'] },
  'ail.com': { MX: ['10 mx.ail.com.'] },
  'webonly.com': { MX: [], A: ['5.6.7.8'] },
  'nomail.com': { MX: ['0 .'] },
  'parked.com': { MX: [], A: [], AAAA: [] },
  'slow.com': 'error'
};

function fakeResolve(name, type) {
  const zone = ZONES[name];
  if (zone === 'error') return Promise.resolve({ status: 'error', records: [] });
  if (!zone) return Promise.resolve({ status: 'nxdomain', records: [] });
  return Promise.resolve({ status: 'ok', records: zone[type] || [] });
}

const disposable = new Set(['mailinator.com', 'gmial.com']);
const makeVerifier = () => createVerifier({ resolve: fakeResolve, disposable });

// ---------- Syntax ----------

test('syntax: accepts normal addresses', () => {
  for (const email of ['jane@example.com', 'sample.user+news@example.co.uk', "o'brien@example.com", '  jane@example.com  ']) {
    assert.equal(checkSyntax(email).ok, true, email);
  }
});

test('syntax: rejects broken addresses with a reason', () => {
  const cases = {
    '': 'Empty value',
    'janeexample.com': 'Missing @',
    'jane@@example.com': 'more than one @',
    'jane doe@example.com': 'spaces',
    '.jane@example.com': 'Dots',
    'sample..user@example.com': 'Dots',
    'jane@example': 'extension',
    'jane@acme_corp.com': 'not allowed',
    'jane@example.c': 'extension'
  };
  for (const [email, reason] of Object.entries(cases)) {
    const r = checkSyntax(email);
    assert.equal(r.ok, false, email);
    assert.match(r.reason, new RegExp(reason, 'i'), email);
  }
});

test('syntax: enforces length limits', () => {
  assert.equal(checkSyntax(`${'a'.repeat(65)}@example.com`).ok, false);
  assert.equal(checkSyntax(`a@${'b'.repeat(250)}.com`).ok, false);
});

test('syntax: converts international domains to ASCII', () => {
  const r = checkSyntax('anna@bücher.de');
  assert.equal(r.ok, true);
  assert.equal(r.asciiDomain, 'xn--bcher-kva.de');
});

// ---------- Typos ----------

test('typo: suggests popular providers and fixes extensions', () => {
  assert.equal(suggestDomain('gmial.com'), 'gmail.com');
  assert.equal(suggestDomain('gmail.co'), 'gmail.com');
  assert.equal(suggestDomain('hotmial.com'), 'hotmail.com');
  assert.equal(suggestDomain('yahooo.com'), 'yahoo.com');
  assert.equal(suggestDomain('example.con'), 'example.com');
  assert.equal(suggestDomain('example.ogr'), 'example.org');
});

test('typo: leaves correct domains alone', () => {
  for (const d of ['gmail.com', 'example.com', 'mail.com', 'company.co', 'outlook.in.example']) {
    assert.equal(suggestDomain(d), null, d);
  }
});

test('typo: edit distance counts swaps as one change', () => {
  assert.equal(editDistance('gmial', 'gmail'), 1);
  assert.equal(editDistance('abc', 'abc'), 0);
});

// ---------- DNS ----------

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

// ---------- Verifier ----------

test('verify: valid personal address', async () => {
  const r = await makeVerifier().verify('jane@example.com');
  assert.equal(r.status, STATUS.VALID);
  assert.equal(r.score, 95);
  assert.equal(r.checks.mx, 'mx');
});

test('verify: free provider is still valid', async () => {
  const r = await makeVerifier().verify('jane@gmail.com');
  assert.equal(r.status, STATUS.VALID);
  assert.equal(r.checks.free, true);
});

test('verify: disposable domain is risky', async () => {
  const r = await makeVerifier().verify('temp@mailinator.com');
  assert.equal(r.status, STATUS.RISKY);
  assert.equal(r.checks.disposable, true);
  assert.match(r.reason, /Disposable/);
});

test('verify: role address is risky', async () => {
  const r = await makeVerifier().verify('info@example.com');
  assert.equal(r.status, STATUS.RISKY);
  assert.equal(r.checks.role, true);
});

test('verify: role detection ignores +tags', async () => {
  const r = await makeVerifier().verify('sales+leads@example.com');
  assert.equal(r.checks.role, true);
});

test('verify: typo is risky and the suggestion is the main reason', async () => {
  const r = await makeVerifier().verify('sam@gmial.com');
  assert.equal(r.status, STATUS.RISKY);
  assert.equal(r.suggestion, 'sam@gmail.com');
  assert.match(r.reason, /did you mean sam@gmail.com/);
});

test('verify: a look-alike domain with its own mail server is not treated as a typo', async () => {
  const r = await makeVerifier().verify('jane@ail.com');
  assert.equal(r.status, STATUS.VALID);
  assert.equal(r.suggestion, null);
});

test('verify: domain without MX but online is risky', async () => {
  const r = await makeVerifier().verify('jane@webonly.com');
  assert.equal(r.status, STATUS.RISKY);
  assert.equal(r.checks.mx, 'a-fallback');
});

test('verify: invalid cases', async () => {
  const v = makeVerifier();
  assert.equal((await v.verify('broken@@example.com')).status, STATUS.INVALID);
  assert.equal((await v.verify('jane@missing.com')).status, STATUS.INVALID);
  assert.equal((await v.verify('jane@nomail.com')).status, STATUS.INVALID);
  assert.equal((await v.verify('jane@parked.com')).status, STATUS.INVALID);
  const typo = await v.verify('alex@missing.con');
  assert.equal(typo.status, STATUS.INVALID);
  assert.equal(typo.suggestion, 'alex@missing.com');
});

test('verify: lookup timeout is unknown, not invalid', async () => {
  const r = await makeVerifier().verify('jane@slow.com');
  assert.equal(r.status, STATUS.UNKNOWN);
});

test('verify: each domain is looked up once', async () => {
  let lookups = 0;
  const counting = (name, type) => { lookups += 1; return fakeResolve(name, type); };
  const v = createVerifier({ resolve: counting, disposable });
  await Promise.all(['a@example.com', 'b@example.com', 'c@example.com'].map((e) => v.verify(e)));
  assert.equal(lookups, 1);
});

test('disposable: matches subdomains of listed domains', () => {
  assert.equal(isDisposable('mailinator.com', disposable), true);
  assert.equal(isDisposable('eu.mailinator.com', disposable), true);
  assert.equal(isDisposable('example.com', disposable), false);
});

test('disposable: the bundled list loads and includes known services', () => {
  const list = parseDomainList(readFileSync(new URL('../site/assets/data/disposable-domains.txt', import.meta.url), 'utf8'));
  assert.ok(list.size > 5000, `list has ${list.size} domains`);
  assert.ok(list.has('mailinator.com'));
  assert.ok(!list.has('gmail.com'));
});

// ---------- Pool ----------

test('pool: keeps order, limits concurrency and reports progress', async () => {
  let running = 0;
  let peak = 0;
  const progress = [];
  const out = await runPool([3, 1, 2, 4], async (n) => {
    running += 1; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, n * 5));
    running -= 1;
    return n * 10;
  }, { concurrency: 2, onProgress: (done) => progress.push(done) });
  assert.deepEqual(out, [30, 10, 20, 40]);
  assert.ok(peak <= 2);
  assert.deepEqual(progress, [1, 2, 3, 4]);
});

test('pool: stops when cancelled', async () => {
  const controller = new AbortController();
  const out = await runPool([1, 2, 3, 4, 5], async (n) => { if (n === 2) controller.abort(); return n; }, { concurrency: 1, signal: controller.signal });
  assert.deepEqual(out.filter((x) => x !== undefined), [1, 2]);
});

// ---------- CSV ----------

test('csv: parses quotes, commas, line breaks and a BOM', () => {
  const rows = parseCsv('﻿Name,Email\r\n"Doe, Jane",jane@example.com\n"Line\nbreak","say ""hi"""\n\n');
  assert.deepEqual(rows, [['Name', 'Email'], ['Doe, Jane', 'jane@example.com'], ['Line\nbreak', 'say "hi"']]);
});

test('csv: finds the email column by header', () => {
  assert.deepEqual(findEmailColumn([['First Name', 'Email Address'], ['Jane', 'jane@example.com']]), { index: 1, hasHeader: true });
  assert.deepEqual(findEmailColumn([['Name', 'Work Email'], ['Jane', 'jane@example.com']]), { index: 1, hasHeader: true });
});

test('csv: finds the email column without a header', () => {
  assert.deepEqual(findEmailColumn([['Jane', 'jane@example.com'], ['Sam', 'sam@example.com']]), { index: 1, hasHeader: false });
  assert.deepEqual(findEmailColumn([['Name', 'Contact'], ['Jane', 'jane@example.com']]), { index: 1, hasHeader: true });
});

test('csv: reports no email column', () => {
  assert.equal(findEmailColumn([['Name', 'City'], ['Jane', 'Pune']]).index, -1);
  assert.equal(findEmailColumn([]).index, -1);
});

test('csv: output is spreadsheet-safe', () => {
  assert.equal(safeCell('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
  assert.equal(safeCell('+1'), "'+1");
  assert.equal(safeCell('jane@example.com'), 'jane@example.com');
  assert.equal(toCsv([['a', 'b,c'], ['say "hi"', '=1+1']]), 'a,"b,c"\r\n"say ""hi""",\'=1+1');
});

test('checkMailDomain: empty MX answer but address lookups say the domain does not exist', async () => {
  const resolve = async (name, type) => (type === 'MX' ? { status: 'ok', records: [] } : { status: 'nxdomain', records: [] });
  assert.equal((await checkMailDomain('gone.example', resolve)).result, 'nxdomain');
});
