// Email Chekkr API — the checks the API and the MCP tools offer.
// Wraps the shared engine (site/assets/js/engine), which is the same code the website runs.

import { checkSyntax } from '../site/assets/js/engine/syntax.js';
import { suggestDomain } from '../site/assets/js/engine/typo.js';
import { createVerifier, isDisposable, runPool, STATUS } from '../site/assets/js/engine/verify.js';
import { parseCsv, findEmailColumn, toCsv } from '../site/assets/js/engine/csv.js';

const DOMAIN_MEANING = {
  mx: 'Has a mail server (MX record)',
  'a-fallback': 'No MX record, but has an address record; mail may still be delivered',
  'null-mx': 'Says it never accepts email (null MX)',
  'no-mail': 'Has no mail server or address record',
  nxdomain: 'Domain does not exist',
  error: 'Lookup timed out — try again'
};

/** Columns added to every row of a checked CSV (same names as the website download). */
export const CSV_COLUMNS = ['chekkr_status', 'chekkr_score', 'chekkr_reason', 'chekkr_suggestion', 'chekkr_confidence', 'chekkr_provider'];

const emptyCounts = () => ({ valid: 0, risky: 0, invalid: 0, unknown: 0 });

/**
 * @param {{ resolve: Function, disposable: Set<string>, freeProviders?: Set<string>, concurrency?: number,
 *   cacheTtlMs?: number, cacheMax?: number, csvMaxRows?: number, now?: () => number,
 *   mailbox?: Function | null, mailboxInBatches?: boolean }} deps
 *   mailbox: the SMTP mailbox checker from smtp.js, or null when the mailbox check is off.
 */
export function createService({
  resolve, disposable, freeProviders = new Set(), concurrency = 10, cacheTtlMs, cacheMax, csvMaxRows = 10_000, now = Date.now,
  mailbox = null, mailboxInBatches = false
}) {
  const verifier = createVerifier({ resolve, disposable, freeProviders, mailbox, cacheTtlMs, cacheMax });
  const batchOptions = { checkMailbox: mailboxInBatches };

  // Running totals since the server started (kept in memory only; no addresses are stored).
  const startedAt = now();
  const stats = { emails_checked: 0, domains_checked: 0, csv_files_checked: 0, mailboxes_checked: 0, by_status: emptyCounts() };

  function count(results) {
    for (const r of results) {
      stats.emails_checked += 1;
      stats.by_status[r.status] += 1;
      if (r.checks?.mailbox && r.checks.mailbox !== 'not-checked') stats.mailboxes_checked += 1;
    }
  }

  function summarize(results) {
    const summary = { total: results.length, ...emptyCounts() };
    for (const r of results) summary[r.status] += 1;
    return summary;
  }

  /** Checks one address. */
  async function verifyEmail(email) {
    const result = await verifier.verify(email);
    count([result]);
    return result;
  }

  /** Checks many addresses; results keep the input order, with a summary of counts. */
  async function verifyEmails(emails) {
    const started = now();
    const results = await runPool(emails, (e) => verifier.verify(e, batchOptions), { concurrency });
    count(results);
    return { summary: summarize(results), results, took_ms: now() - started };
  }

  /**
   * Checks every address in a CSV file (given as text).
   * Finds the email column, keeps the other columns, and adds the chekkr_* columns.
   * @param {string} text  the CSV content
   * @param {{ onlyValid?: boolean, previewMax?: number }} options
   */
  async function verifyCsv(text, { onlyValid = false, previewMax = 20 } = {}) {
    const started = now();
    const rows = parseCsv(text);
    const { index, hasHeader } = findEmailColumn(rows);
    if (index < 0) return { error: 'No email column found. Add a header called "email", or put addresses in one column.' };

    const data = hasHeader ? rows.slice(1) : rows;
    if (data.length === 0) return { error: 'The CSV has no rows to check.' };
    if (data.length > csvMaxRows) return { error: `The CSV has ${data.length} rows; the limit is ${csvMaxRows} per call. Split the file and try again.` };

    const header = hasHeader ? rows[0] : rows[0].map((_, i) => (i === index ? 'email' : `column_${i + 1}`));
    const results = await runPool(data.map((r) => r[index] ?? ''), (e) => verifier.verify(e, batchOptions), { concurrency });
    count(results);
    stats.csv_files_checked += 1;

    const out = [[...header, ...CSV_COLUMNS]];
    data.forEach((row, i) => {
      const r = results[i];
      if (onlyValid && r.status !== STATUS.VALID) return;
      out.push([...row, r.status, r.score, r.reason, r.suggestion || '', r.confidence, r.provider_type || '']);
    });

    // A short list of the addresses that need attention, so an AI can explain them without reading the whole file
    const needsAttention = [];
    results.forEach((r, i) => {
      if (r.status !== STATUS.VALID && needsAttention.length < previewMax) {
        needsAttention.push({ row: i + 1, email: r.email, status: r.status, reason: r.reason, suggestion: r.suggestion });
      }
    });

    return {
      summary: summarize(results),
      email_column: header[index],
      rows_in_output: out.length - 1,
      needs_attention: needsAttention,
      csv: toCsv(out),
      took_ms: now() - started
    };
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
    stats.domains_checked += 1;
    const suggestion = suggestDomain(domain);
    const disposableHit = isDisposable(domain, disposable);
    const free = freeProviders.has(domain);
    return {
      domain,
      valid_format: true,
      accepts_email: dns.result === 'mx' || dns.result === 'a-fallback',
      mail: dns.result,
      meaning: DOMAIN_MEANING[dns.result],
      mx: dns.mx,
      disposable: disposableHit,
      free_provider: free,
      provider_type: disposableHit ? 'disposable' : free ? 'free' : 'custom',
      suggestion: suggestion && suggestion !== domain ? suggestion : null
    };
  }

  /** Totals since the server started. No email addresses are kept. */
  function getStatistics() {
    return {
      ...structuredClone(stats),
      domains_in_cache: verifier.cacheSize(),
      mailbox_check: { enabled: Boolean(mailbox), in_batches: Boolean(mailbox) && mailboxInBatches },
      lists: { disposable_domains: disposable.size, free_providers: freeProviders.size },
      uptime_seconds: Math.round((now() - startedAt) / 1000),
      started_at: new Date(startedAt).toISOString()
    };
  }

  return { verifyEmail, verifyEmails, verifyCsv, checkDomain, getStatistics, mailboxCheck: Boolean(mailbox) };
}
