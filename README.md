<div align="center">

# truvio

### Truvio — Email verification

**Clean lists. Fewer bounces.** Check one email or a whole CSV before you send — on the website, through the API, or from AI tools via MCP.

[Website](https://nexoradev-stack.github.io/Truvio-Email-verification/) · [API](#api) · [Architecture](ARCHITECTURE.md) · [How it works](#how-it-works) · [Run it locally](#run-it-locally) · [Roadmap](#roadmap) · [Credits](#credits)

</div>

---

## What it does

Paste an address, or upload a CSV of up to 10,000 rows. Truvio checks each address and gives it a result and a score from 0 to 100.

| Check | What it looks for |
|---|---|
| Format | One @, allowed characters, length limits, a valid extension. International domains are supported. |
| Domain | The domain exists. |
| Mail server | The domain has an MX record (or at least an address record) and hasn't opted out of email (null MX). |
| Temporary inbox | The domain isn't one of 10,000+ known disposable services. |
| Person or team | The address isn't a team inbox like `info@`, `sales@` or `support@`. |
| Typos | Common mistakes like `gmial.com` or `company.con`, with a "did you mean …?" fix. |

### Results

| Result | Meaning |
|---|---|
| **Valid** | Well-formed, the domain has a mail server, no warning signs. |
| **Risky** | The domain takes email, but there's a warning sign (temporary inbox, team address, likely typo, no MX record). |
| **Invalid** | Badly formed, or the domain doesn't exist or doesn't accept email. |
| **Unknown** | The domain lookup didn't answer in time. Check again later. |

Truvio doesn't log in to mail servers, so **"valid" means the address and its domain look deliverable — not that the exact mailbox was confirmed.**

---

## Design

- **Font:** [Lexend](https://fonts.google.com/specimen/Lexend), chosen for easy reading.
- **Light and dark mode:** follows the visitor's system setting, with a sun/moon toggle in the header. The choice is remembered in the browser.
- **3D hero:** envelopes travel through a scanning ring and come out marked valid (green), risky (amber) or invalid (red). Built with Three.js; it pauses when off-screen, shows a still frame for visitors who prefer reduced motion, and the page works without it.

---

## How it works

Everything runs **in the visitor's browser**. There's no server to host. Full details and diagrams are in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

```text
address ─► format check ─► typo check ─► team-address check ─► disposable list
                                   │
                                   └─► domain lookup (DNS-over-HTTPS: Google, Cloudflare fallback)
                                         MX found?  A/AAAA only?  null MX?  doesn't exist?
                                   │
                                   ▼
                     result (valid / risky / invalid / unknown) + score + reason
```

- **Privacy:** CSV files are read locally and never uploaded. Only the domain part (e.g. `example.com`) is sent to the public DNS service — never the full address.
- **Speed:** each domain is looked up once per session, and bulk checks run 8 at a time.
- **Safe downloads:** results are added as new columns (`truvio_status`, `truvio_score`, `truvio_reason`, `truvio_suggestion`). Cells that start with `=`, `+`, `-` or `@` are escaped so spreadsheets don't run them as formulas.

---

## Project structure

```text
site/                       the website (published to GitHub Pages)
├── index.html              home: single check, bulk CSV check, result guide, FAQ
├── api.html                API docs
├── pricing.html  about.html  contact.html  privacy.html  terms.html  404.html
└── assets/
    ├── css/styles.css
    ├── js/app.js           page behaviour, theme toggle
    ├── js/scene.js         3D hero animation (Three.js)
    ├── js/engine/          the verification engine (runs in browsers and Node)
    │   ├── syntax.js       format rules
    │   ├── typo.js         "did you mean …?" suggestions
    │   ├── dns.js          DNS-over-HTTPS lookups and MX logic
    │   ├── verify.js       combines the checks into a result and score
    │   ├── lists.js        team addresses, free providers, typo targets
    │   └── csv.js          CSV reading/writing
    ├── data/disposable-domains.txt
    ├── data/truvio-sample.csv
    └── img/favicon.svg
server/                     the API and MCP server (Node built-ins only)
├── index.js                starts the HTTP server
├── app.js                  routes, API keys, CORS, limits
├── service.js              verify one, verify many, check domain
├── node-dns.js             DNS lookups with Node's dns module
├── mcp.js  stdio.js        MCP tools; MCP over stdin/stdout
├── rate-limit.js  config.js  runtime.js
Dockerfile  render.yaml  .env.example
examples/                   MCP config and API request examples
ARCHITECTURE.md             how it all works, with diagrams
scripts/update-disposable.js   refreshes the disposable domain list
test/                       45 tests (no network needed)
```

---

## API

A small Node.js server (no npm packages) that runs the same checks for apps, scripts and AI tools. Domain lookups use Node's built-in DNS — no third-party verification service.

```bash
npm start                      # http://localhost:8787
curl "http://localhost:8787/v1/verify?email=sample.user@gmial.com"
```

| Endpoint | What it does |
|---|---|
| `GET /v1/verify?email=` / `POST /v1/verify` | Check one address |
| `POST /v1/verify/batch` | Check a list (`{"emails": [...]}`) |
| `GET /v1/domain?domain=` | Check a domain |
| `POST /mcp` | MCP for AI tools (needs an API key) |
| `GET /health` | Health check |

| | Without a key | With an API key |
|---|---|---|
| Requests per minute | 30 per IP | 120 per key |
| Emails per batch | 50 | 500 |

Settings are environment variables — see [`.env.example`](.env.example). Full docs: [`site/api.html`](site/api.html).

### MCP (AI tools)

Tools: `verify_email`, `verify_emails_batch`, `check_domain`.

- **Remote:** `https://<your-api-address>/mcp` with `Authorization: Bearer <API key>`.
- **Local:** `npm run mcp` (stdio). Example config: [`examples/mcp-config.json`](examples/mcp-config.json).

### Deploy the API

**Render (free plan):** Render → New → Blueprint → pick this repo. It uses [`render.yaml`](render.yaml) and the [`Dockerfile`](Dockerfile), and creates an API key for you (Environment tab).
Anything that runs Docker or Node 20+ works too (Railway, Fly.io, Google Cloud Run).

### Keys and secrets

- API keys live **only** in the host's environment settings (on Render: truvio-api → Environment → `TRUVIO_API_KEYS`). They are never stored in this repository.
- `.env` files are ignored by git. `.env.example` lists the settings with no real values.
- Every push and pull request runs `npm run check:secrets`, which fails if a key, token or personal email address is found.
- All email addresses in the code, docs and tests are made-up samples.

---

## Run it locally

Needs Node.js 20+ (for tests) and Python 3 (for the preview server).

```bash
npm test          # run the tests (engine, API, MCP)
npm run serve     # website at http://localhost:8080
npm start         # API at http://localhost:8787
npm run mcp       # MCP server over stdio
```

Refresh the disposable domain list:

```bash
npm run update:disposable
```

## Publish the website

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions** (one time).
2. Merge to `main`. The **Deploy site** workflow publishes the `site/` folder.
3. The site goes live at `https://nexoradev-stack.github.io/Truvio-Email-verification/`.

---

## Roadmap

| Phase | What | Status |
|---|---|---|
| 1 | Website, single and bulk checks in the browser | ✅ Built |
| 2 | REST API and MCP server for AI tools | ✅ Built — ready to deploy |
| 3 | Accounts, credits and payments (Razorpay), API keys in a database | Planned — pricing to be confirmed |

---

## Credits

| Contributor | Role |
|---|---|
| **[nexoradev-stack](https://github.com/nexoradev-stack)** | Owner, product and design direction |
| **Claude** (Anthropic) | Code, design and docs |
| **Cursor** | AI code editor |

Disposable domain data: [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains) (CC0 1.0, public domain).

## Licence

© 2026 Truvio. All rights reserved. The source is published for transparency; no licence to reuse it is granted.
