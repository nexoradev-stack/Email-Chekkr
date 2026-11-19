// Email Chekkr API — mailbox check over SMTP (off by default).
//
// Asks the domain's mail server "would you accept mail for this address?" and hangs up before
// anything is sent. Steps: connect to the MX host on port 25 → EHLO → MAIL FROM → RCPT TO → QUIT.
// No email is ever sent (the DATA command is never used).
//
// To also spot "catch-all" domains (they accept any name), the same connection asks about a random
// address that can't exist. If that one is accepted too, the real address can't be confirmed.
//
// Needs a server that is allowed to connect out on port 25 (many cloud hosts block it),
// with a hostname whose reverse DNS matches EMAIL_CHEKKR_SMTP_HELO. See docs/mailbox-check.md.

import net from 'node:net';
import { randomBytes } from 'node:crypto';

/**
 * Mailbox results (checks.mailbox):
 *   exists       — the mail server accepted the address
 *   not-found    — the mail server said this mailbox doesn't exist (5xx on RCPT TO)
 *   full         — the mailbox exists but is full (552 / 5.2.2)
 *   catch-all    — the server accepts any address on this domain, so this one can't be confirmed
 *   unknown      — no clear answer: timeout, temporary error (4xx), or the server refused to talk to us
 *   not-checked  — the mailbox check is off, or the address/domain failed earlier checks
 */
export const MAILBOX = Object.freeze({
  EXISTS: 'exists',
  NOT_FOUND: 'not-found',
  FULL: 'full',
  CATCH_ALL: 'catch-all',
  UNKNOWN: 'unknown',
  NOT_CHECKED: 'not-checked'
});

// Text that means "we don't like you" rather than "that mailbox doesn't exist".
const POLICY_BLOCK = /(block|blacklist|blocklist|spamhaus|spam|policy|reputation|denied|not allowed|rate|too many|try again|authenticat|reverse|rdns|ptr|helo|relay)/i;
// Text that clearly means "no such user".
const NO_SUCH_USER = /(no such|does not exist|doesn't exist|unknown user|user unknown|not found|invalid recipient|recipient rejected|mailbox unavailable|unrouteable|5\.1\.1|5\.1\.0)/i;

/** Turns one SMTP reply to RCPT TO into a mailbox result. */
export function classifyRcpt(code, text = '') {
  if (code === 250 || code === 251) return MAILBOX.EXISTS;
  if (code === 552 || /5\.2\.2|mailbox full|over quota|quota exceeded/i.test(text)) return MAILBOX.FULL;
  if (code >= 500 && code < 600) {
    if (NO_SUCH_USER.test(text)) return MAILBOX.NOT_FOUND;
    if (POLICY_BLOCK.test(text)) return MAILBOX.UNKNOWN;
    return code === 550 || code === 553 ? MAILBOX.NOT_FOUND : MAILBOX.UNKNOWN;
  }
  return MAILBOX.UNKNOWN; // 4xx and anything odd: temporary, ask again later
}

/**
 * Reads SMTP replies from a socket. A reply can span several lines ("250-..." then "250 ...").
 * @returns {{ next: () => Promise<{ code: number, text: string }>, close: () => void }}
 */
function smtpReader(socket) {
  let buffer = '';
  let lines = [];
  const waiting = [];
  const ready = [];
  let failure = null;

  function flush() {
    while (ready.length && waiting.length) waiting.shift().resolve(ready.shift());
    if (failure) while (waiting.length) waiting.shift().reject(failure);
  }

  socket.on('data', (chunk) => {
    buffer += chunk.toString('latin1');
    if (buffer.length > 64 * 1024) { failure = new Error('Reply too long'); socket.destroy(); flush(); return; }
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      lines.push(line);
      if (/^\d{3}( |$)/.test(line)) {
        ready.push({ code: Number(line.slice(0, 3)), text: lines.map((l) => l.slice(4)).join(' ') });
        lines = [];
      }
    }
    flush();
  });
  const fail = (error) => { failure = failure || error; flush(); };
  socket.on('error', fail);
  socket.on('close', () => fail(new Error('Connection closed')));

  return {
    next: () => new Promise((resolve, reject) => { waiting.push({ resolve, reject }); flush(); })
  };
}

function connect(host, port, timeoutMs, connectImpl) {
  return new Promise((resolve, reject) => {
    const socket = connectImpl({ host, port });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('Connection timed out')); }, timeoutMs);
    socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

/** Runs one SMTP conversation with one MX host. */
async function askHost({ host, port, email, probe, helo, from, timeoutMs, connectImpl }) {
  const socket = await connect(host, port, timeoutMs, connectImpl);
  socket.setTimeout(timeoutMs, () => socket.destroy(new Error('No answer from the mail server')));
  const reader = smtpReader(socket);
  const send = (line) => { socket.write(`${line}\r\n`); return reader.next(); };

  try {
    const greeting = await reader.next();
    if (greeting.code !== 220) return { mailbox: MAILBOX.UNKNOWN, code: greeting.code, message: greeting.text };

    let hello = await send(`EHLO ${helo}`);
    if (hello.code !== 250) hello = await send(`HELO ${helo}`);
    if (hello.code !== 250) return { mailbox: MAILBOX.UNKNOWN, code: hello.code, message: hello.text };

    const mailFrom = await send(`MAIL FROM:<${from}>`);
    if (mailFrom.code !== 250) return { mailbox: MAILBOX.UNKNOWN, code: mailFrom.code, message: mailFrom.text };

    const rcpt = await send(`RCPT TO:<${email}>`);
    const mailbox = classifyRcpt(rcpt.code, rcpt.text);

    let catchAll = null;
    if (probe && mailbox === MAILBOX.EXISTS) {
      const probeReply = await send(`RCPT TO:<${probe}>`);
      catchAll = classifyRcpt(probeReply.code, probeReply.text) === MAILBOX.EXISTS;
    }
    return { mailbox: catchAll ? MAILBOX.CATCH_ALL : mailbox, code: rcpt.code, message: rcpt.text, catchAll };
  } finally {
    // Say goodbye politely, then make sure the connection is gone even if the server doesn't answer
    if (!socket.destroyed) socket.end('QUIT\r\n');
    setTimeout(() => socket.destroy(), 2000).unref();
  }
}

/**
 * Creates the mailbox checker used by the verifier.
 * @param {{ enabled?: boolean, helo: string, from: string, port?: number, timeoutMs?: number,
 *   catchAllProbe?: boolean, maxPerDomain?: number, cacheTtlMs?: number, now?: () => number,
 *   connectImpl?: typeof net.connect }} options
 * @returns {null | ((email: string, domain: string, mxHosts: string[]) => Promise<{ mailbox: string, code?: number, message?: string, host?: string }>)}
 */
export function createMailboxChecker({
  enabled = false, helo, from, port = 25, timeoutMs = 10_000, catchAllProbe = true,
  maxPerDomain = 2, cacheTtlMs = 30 * 60_000, now = Date.now, connectImpl = net.connect
} = {}) {
  if (!enabled) return null;
  if (!helo || !from) throw new Error('Mailbox check needs EMAIL_CHEKKR_SMTP_HELO and EMAIL_CHEKKR_SMTP_FROM');

  const cache = new Map();      // email -> { at, result }
  const busy = new Map();       // domain -> number of open connections
  const queue = new Map();      // domain -> waiting starters

  // At most maxPerDomain open conversations per domain; the rest wait their turn.
  // A finished conversation hands its place straight to the next one waiting.
  async function slot(domain) {
    if ((busy.get(domain) || 0) >= maxPerDomain) {
      await new Promise((resolve) => queue.set(domain, [...(queue.get(domain) || []), resolve]));
    } else {
      busy.set(domain, (busy.get(domain) || 0) + 1);
    }
    return () => {
      const waiting = queue.get(domain);
      if (waiting && waiting.length) waiting.shift()();
      else busy.set(domain, busy.get(domain) - 1);
    };
  }

  return async function checkMailbox(email, domain, mxHosts) {
    const key = email.toLowerCase();
    const hit = cache.get(key);
    if (hit && now() - hit.at < cacheTtlMs) return hit.result;
    if (!mxHosts || mxHosts.length === 0) return { mailbox: MAILBOX.NOT_CHECKED };

    const probe = catchAllProbe ? `chekkr-${randomBytes(6).toString('hex')}@${domain}` : null;
    const release = await slot(domain);
    let result = { mailbox: MAILBOX.UNKNOWN, message: 'Could not reach the mail server' };
    try {
      // Try up to two mail servers, in priority order, if the first can't be reached
      for (const host of mxHosts.slice(0, 2)) {
        try {
          result = { ...(await askHost({ host, port, email, probe, helo, from, timeoutMs, connectImpl })), host };
          break;
        } catch (error) {
          result = { mailbox: MAILBOX.UNKNOWN, message: String(error.message || error), host };
        }
      }
    } finally {
      release();
    }
    // Only remember clear answers; "unknown" may work on the next try
    if (result.mailbox !== MAILBOX.UNKNOWN) cache.set(key, { at: now(), result });
    if (cache.size > 50_000) cache.delete(cache.keys().next().value);
    return result;
  };
}
