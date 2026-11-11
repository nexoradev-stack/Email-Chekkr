// Email Chekkr — CSV reading and writing for bulk checks (runs entirely in the browser).

/** Parses CSV text into rows of fields. Handles quotes, commas and line breaks inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = String(text).replace(/^﻿/, '');

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/**
 * Finds the column that holds email addresses.
 * Prefers a header named like "email"; otherwise the column with the most "@" values.
 * @returns {{ index: number, hasHeader: boolean }}
 */
export function findEmailColumn(rows) {
  if (!rows.length) return { index: -1, hasHeader: false };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const named = header.findIndex((h) => /^(e-?mail|email ?address|e-?mail ?id|work ?email|mail)$/.test(h));
  if (named >= 0) return { index: named, hasHeader: true };
  const loose = header.findIndex((h) => h.includes('email') || h.includes('e-mail'));
  if (loose >= 0) return { index: loose, hasHeader: true };

  const sample = rows.slice(0, 50);
  const width = Math.max(...sample.map((r) => r.length));
  let best = -1;
  let bestCount = 0;
  for (let c = 0; c < width; c += 1) {
    const count = sample.filter((r) => (r[c] || '').includes('@')).length;
    if (count > bestCount) { best = c; bestCount = count; }
  }
  const headerHasAt = (rows[0][best] || '').includes('@');
  return { index: best, hasHeader: best >= 0 && !headerHasAt };
}

/** Protects spreadsheet users: values starting with = + - @ are prefixed so they aren't run as formulas. */
export function safeCell(value) {
  const v = String(value ?? '');
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** Writes rows as CSV text. */
export function toCsv(rows) {
  return rows
    .map((r) => r.map((value) => {
      const v = safeCell(value);
      return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(','))
    .join('\r\n');
}
