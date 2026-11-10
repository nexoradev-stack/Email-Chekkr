#!/usr/bin/env node
// Truvio — fails if the repository contains anything that looks like a secret or a real person's email.
// Runs in CI on every push and pull request.  Run locally: npm run check:secrets

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SKIP = [/^site\/assets\/data\/disposable-domains\.txt$/, /\.(png|jpe?g|gif|ico|webp|woff2?)$/i];

const SECRET_PATTERNS = [
  ['Render API key', /\brnd_[A-Za-z0-9]{20,}/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}/],
  ['OpenAI-style key', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Razorpay key', /\brzp_(live|test)_[A-Za-z0-9]{10,}/],
  ['Stripe key', /\b(sk|rk)_(live|test)_[A-Za-z0-9]{10,}/],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Truvio API key value', /TRUVIO_API_KEYS\s*=\s*[^\s#]+/]
];

// Example addresses must use made-up names. Real mailbox providers are allowed only with these sample names.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PERSONAL_DOMAINS = /@(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|proton|protonmail|aol|zoho|yandex|gmx)\.[a-z.]+$/i;
const SAMPLE_LOCAL_PARTS = /^(sample\.user|sam|jane|someone|test|user|name)$/i;

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !SKIP.some((re) => re.test(f)));

const problems = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of SECRET_PATTERNS) {
      if (re.test(line)) problems.push(`${file}:${i + 1}  ${name}`);
    }
    for (const email of line.match(EMAIL) || []) {
      const local = email.split('@')[0];
      if (PERSONAL_DOMAINS.test(email) && !SAMPLE_LOCAL_PARTS.test(local)) {
        problems.push(`${file}:${i + 1}  Personal-looking email address (use a sample address instead)`);
      }
    }
  });
}

if (problems.length) {
  console.error('Possible secrets or personal details found:\n' + problems.map((p) => '  ' + p).join('\n'));
  process.exit(1);
}
console.log(`No secrets or personal emails found in ${files.length} files.`);
