// Truvio — "Did you mean …?" suggestions for mistyped domains.

import { TYPO_TARGETS, TLD_FIXES } from './lists.js';

/** Edit distance with transpositions (Damerau–Levenshtein, optimal string alignment). */
export function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) d[i][0] = i;
  for (let j = 0; j < cols; j += 1) d[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[rows - 1][cols - 1];
}

/**
 * Suggests a corrected domain, or null when the domain looks fine.
 * @param {string} domain lowercase domain
 */
export function suggestDomain(domain) {
  if (!domain || TYPO_TARGETS.includes(domain)) return null;

  // 1. Close match to a popular provider (gmial.com, yaho.com, hotmial.com)
  let best = null;
  let bestScore = Infinity;
  for (const target of TYPO_TARGETS) {
    const score = editDistance(domain, target);
    const limit = target.length <= 7 ? 1 : 2;
    if (score > 0 && score <= limit && score < bestScore) {
      best = target;
      bestScore = score;
    }
  }
  if (best) return best;

  // 2. Mistyped extension (company.con → company.com)
  const dot = domain.lastIndexOf('.');
  if (dot > 0) {
    const tld = domain.slice(dot + 1);
    if (TLD_FIXES[tld]) return `${domain.slice(0, dot)}.${TLD_FIXES[tld]}`;
  }
  return null;
}
