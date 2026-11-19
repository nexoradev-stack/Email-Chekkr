// Email Chekkr — CSV tests. Run with: npm test (no network needed).

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, findEmailColumn, toCsv, safeCell } from '../site/assets/js/engine/csv.js';

test('csv: parses quotes, commas, line breaks and a BOM', () => {
  const rows = parseCsv('﻿Name,Email\r\n"Doe, Jane",jane@example.com\n"Line\nbreak","say ""hi"""\n\n');
  assert.deepEqual(rows, [['Name', 'Email'], ['Doe, Jane', 'jane@example.com'], ['Line\nbreak', 'say "hi"']]);
});

test('csv: finds the email column by header', () => {
  assert.deepEqual(findEmailColumn([['First Name', 'Email Address'], ['Jane', 'jane@example.com']]), { index: 1, hasHeader: true });
  assert.deepEqual(findEmailColumn([['Name', 'Work Email'], ['Jane', 'jane@example.com']]), { index: 1, hasHeader: true });
});

test('csv: finds the email column without a header', () => {
  assert.deepEqual(findEmailColumn([['Jane', 'jane@example.com'], ['Sam', 'sam@example.com']]), { index: 1, hasHeader: false });
  assert.deepEqual(findEmailColumn([['Name', 'Contact'], ['Jane', 'jane@example.com']]), { index: 1, hasHeader: true });
});

test('csv: reports no email column', () => {
  assert.equal(findEmailColumn([['Name', 'City'], ['Jane', 'Pune']]).index, -1);
  assert.equal(findEmailColumn([]).index, -1);
});

test('csv: output is spreadsheet-safe', () => {
  assert.equal(safeCell('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
  assert.equal(safeCell('+1'), "'+1");
  assert.equal(safeCell('jane@example.com'), 'jane@example.com');
  assert.equal(toCsv([['a', 'b,c'], ['say "hi"', '=1+1']]), 'a,"b,c"\r\n"say ""hi""",\'=1+1');
});
