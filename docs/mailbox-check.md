# 📮 Mailbox check (SMTP)

The normal checks look at the address and its **domain**. The mailbox check goes one step further: it asks the domain's mail server whether **this exact mailbox** exists, for example whether Gmail has an account called `jane`.

It is **off by default**, because it needs a server that is allowed to talk to mail servers (see [What you need](#what-you-need)).

## How it works

For each address, the API:

1. connects to the domain's mail server (its MX record) on **port 25**,
2. says hello (`EHLO`) with your server's name,
3. gives a sender (`MAIL FROM`),
4. asks about the address (`RCPT TO`) and reads the answer,
5. asks about a random address that can't exist on the same domain, to spot **catch-all** domains,
6. says goodbye (`QUIT`).

**No email is ever sent.** The `DATA` command, which would carry a message, is never used.

At most 2 connections per domain run at the same time, so mail servers don't see a flood. Clear answers are remembered for 30 minutes.

## What the answers mean

| `checks.mailbox` | The mail server said… | Result |
|---|---|---|
| `exists` | "Yes, I'll take mail for this address" (250) | 🟢 **Valid**, score **99**, **high** confidence: *Mailbox confirmed by the mail server* |
| `not-found` | "No such user" (550 5.1.1 and similar) | 🔴 **Invalid**, score 5: *Mailbox does not exist* |
| `full` | "Mailbox full" (552 / 5.2.2) | 🟠 **Risky**: *Mailbox is full* |
| `catch-all` | Yes, and also yes to a random made-up address | 🟠 **Risky**: *Domain accepts every address, so this mailbox can't be confirmed* |
| `unknown` | Nothing clear: timeout, "try again later" (4xx), or a block such as "listed on Spamhaus" | No change: the normal domain result stands |
| `not-checked` | The check is off, the address is badly formed, the domain failed, or it's a temporary inbox | No change |

A block or a timeout is never turned into "invalid". Only a clear "no such user" is.

## Where it's used

| Where | Mailbox check |
|---|---|
| API `GET/POST /v1/verify` | ✅ when switched on |
| MCP `verify_email` | ✅ when switched on |
| Website single check | ✅ when the API has it switched on. The page says when the address is sent to the server. If the API is off or asleep, the website keeps its normal in-browser result |
| API batch, MCP `verify_emails_batch`, `verify_csv` | Only if `EMAIL_CHEKKR_SMTP_IN_BATCHES=true` (it's slow for big lists) |
| Website bulk CSV | ❌ never. Lists stay in the browser |

## What you need

1. **A server that can connect out on port 25.** Many hosts block it to fight spam, including the big cloud platforms (AWS, Google Cloud, Azure) by default. Render's free plan is unlikely to allow it either. Look for a small VPS whose provider allows port 25, or unblocks it when you ask. Check the provider's rules before you pay.
2. **A hostname with matching reverse DNS (PTR).** For example `verify.yourdomain.com` pointing to the server's IP, and the IP's reverse DNS pointing back to `verify.yourdomain.com`. Without it, big providers often refuse to answer.
3. **A sender address on a domain you own**, such as `verify@yourdomain.com`. Nothing is sent from it, but mail servers look at it.

Run the API there with the [`Dockerfile`](../Dockerfile), like on Render.

## Switching it on

Set these environment variables on the server (see [`.env.example`](../.env.example)):

| Setting | Example | What it does |
|---|---|---|
| `EMAIL_CHEKKR_SMTP_ENABLED` | `true` | Turns the mailbox check on |
| `EMAIL_CHEKKR_SMTP_HELO` | `verify.yourdomain.com` | The name the server gives mail servers. Must match its reverse DNS |
| `EMAIL_CHEKKR_SMTP_FROM` | `verify@yourdomain.com` | The sender used in `MAIL FROM` |
| `EMAIL_CHEKKR_SMTP_TIMEOUT_MS` | `10000` | How long to wait for a mail server (1–60 seconds) |
| `EMAIL_CHEKKR_SMTP_CATCH_ALL` | `true` | Also ask about a random address to spot catch-all domains |
| `EMAIL_CHEKKR_SMTP_MAX_PER_DOMAIN` | `2` | Most connections to one domain at the same time |
| `EMAIL_CHEKKR_SMTP_IN_BATCHES` | `false` | Also check mailboxes in batches and CSV files |
| `EMAIL_CHEKKR_SMTP_PORT` | `25` | Only change this for testing |

Then check it's on: `GET /health` should return `"mailbox_check": true`. The website picks this up by itself; its API address is set in [`site/assets/js/config.js`](../site/assets/js/config.js).

## Limits to know

- **Not every provider tells the truth.** Gmail and Outlook usually answer honestly. Some, such as Yahoo, often accept every address at this stage, so they show as `catch-all`. Many company domains are catch-all too.
- **Your server's reputation matters.** If it checks too many addresses too fast, mail servers start answering "blocked", and results become `unknown`. Keep the per-domain limit low and use batches sparingly.
- **Greylisting.** Some servers answer "try again later" to new senders on purpose. Those show as `unknown`; checking again later usually works.
- It still can't tell you whether the person reads that inbox or agreed to hear from you. See [limitations](limitations.md).
