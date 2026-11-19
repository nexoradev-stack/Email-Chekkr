// Shared test helpers: a fake DNS (so tests never touch the network) and the bundled lists.

import { readFileSync } from 'node:fs';
import { createVerifier, parseDomainList } from '../site/assets/js/engine/verify.js';

export const ZONES = {
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

/** Answers DNS questions from ZONES. Unknown names do not exist; "error" zones time out. */
export function fakeResolve(name, type) {
  const zone = ZONES[name];
  if (zone === 'error') return Promise.resolve({ status: 'error', records: [] });
  if (!zone) return Promise.resolve({ status: 'nxdomain', records: [] });
  return Promise.resolve({ status: 'ok', records: zone[type] || [] });
}

/** Reads one of the bundled lists in site/assets/data. */
export function readList(file) {
  return parseDomainList(readFileSync(new URL(`../site/assets/data/${file}`, import.meta.url), 'utf8'));
}

export const disposable = new Set(['mailinator.com', 'gmial.com']);
export const freeProviders = readList('free-providers.txt');

export const makeVerifier = () => createVerifier({ resolve: fakeResolve, disposable, freeProviders });
