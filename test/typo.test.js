// Email Chekkr — typo suggestion tests. Run with: npm test (no network needed).

import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestDomain, editDistance } from '../site/assets/js/engine/typo.js';

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

test('typo: catches common Outlook and Yahoo slips', () => {
  assert.equal(suggestDomain('outlok.com'), 'outlook.com');
  assert.equal(suggestDomain('yaho.com'), 'yahoo.com');
  assert.equal(suggestDomain('gmail.cmo'), 'gmail.com');
});
