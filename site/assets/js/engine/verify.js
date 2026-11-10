// Truvio — runs every check on an email and decides the final status.
//
// Status meanings (shown to users):
//   valid    — well-formed, the domain receives email, no risk signals
//   risky    — the domain receives email, but something is off (disposable, role, typo, no MX record)
//   invalid  — badly formed, or the domain doesn't exist / can't receive email
//   unknown  — the domain lookup didn't answer in time; try again later
//
// Truvio does NOT log in to mail servers, so "valid" means the address and its domain look
// deliverable, not that the exact mailbox was confirmed.

import { checkSyntax } from './syntax.js';
import { suggestDomain } from './typo.js';
import { ROLE_ACCOUNTS, FREE_PROVIDERS } from './lists.js';
import { checkMailDomain } from './dns.js';

/** Adds "did you mean …?" to a reason when there is a suggestion. */
function withHint(reason, suggestion) {
  return suggestion ? `${reason} — did you mean ${suggestion}?` : reason;
}

export const STATUS = Object.freeze({ VALID: 'valid', RISKY: 'risky', INVALID: 'invalid', UNKNOWN: 'unknown' });

/** Returns true when the domain, or any parent domain, is on the disposable list. */
export function isDisposable(domain, disposableSet) {
  if (!disposableSet || !domain) return false;
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (disposableSet.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

/** Turns a raw list (one domain per line, # comments allowed) into a Set. */
export function parseDomainList(text) {
  return new Set(
    String(text)
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line && !line.startsWith('#'))
  );
}

/**
 * Creates a verifier.
 * @param {{ resolve: Function, disposable: Set<string> }} deps
 */
export function createVerifier({ resolve, disposable = new Set() }) {
  const domainCache = new Map();

  function lookupDomain(asciiDomain) {
    if (!domainCache.has(asciiDomain)) {
      const pending = checkMailDomain(asciiDomain, resolve).then((r) => {
        // Don't keep failed lookups, so a retry can succeed
        if (r.result === 'error') domainCache.delete(asciiDomain);
        return r;
      });
      domainCache.set(asciiDomain, pending);
    }
    return domainCache.get(asciiDomain);
  }

  /**
   * Verifies one email address.
   * @returns {Promise<{ email: string, status: string, score: number, reason: string, suggestion: string|null,
   *   checks: { syntax: boolean, domain: string|null, mx: string, disposable: boolean, role: boolean, free: boolean } }>}
   */
  async function verify(input) {
    const syntax = checkSyntax(input);
    const base = {
      email: syntax.email,
      suggestion: null,
      checks: { syntax: syntax.ok, domain: syntax.asciiDomain || null, mx: 'not-checked', disposable: false, role: false, free: false }
    };

    if (!syntax.ok) {
      return { ...base, status: STATUS.INVALID, score: 0, reason: syntax.reason };
    }

    const domain = syntax.asciiDomain;
    const localLower = syntax.local.toLowerCase();
    const suggestion = suggestDomain(domain);
    const checks = {
      ...base.checks,
      disposable: isDisposable(domain, disposable),
      role: ROLE_ACCOUNTS.has(localLower.split('+')[0]),
      free: FREE_PROVIDERS.has(domain)
    };
    const dns = await lookupDomain(domain);
    checks.mx = dns.result;

    // A look-alike of a big provider (e.g. "ail.com" vs "aol.com") that runs its own mail server
    // is most likely a real company, not a typo. Keep only extension fixes (".con") in that case.
    const sameExtension = suggestion && suggestion.split('.').slice(1).join('.') === domain.split('.').slice(1).join('.');
    const keepSuggestion = suggestion && !(dns.result === 'mx' && sameExtension);
    const suggestedEmail = keepSuggestion ? `${syntax.local}@${suggestion}` : null;

    if (dns.result === 'nxdomain') {
      return { ...base, checks, suggestion: suggestedEmail, status: STATUS.INVALID, score: 5, reason: withHint('Domain does not exist', suggestedEmail) };
    }
    if (dns.result === 'null-mx' || dns.result === 'no-mail') {
      return { ...base, checks, suggestion: suggestedEmail, status: STATUS.INVALID, score: 10, reason: withHint('Domain does not accept email', suggestedEmail) };
    }
    if (dns.result === 'error') {
      return { ...base, checks, suggestion: suggestedEmail, status: STATUS.UNKNOWN, score: 50, reason: 'Domain lookup timed out — try again' };
    }

    // The domain can receive mail. Look for risk signals.
    let score = dns.result === 'mx' ? 95 : 75;
    const risks = [];
    if (suggestedEmail) { score -= 40; risks.push(`Possible typo — did you mean ${suggestedEmail}?`); }
    if (checks.disposable) { score -= 60; risks.push('Disposable (temporary) email domain'); }
    if (checks.role) { score -= 25; risks.push('Role address (reaches a team, not a person)'); }
    if (dns.result === 'a-fallback') risks.push('No mail server record; delivery may fail');

    score = Math.max(1, Math.min(100, score));

    if (risks.length) {
      return { ...base, checks, suggestion: suggestedEmail, status: STATUS.RISKY, score, reason: risks[0] };
    }
    return { ...base, checks, status: STATUS.VALID, score, reason: 'Address and domain look deliverable' };
  }

  return { verify };
}

/**
 * Runs many checks with a limit on how many run at once.
 * @param {string[]} items
 * @param {(item: string) => Promise<any>} worker
 * @param {{ concurrency?: number, onProgress?: (done: number, total: number) => void, signal?: AbortSignal }} options
 */
export async function runPool(items, worker, { concurrency = 8, onProgress, signal } = {}) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;

  async function lane() {
    while (next < items.length) {
      if (signal?.aborted) return;
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
      done += 1;
      onProgress?.(done, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return results;
}
