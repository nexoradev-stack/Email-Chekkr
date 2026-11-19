// Email Chekkr — MCP tool tests for verify_csv and get_statistics. No network needed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../server/service.js';
import { createMcpHandler, toolDefinitions } from '../server/mcp.js';
import { fakeResolve, disposable, freeProviders } from './helpers.js';

function setup() {
  const service = createService({ resolve: fakeResolve, disposable, freeProviders, csvMaxRows: 5 });
  const handle = createMcpHandler({ service, batchMax: 10, csvMaxRows: 5 });
  let id = 0;
  const call = (name, args) => handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } });
  return { handle, call };
}

test('tools: five tools, each with a description and an input schema', () => {
  const tools = toolDefinitions(10, 5);
  assert.deepEqual(tools.map((t) => t.name), ['verify_email', 'verify_emails_batch', 'check_domain', 'verify_csv', 'get_statistics']);
  for (const t of tools) {
    assert.ok(t.description.length > 20, t.name);
    assert.equal(t.inputSchema.type, 'object', t.name);
    assert.equal(t.annotations.readOnlyHint, true, t.name);
  }
  assert.match(tools.find((t) => t.name === 'verify_csv').description, /up to 5 rows/);
});

test('verify_email: result includes confidence and provider_type', async () => {
  const { call } = setup();
  const r = (await call('verify_email', { email: 'jane@gmail.com' })).result.structuredContent;
  assert.equal(r.status, 'valid');
  assert.equal(r.confidence, 'medium');
  assert.equal(r.provider_type, 'free');
});

test('verify_csv: checks a file and returns the CSV with results', async () => {
  const { call } = setup();
  const res = (await call('verify_csv', { csv: 'name,email\nJane,jane@example.com\nTemp,temp@mailinator.com\n' })).result;
  assert.equal(res.isError, false);
  assert.deepEqual(res.structuredContent.summary, { total: 2, valid: 1, risky: 1, invalid: 0, unknown: 0 });
  assert.match(res.structuredContent.csv, /chekkr_status/);
});

test('verify_csv: only_valid and bad input', async () => {
  const { call } = setup();
  const only = (await call('verify_csv', { csv: 'email\njane@example.com\ninfo@example.com\n', only_valid: true })).result;
  assert.equal(only.structuredContent.rows_in_output, 1);

  assert.equal((await call('verify_csv', {})).result.isError, true);
  assert.equal((await call('verify_csv', { csv: '   ' })).result.isError, true);
  assert.equal((await call('verify_csv', { csv: 'email\na@example.com\n', only_valid: 'yes' })).result.isError, true);
  const noColumn = (await call('verify_csv', { csv: 'name\nJane\n' })).result;
  assert.equal(noColumn.isError, true);
  assert.match(noColumn.structuredContent.error, /No email column/);
  const tooBig = (await call('verify_csv', { csv: `email\n${'a@example.com\n'.repeat(6)}` })).result;
  assert.equal(tooBig.isError, true);
});

test('get_statistics: reflects earlier checks', async () => {
  const { call } = setup();
  await call('verify_email', { email: 'jane@example.com' });
  await call('verify_emails_batch', { emails: ['x@missing.com', 'info@example.com'] });
  const stats = (await call('get_statistics', {})).result.structuredContent;
  assert.equal(stats.emails_checked, 3);
  assert.deepEqual(stats.by_status, { valid: 1, risky: 1, invalid: 1, unknown: 0 });
  assert.equal(typeof stats.uptime_seconds, 'number');
});

test('initialize: version and instructions mention the new tools', async () => {
  const { handle } = setup();
  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(init.result.serverInfo.version, '0.4.0');
  assert.match(init.result.instructions, /verify_csv/);
  assert.match(init.result.instructions, /confidence/);
});
