// Truvio API — the checks the API and the MCP tools offer.
// Wraps the shared engine (site/assets/js/engine), which is the same code the website runs.

import { checkSyntax } from '../site/assets/js/engine/syntax.js';
import { suggestDomain } from '../site/assets/js/engine/typo.js';
import { FREE_PROVIDERS } from '../site/assets/js/engine/lists.js';
import { createVerifier, isDisposable, runPool } from '../site/assets/js/engine/verify.js';

const DOMAIN_MEANING = {
  mx: 'Has a mail server (MX record)',
  'a-fallback': 'No MX record, but has an address record; mail may still be delivered',
  'null-mx': 'Says it never accepts email (null MX)',
  'no-mail': 'Has no mail server or address record',
  nxdomain: 'Domain does not exist',
  error: 'Lookup timed out — try again'
};

/**
 * @param {{ resolve: Function, disposable: Set<string>, concurrency?: number, cacheTtlMs?: number, cacheMax?: number }} deps
 */
export function createService({ resolve, disposable, concurrency = 10, cacheTtlMs, cacheMax }) {
  const verifier = createVerifier({ resolve, disposable, cacheTtlMs, cacheMax });

  /** Checks one address. */
  function verifyEmail(email) {
    return verifier.verify(email);
  }

  /** Checks many addresses; results keep the input order, with a summary of counts. */
  async function verifyEmails(emails) {
    const started = Date.now();
    const results = await runPool(emails, (e) => verifier.verify(e), { concurrency });
    const summary = { total: results.length, valid: 0, risky: 0, invalid: 0, unknown: 0 };
    for (const r of results) summary[r.status] += 1;
    return { summary, results, took_ms: Date.now() - started };
  }

  /** Checks a domain on its own: does it exist, does it take email, is it disposable or free? */
  async function checkDomain(input) {
    const raw = String(input ?? '').trim().replace(/^.*@/, '').replace(/\.$/, '');
    const syntax = checkSyntax(`postmaster@${raw}`);
    if (!syntax.ok) {
      return { domain: raw, valid_format: false, reason: syntax.reason.replace('Part before @', 'Domain') };
    }
    const domain = syntax.asciiDomain;
    const dns = await verifier.lookupDomain(domain);
    const suggestion = suggestDomain(domain);
    return {
      domain,
      valid_format: true,
      accepts_email: dns.result === 'mx' || dns.result === 'a-fallback',
      mail: dns.result,
      meaning: DOMAIN_MEANING[dns.result],
      mx: dns.mx,
      disposable: isDisposable(domain, disposable),
      free_provider: FREE_PROVIDERS.has(domain),
      suggestion: suggestion && suggestion !== domain ? suggestion : null
    };
  }

  return { verifyEmail, verifyEmails, checkDomain };
}
