// Refreshes site/assets/data/disposable-domains.txt from the community list
// https://github.com/disposable-email-domains/disposable-email-domains (CC0 1.0, public domain).
// Run with: npm run update:disposable
//
// Safety rules:
//   - free providers (site/assets/data/free-providers.txt) are never added, so Gmail-type domains are never "temporary"
//   - the file is only replaced when the download looks complete (at least 1,000 domains, and not much smaller than today)

import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf';
const TARGET = new URL('../site/assets/data/disposable-domains.txt', import.meta.url);
const FREE = new URL('../site/assets/data/free-providers.txt', import.meta.url);
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const MAX_SHRINK = 0.2; // refuse if the new list is more than 20% smaller

const readLines = (url) => {
  try {
    return readFileSync(url, 'utf8').split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
};

const free = new Set(readLines(FREE));
const current = readLines(TARGET);

const res = await fetch(SOURCE);
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status}`);
  process.exit(1);
}

const downloaded = (await res.text())
  .split(/\r?\n/)
  .map((line) => line.trim().toLowerCase())
  .filter((line) => line && !line.startsWith('#') && DOMAIN.test(line));

const skipped = downloaded.filter((d) => free.has(d));
const domains = [...new Set(downloaded.filter((d) => !free.has(d)))].sort();

if (domains.length < 1000) {
  console.error(`Only ${domains.length} domains downloaded — refusing to overwrite the list.`);
  process.exit(1);
}
if (current.length && domains.length < current.length * (1 - MAX_SHRINK)) {
  console.error(`New list has ${domains.length} domains, today's has ${current.length} — too big a drop, refusing to overwrite.`);
  process.exit(1);
}

writeFileSync(TARGET, `${domains.join('\n')}\n`);
const added = domains.filter((d) => !current.includes(d)).length;
console.log(`Saved ${domains.length} disposable domains (${added} new). Skipped ${skipped.length} free providers${skipped.length ? `: ${skipped.join(', ')}` : ''}.`);
