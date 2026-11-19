// Email Chekkr — mailbox (SMTP) check tests. A fake mail server runs on this computer,
// so no real mail server is contacted and nothing leaves the machine.

import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createMailboxChecker, classifyRcpt, MAILBOX } from '../server/smtp.js';

/**
 * Starts a fake SMTP server. `rcpt(address)` decides the reply to each RCPT TO.
 * Every command received is recorded in `commands`.
 */
async function fakeSmtp({ rcpt = () => '250 2.1.5 OK', greeting = '220 mx.test ESMTP ready', ehlo = '250-mx.test\r\n250 SIZE 1000' } = {}) {
  const commands = [];
  const server = net.createServer((socket) => {
    socket.write(`${greeting}\r\n`);
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      let i;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        commands.push(line);
        const verb = line.split(/[ :]/)[0].toUpperCase();
        if (verb === 'EHLO') socket.write(ehlo === null ? '502 5.5.2 EHLO not supported\r\n' : `${ehlo}\r\n`);
        else if (verb === 'HELO') socket.write('250 mx.test\r\n');
        else if (verb === 'MAIL') socket.write('250 2.1.0 OK\r\n');
        else if (verb === 'RCPT') socket.write(`${rcpt(line.match(/<(.*)>/)[1])}\r\n`);
        else if (verb === 'QUIT') { socket.write('221 2.0.0 Bye\r\n'); socket.end(); }
        else socket.write('502 5.5.1 Unrecognized command\r\n');
      }
    });
    socket.on('error', () => {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { port: server.address().port, commands, close: () => new Promise((r) => server.close(r)) };
}

const options = (port, extra = {}) => ({
  enabled: true, helo: 'verify.example.com', from: 'verify@example.com', port, timeoutMs: 2000, ...extra
});

test('classifyRcpt: reads common mail server answers', () => {
  assert.equal(classifyRcpt(250, 'OK'), MAILBOX.EXISTS);
  assert.equal(classifyRcpt(251, 'User not local; will forward'), MAILBOX.EXISTS);
  assert.equal(classifyRcpt(550, '5.1.1 The email account that you tried to reach does not exist'), MAILBOX.NOT_FOUND);
  assert.equal(classifyRcpt(550, 'Requested action not taken: mailbox unavailable'), MAILBOX.NOT_FOUND);
  assert.equal(classifyRcpt(552, '5.2.2 Mailbox full'), MAILBOX.FULL);
  assert.equal(classifyRcpt(550, '5.7.1 Service unavailable; client host blocked using Spamhaus'), MAILBOX.UNKNOWN);
  assert.equal(classifyRcpt(554, 'Rejected by policy'), MAILBOX.UNKNOWN);
  assert.equal(classifyRcpt(451, '4.7.1 Greylisted, try again later'), MAILBOX.UNKNOWN);
  assert.equal(classifyRcpt(421, 'Too many connections'), MAILBOX.UNKNOWN);
});

test('checker: off by default, and needs a HELO name and a sender when on', () => {
  assert.equal(createMailboxChecker({}), null);
  assert.equal(createMailboxChecker({ enabled: false, helo: 'x', from: 'y' }), null);
  assert.throws(() => createMailboxChecker({ enabled: true }), /SMTP_HELO/);
});

test('checker: mailbox exists, and no email is ever sent', async () => {
  const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('chekkr-') ? '550 5.1.1 No such user' : '250 2.1.5 OK') });
  try {
    const check = createMailboxChecker(options(smtp.port));
    const r = await check('jane@example.com', 'example.com', ['127.0.0.1']);
    assert.equal(r.mailbox, MAILBOX.EXISTS);
    assert.equal(r.host, '127.0.0.1');
    assert.ok(smtp.commands.includes('EHLO verify.example.com'));
    assert.ok(smtp.commands.includes('MAIL FROM:<verify@example.com>'));
    assert.ok(smtp.commands.includes('RCPT TO:<jane@example.com>'));
    assert.ok(smtp.commands.some((c) => /^RCPT TO:<chekkr-[0-9a-f]{12}@example\.com>$/.test(c)), 'catch-all probe');
    assert.ok(!smtp.commands.some((c) => /^DATA/i.test(c)), 'never sends DATA');
    for (let i = 0; i < 50 && smtp.commands.at(-1) !== 'QUIT'; i += 1) await new Promise((r) => setTimeout(r, 20));
    assert.equal(smtp.commands.at(-1), 'QUIT', 'says goodbye politely');
  } finally { await smtp.close(); }
});

test('checker: mailbox does not exist', async () => {
  const smtp = await fakeSmtp({ rcpt: () => '550-5.1.1 The email account that you tried to reach does not exist.\r\n550 5.1.1 Please try again.' });
  try {
    const r = await createMailboxChecker(options(smtp.port))('jane@gmail.com', 'gmail.com', ['127.0.0.1']);
    assert.equal(r.mailbox, MAILBOX.NOT_FOUND);
    assert.equal(r.code, 550);
    assert.match(r.message, /does not exist/);
    assert.equal(smtp.commands.filter((c) => c.startsWith('RCPT')).length, 1, 'no probe needed after a no');
  } finally { await smtp.close(); }
});

test('checker: catch-all domain (accepts a random address too)', async () => {
  const smtp = await fakeSmtp();
  try {
    const r = await createMailboxChecker(options(smtp.port))('jane@example.com', 'example.com', ['127.0.0.1']);
    assert.equal(r.mailbox, MAILBOX.CATCH_ALL);
  } finally { await smtp.close(); }
});

test('checker: catch-all probe can be turned off', async () => {
  const smtp = await fakeSmtp();
  try {
    const r = await createMailboxChecker(options(smtp.port, { catchAllProbe: false }))('jane@example.com', 'example.com', ['127.0.0.1']);
    assert.equal(r.mailbox, MAILBOX.EXISTS);
    assert.equal(smtp.commands.filter((c) => c.startsWith('RCPT')).length, 1);
  } finally { await smtp.close(); }
});

test('checker: full mailbox, greylisting and blocks', async () => {
  for (const [reply, expected] of [
    ['552 5.2.2 Mailbox full', MAILBOX.FULL],
    ['451 4.7.1 Greylisted, try again later', MAILBOX.UNKNOWN],
    ['550 5.7.1 Client host blocked using Spamhaus', MAILBOX.UNKNOWN]
  ]) {
    const smtp = await fakeSmtp({ rcpt: () => reply });
    try {
      const r = await createMailboxChecker(options(smtp.port))('jane@example.com', 'example.com', ['127.0.0.1']);
      assert.equal(r.mailbox, expected, reply);
    } finally { await smtp.close(); }
  }
});

test('checker: server that refuses to talk is unknown', async () => {
  const smtp = await fakeSmtp({ greeting: '554 5.7.1 No service for you' });
  try {
    const r = await createMailboxChecker(options(smtp.port))('jane@example.com', 'example.com', ['127.0.0.1']);
    assert.equal(r.mailbox, MAILBOX.UNKNOWN);
    assert.equal(r.code, 554);
  } finally { await smtp.close(); }
});

test('checker: falls back to HELO when EHLO is refused', async () => {
  const smtp = await fakeSmtp({ ehlo: null, rcpt: (a) => (a.startsWith('chekkr-') ? '550 5.1.1 No such user' : '250 OK') });
  try {
    const r = await createMailboxChecker(options(smtp.port))('jane@example.com', 'example.com', ['127.0.0.1']);
    assert.equal(r.mailbox, MAILBOX.EXISTS);
    assert.ok(smtp.commands.includes('EHLO verify.example.com'));
    assert.ok(smtp.commands.includes('HELO verify.example.com'));
  } finally { await smtp.close(); }
});

test('checker: unreachable first mail server, second one answers', async () => {
  const smtp = await fakeSmtp({ rcpt: (a) => (a.startsWith('chekkr-') ? '550 5.1.1 No such user' : '250 OK') });
  try {
    const hosts = [];
    const connectImpl = ({ host, port }) => {
      hosts.push(host);
      return net.connect({ host: '127.0.0.1', port: host === 'down.example' ? 1 : port });
    };
    const r = await createMailboxChecker(options(smtp.port, { connectImpl }))('jane@example.com', 'example.com', ['down.example', 'up.example']);
    assert.equal(r.mailbox, MAILBOX.EXISTS);
    assert.deepEqual(hosts, ['down.example', 'up.example']);
  } finally { await smtp.close(); }
});

test('checker: nothing listening at all is unknown, not invalid', async () => {
  const r = await createMailboxChecker(options(1))('jane@example.com', 'example.com', ['127.0.0.1']);
  assert.equal(r.mailbox, MAILBOX.UNKNOWN);
});

test('checker: a silent server times out as unknown', async () => {
  const server = net.createServer(() => {}); // accepts, never answers
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const started = Date.now();
    const r = await createMailboxChecker(options(server.address().port, { timeoutMs: 1000 }))('jane@example.com', 'example.com', ['127.0.0.1']);
    assert.equal(r.mailbox, MAILBOX.UNKNOWN);
    assert.ok(Date.now() - started < 5000);
  } finally {
    server.close();
  }
});

test('checker: clear answers are remembered, unclear ones are asked again', async () => {
  let rcptCount = 0;
  const smtp = await fakeSmtp({ rcpt: (a) => { rcptCount += 1; return a.startsWith('jane') ? '550 5.1.1 No such user' : '451 Try again later'; } });
  try {
    const check = createMailboxChecker(options(smtp.port));
    await check('jane@example.com', 'example.com', ['127.0.0.1']);
    await check('JANE@example.com', 'example.com', ['127.0.0.1']);
    assert.equal(rcptCount, 1, 'second answer came from memory');
    await check('sam@example.com', 'example.com', ['127.0.0.1']);
    await check('sam@example.com', 'example.com', ['127.0.0.1']);
    assert.equal(rcptCount, 3, 'unknown answers are not remembered');
  } finally { await smtp.close(); }
});

test('checker: at most two connections per domain at once', async () => {
  let open = 0;
  let peak = 0;
  const server = net.createServer((socket) => {
    open += 1; peak = Math.max(peak, open);
    socket.on('close', () => { open -= 1; });
    socket.write('220 ready\r\n');
    socket.on('data', (chunk) => {
      for (const line of chunk.toString().split('\r\n').filter(Boolean)) {
        if (/^QUIT/.test(line)) { socket.end('221 bye\r\n'); continue; }
        setTimeout(() => socket.write(/^RCPT/.test(line) ? '550 5.1.1 No such user\r\n' : '250 OK\r\n'), 30);
      }
    });
    socket.on('error', () => {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    // Count connections from the checker's side: open from connect until the checker lets go
    let clientOpen = 0;
    let clientPeak = 0;
    const connectImpl = (opts) => {
      const socket = net.connect(opts);
      clientOpen += 1; clientPeak = Math.max(clientPeak, clientOpen);
      let counted = true;
      const done = () => { if (counted) { counted = false; clientOpen -= 1; } };
      socket.on('end', done); socket.on('close', done);
      const end = socket.end.bind(socket);
      socket.end = (...args) => { done(); return end(...args); };
      return socket;
    };
    const check = createMailboxChecker(options(server.address().port, { connectImpl }));
    const emails = ['a1', 'a2', 'a3', 'a4', 'a5'].map((n) => `${n}@example.com`);
    const results = await Promise.all(emails.map((e) => check(e, 'example.com', ['127.0.0.1'])));
    assert.ok(results.every((r) => r.mailbox === MAILBOX.NOT_FOUND));
    assert.ok(clientPeak <= 2, `peak was ${clientPeak}`);
    assert.ok(peak >= 1);
  } finally {
    server.close();
  }
});

test('checker: no mail servers means not checked', async () => {
  const check = createMailboxChecker(options(25));
  assert.equal((await check('jane@example.com', 'example.com', [])).mailbox, MAILBOX.NOT_CHECKED);
});
