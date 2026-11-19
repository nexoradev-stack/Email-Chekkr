// Email Chekkr — verifier (status, score, reason) tests. Run with: npm test (no network needed).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifier, confidenceFor, providerType, STATUS, CONFIDENCE } from '../site/assets/js/engine/verify.js';
import { fakeResolve, disposable, freeProviders, makeVerifier } from './helpers.js';

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

// ---------- Confidence and provider type ----------

test('confidence: clear evidence is high, soft warnings and valid are medium, timeouts are low', async () => {
  const v = makeVerifier();
  const cases = {
    'broken@@example.com': CONFIDENCE.HIGH, // badly formed
    'jane@missing.com': CONFIDENCE.HIGH, // domain does not exist
    'jane@nomail.com': CONFIDENCE.HIGH, // refuses email
    'temp@mailinator.com': CONFIDENCE.HIGH, // known temporary inbox
    'info@example.com': CONFIDENCE.MEDIUM, // team address
    'sam@gmial.com': CONFIDENCE.HIGH, // typo domain is also on the test disposable list
    'jane@webonly.com': CONFIDENCE.MEDIUM, // no MX record
    'jane@example.com': CONFIDENCE.MEDIUM, // valid, but the mailbox itself is never checked
    'jane@slow.com': CONFIDENCE.LOW // lookup timed out
  };
  for (const [email, expected] of Object.entries(cases)) {
    assert.equal((await v.verify(email)).confidence, expected, email);
  }
});

test('confidence: a typo on its own is medium', async () => {
  const v = createVerifier({ resolve: fakeResolve, disposable: new Set() });
  const r = await v.verify('sam@gmial.com');
  assert.equal(r.status, STATUS.RISKY);
  assert.equal(r.confidence, CONFIDENCE.MEDIUM);
});

test('provider type: disposable, free, custom, or null when badly formed', async () => {
  const v = makeVerifier();
  assert.equal((await v.verify('temp@mailinator.com')).provider_type, 'disposable');
  assert.equal((await v.verify('jane@gmail.com')).provider_type, 'free');
  assert.equal((await v.verify('jane@example.com')).provider_type, 'custom');
  assert.equal((await v.verify('not-an-email')).provider_type, null);
});

test('provider type: disposable wins over free', () => {
  assert.equal(providerType({ syntax: true, disposable: true, free: true }), 'disposable');
});

test('confidenceFor works on any result shape', () => {
  assert.equal(confidenceFor({ status: STATUS.UNKNOWN, checks: {} }), CONFIDENCE.LOW);
  assert.equal(confidenceFor({ status: STATUS.VALID, checks: {} }), CONFIDENCE.MEDIUM);
});

test('verify: every result has the same fields', async () => {
  const v = makeVerifier();
  for (const email of ['jane@example.com', 'bad', 'jane@slow.com', 'info@example.com']) {
    const r = await v.verify(email);
    for (const key of ['email', 'status', 'score', 'confidence', 'provider_type', 'reason', 'suggestion', 'checks']) {
      assert.ok(key in r, `${email} is missing ${key}`);
    }
    assert.ok(r.score >= 0 && r.score <= 100, email);
  }
});

test('verify: without a free-provider list nothing is marked free', async () => {
  const v = createVerifier({ resolve: fakeResolve, disposable });
  assert.equal((await v.verify('jane@gmail.com')).checks.free, false);
});

// ---------- Placeholder addresses ----------

test('verify: placeholder names at real providers (test@ or sample@ at gmail.com) are risky, not valid', async () => {
  const r = await makeVerifier().verify('test@gmail.com');
  assert.equal(r.status, STATUS.RISKY);
  assert.equal(r.checks.placeholder, true);
  assert.match(r.reason, /placeholder/);
  assert.ok(r.score < 60);
});

test('verify: the website demo address sample.user@gmail.com still shows as valid', async () => {
  const r = await makeVerifier().verify('sample.user@gmail.com');
  assert.equal(r.status, STATUS.VALID);
});

// ---------- Mailbox check (fake SMTP answers) ----------

const withMailbox = (answer, calls = []) => createVerifier({
  resolve: fakeResolve,
  disposable,
  freeProviders,
  mailbox: async (email, domain, mx) => { calls.push({ email, domain, mx }); return { mailbox: answer }; }
});

test('mailbox: confirmed mailbox is valid with high confidence', async () => {
  const calls = [];
  const r = await withMailbox('exists', calls).verify('jane@example.com');
  assert.equal(r.status, STATUS.VALID);
  assert.equal(r.score, 99);
  assert.equal(r.confidence, CONFIDENCE.HIGH);
  assert.equal(r.checks.mailbox, 'exists');
  assert.deepEqual(calls[0], { email: 'jane@example.com', domain: 'example.com', mx: ['mx1.example.com', 'mx2.example.com'] });
});

test('mailbox: mail server says no such user → invalid', async () => {
  const r = await withMailbox('not-found').verify('jane@gmail.com');
  assert.equal(r.status, STATUS.INVALID);
  assert.equal(r.confidence, CONFIDENCE.HIGH);
  assert.match(r.reason, /Mailbox does not exist/);
});

test('mailbox: catch-all and full mailboxes are risky', async () => {
  const catchAll = await withMailbox('catch-all').verify('jane@example.com');
  assert.equal(catchAll.status, STATUS.RISKY);
  assert.match(catchAll.reason, /catch-all/);
  const full = await withMailbox('full').verify('jane@example.com');
  assert.equal(full.status, STATUS.RISKY);
  assert.match(full.reason, /full/);
});

test('mailbox: no clear answer keeps the domain-only result', async () => {
  const r = await withMailbox('unknown').verify('jane@example.com');
  assert.equal(r.status, STATUS.VALID);
  assert.equal(r.score, 95);
  assert.equal(r.confidence, CONFIDENCE.MEDIUM);
  assert.equal(r.checks.mailbox, 'unknown');
});

test('mailbox: skipped for disposable domains, bad domains and when turned off for a call', async () => {
  const calls = [];
  const v = withMailbox('exists', calls);
  await v.verify('temp@mailinator.com');
  await v.verify('jane@missing.com');
  await v.verify('bad@@example.com');
  const skipped = await v.verify('jane@example.com', { checkMailbox: false });
  assert.equal(calls.length, 0);
  assert.equal(skipped.checks.mailbox, 'not-checked');
});

test('mailbox: a domain with no MX record is asked directly', async () => {
  const calls = [];
  await withMailbox('unknown', calls).verify('jane@webonly.com');
  assert.deepEqual(calls[0].mx, ['webonly.com']);
});

test('mailbox: without a checker nothing changes (the website)', async () => {
  const r = await makeVerifier().verify('jane@example.com');
  assert.equal(r.checks.mailbox, 'not-checked');
  assert.equal(r.score, 95);
});
