// Email Chekkr — disposable, free-provider and team-address list tests. Run with: npm test (no network needed).

import test from 'node:test';
import assert from 'node:assert/strict';
import { isDisposable } from '../site/assets/js/engine/verify.js';
import { ROLE_ACCOUNTS } from '../site/assets/js/engine/lists.js';
import { disposable, readList } from './helpers.js';

test('disposable: matches subdomains of listed domains', () => {
  assert.equal(isDisposable('mailinator.com', disposable), true);
  assert.equal(isDisposable('eu.mailinator.com', disposable), true);
  assert.equal(isDisposable('example.com', disposable), false);
});

test('disposable: the bundled list loads and includes known services', () => {
  const list = readList('disposable-domains.txt');
  assert.ok(list.size > 5000, `list has ${list.size} domains`);
  assert.ok(list.has('mailinator.com'));
  assert.ok(!list.has('gmail.com'));
});

test('free providers: the bundled list loads, is big enough and has well-formed domains', () => {
  const list = readList('free-providers.txt');
  assert.ok(list.size >= 100, `list has ${list.size} domains`);
  for (const d of ['gmail.com', 'outlook.com', 'yahoo.co.in', 'icloud.com', 'proton.me', 'rediffmail.com']) {
    assert.ok(list.has(d), d);
  }
  for (const d of list) assert.match(d, /^[a-z0-9.-]+\.[a-z]{2,}$/, d);
});

test('free providers: comments and blank lines are ignored', () => {
  for (const d of readList('free-providers.txt')) assert.ok(!d.startsWith('#') && d.trim() === d && d !== '');
});

test('free providers and disposable domains never overlap', () => {
  const free = readList('free-providers.txt');
  const temp = readList('disposable-domains.txt');
  const both = [...free].filter((d) => isDisposable(d, temp));
  assert.deepEqual(both, [], `on both lists: ${both.join(', ')}`);
});

test('team addresses: common team inboxes are on the list, personal names are not', () => {
  for (const r of ['info', 'sales', 'support', 'admin', 'noreply', 'hr']) assert.ok(ROLE_ACCOUNTS.has(r), r);
  for (const p of ['jane', 'sam', 'alex']) assert.ok(!ROLE_ACCOUNTS.has(p), p);
});
