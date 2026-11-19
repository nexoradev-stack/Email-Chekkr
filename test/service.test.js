// Email Chekkr — service tests: CSV checks, domain checks and statistics. No network needed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createService, CSV_COLUMNS } from '../server/service.js';
import { parseCsv } from '../site/assets/js/engine/csv.js';
import { fakeResolve, disposable, freeProviders } from './helpers.js';

const makeService = (extra = {}) => createService({ resolve: fakeResolve, disposable, freeProviders, ...extra });

test('verifyCsv: finds the email column, keeps other columns and adds the result columns', async () => {
  const service = makeService();
  const csv = 'Name,Email,City\nJane,jane@example.com,Pune\nTemp,temp@mailinator.com,Delhi\nBad,not-an-email,Goa\n';
  const out = await service.verifyCsv(csv);
  assert.equal(out.email_column, 'Email');
  assert.deepEqual(out.summary, { total: 3, valid: 1, risky: 1, invalid: 1, unknown: 0 });
  const rows = parseCsv(out.csv);
  assert.deepEqual(rows[0], ['Name', 'Email', 'City', ...CSV_COLUMNS]);
  assert.deepEqual(rows[1].slice(0, 4), ['Jane', 'jane@example.com', 'Pune', 'valid']);
  assert.equal(rows[1][7], 'medium');
  assert.equal(rows[1][8], 'custom');
  assert.equal(rows[2][8], 'disposable');
  assert.equal(out.rows_in_output, 3);
});

test('verifyCsv: lists the rows that need attention, not the valid ones', async () => {
  const out = await makeService().verifyCsv('email\njane@example.com\ninfo@example.com\nsam@gmial.com\n');
  assert.deepEqual(out.needs_attention.map((r) => r.row), [2, 3]);
  assert.equal(out.needs_attention[1].suggestion, 'sam@gmail.com');
});

test('verifyCsv: only_valid keeps just the valid rows', async () => {
  const out = await makeService().verifyCsv('email\njane@example.com\ninfo@example.com\nx@missing.com\n', { onlyValid: true });
  assert.equal(out.summary.total, 3);
  assert.equal(out.rows_in_output, 1);
  assert.equal(parseCsv(out.csv).length, 2);
});

test('verifyCsv: works without a header row', async () => {
  const out = await makeService().verifyCsv('Jane,jane@example.com\nSam,sam@gmail.com\n');
  assert.equal(out.summary.total, 2);
  assert.equal(parseCsv(out.csv)[0][1], 'email');
});

test('verifyCsv: clear errors for empty files, no email column and too many rows', async () => {
  const service = makeService({ csvMaxRows: 2 });
  assert.match((await service.verifyCsv('Name,City\nJane,Pune\n')).error, /No email column/);
  assert.match((await service.verifyCsv('email\n')).error, /no rows/);
  assert.match((await service.verifyCsv('email\na@example.com\nb@example.com\nc@example.com\n')).error, /limit is 2/);
});

test('verifyCsv: output is safe to open in a spreadsheet', async () => {
  const out = await makeService().verifyCsv('note,email\n=HYPERLINK("x"),jane@example.com\n');
  assert.match(out.csv, /'=HYPERLINK/);
});

test('checkDomain: includes provider_type', async () => {
  const service = makeService();
  assert.equal((await service.checkDomain('gmail.com')).provider_type, 'free');
  assert.equal((await service.checkDomain('mailinator.com')).provider_type, 'disposable');
  assert.equal((await service.checkDomain('example.com')).provider_type, 'custom');
});

test('getStatistics: counts checks by status and never stores addresses', async () => {
  let clock = 1_000_000;
  const service = makeService({ now: () => clock });
  await service.verifyEmail('jane@example.com');
  await service.verifyEmails(['info@example.com', 'x@missing.com']);
  await service.verifyCsv(['email', 'sam@gmail.com'].join('\n'));
  await service.checkDomain('example.com');
  clock += 65_000;

  const stats = service.getStatistics();
  assert.equal(stats.emails_checked, 4);
  assert.deepEqual(stats.by_status, { valid: 2, risky: 1, invalid: 1, unknown: 0 });
  assert.equal(stats.domains_checked, 1);
  assert.equal(stats.csv_files_checked, 1);
  assert.equal(stats.uptime_seconds, 65);
  assert.equal(stats.lists.disposable_domains, disposable.size);
  assert.ok(stats.lists.free_providers >= 100);
  assert.ok(stats.domains_in_cache >= 3);
  assert.doesNotMatch(JSON.stringify(stats), /@/);
});

test('getStatistics: returns a copy that callers cannot change', async () => {
  const service = makeService();
  service.getStatistics().by_status.valid = 999;
  assert.equal(service.getStatistics().by_status.valid, 0);
});
