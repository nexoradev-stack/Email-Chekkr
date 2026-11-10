// Truvio — email syntax check.
// Practical RFC 5321/5322 rules used by real mail systems (not the full, rarely-used RFC grammar).

const LOCAL_ALLOWED = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * Converts an international domain (e.g. "bücher.de") to its ASCII form ("xn--bcher-kva.de").
 * Returns null if the domain can't be converted.
 */
export function toAsciiDomain(domain) {
  try {
    return new URL(`http://${domain}`).hostname;
  } catch {
    return null;
  }
}

/**
 * Checks the shape of an email address.
 * @param {string} input
 * @returns {{ ok: boolean, reason?: string, email: string, local?: string, domain?: string, asciiDomain?: string }}
 */
export function checkSyntax(input) {
  const email = String(input ?? '').trim();

  if (!email) return { ok: false, reason: 'Empty value', email };
  if (email.length > 254) return { ok: false, reason: 'Address is longer than 254 characters', email };
  if (/\s/.test(email)) return { ok: false, reason: 'Contains spaces', email };

  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return { ok: false, reason: 'Missing @ or missing part before/after it', email };
  if (email.indexOf('@') !== at) return { ok: false, reason: 'Contains more than one @', email };

  const local = email.slice(0, at);
  const domainRaw = email.slice(at + 1);

  if (local.length > 64) return { ok: false, reason: 'Part before @ is longer than 64 characters', email };
  if (!LOCAL_ALLOWED.test(local)) return { ok: false, reason: 'Part before @ has characters that are not allowed', email };
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return { ok: false, reason: 'Dots are misplaced in the part before @', email };
  }

  if (domainRaw.startsWith('[')) return { ok: false, reason: 'IP-address domains are not supported', email };

  const asciiDomain = toAsciiDomain(domainRaw.replace(/\.$/, ''));
  if (!asciiDomain || asciiDomain.length > 253) return { ok: false, reason: 'Domain is not valid', email };

  const labels = asciiDomain.split('.');
  if (labels.length < 2) return { ok: false, reason: 'Domain has no extension (like .com)', email };
  if (!labels.every((l) => LABEL.test(l))) return { ok: false, reason: 'Domain has characters that are not allowed', email };
  if (!TLD.test(labels[labels.length - 1])) return { ok: false, reason: 'Domain extension is not valid', email };

  return {
    ok: true,
    email,
    local,
    domain: domainRaw.toLowerCase(),
    asciiDomain
  };
}
