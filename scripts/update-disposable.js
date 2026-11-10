// Refreshes site/assets/data/disposable-domains.txt from the community list
// https://github.com/disposable-email-domains/disposable-email-domains (CC0 1.0, public domain).
// Run with: npm run update:disposable

import { writeFileSync } from 'node:fs';

const SOURCE = 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf';
const TARGET = new URL('../site/assets/data/disposable-domains.txt', import.meta.url);
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const res = await fetch(SOURCE);
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status}`);
  process.exit(1);
}

const domains = [...new Set(
  (await res.text())
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith('#') && DOMAIN.test(line))
)].sort();

if (domains.length < 1000) {
  console.error(`Only ${domains.length} domains downloaded — refusing to overwrite the list.`);
  process.exit(1);
}

writeFileSync(TARGET, `${domains.join('\n')}\n`);
console.log(`Saved ${domains.length} disposable domains.`);
