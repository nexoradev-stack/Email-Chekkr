// Email Chekkr — format (syntax) tests. Run with: npm test (no network needed).

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSyntax } from '../site/assets/js/engine/syntax.js';

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

test('syntax: keeps the part before @ and the domain separately', () => {
  const r = checkSyntax('Jane.Doe@Example.COM');
  assert.equal(r.ok, true);
  assert.equal(r.local, 'Jane.Doe');
  assert.equal(r.asciiDomain, 'example.com');
});

test('syntax: handles odd input types without crashing', () => {
  for (const value of [null, undefined, 42, {}]) assert.equal(checkSyntax(value).ok, false);
});
