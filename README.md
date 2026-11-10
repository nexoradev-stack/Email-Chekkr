<div align="center">

# truvio

### Truvio — Email verification

**Clean lists. Fewer bounces.** Check one email or a whole CSV before you send.

[Website](https://nexoradev-stack.github.io/Truvio-Email-verification/) · [How it works](#how-it-works) · [Run it locally](#run-it-locally) · [Roadmap](#roadmap) · [Credits](#credits)

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

## How it works

Everything runs **in the visitor's browser**. There's no server to host.

```text
address ─► format check ─► typo check ─► team-address check ─► disposable list
                                   │
                                   └─► domain lookup (DNS-over-HTTPS: Google, Cloudflare fallback)
                                         MX found?  A/AAAA only?  null MX?  doesn't exist?
                                   │
                                   ▼
                     result (valid / risky / invalid / unknown) + score + reason
```

- **Privacy:** CSV files are read locally and never uploaded. Only the domain part (e.g. `acmecorp.com`) is sent to the public DNS service — never the full address.
- **Speed:** each domain is looked up once per session, and bulk checks run 8 at a time.
- **Safe downloads:** results are added as new columns (`truvio_status`, `truvio_score`, `truvio_reason`, `truvio_suggestion`). Cells that start with `=`, `+`, `-` or `@` are escaped so spreadsheets don't run them as formulas.

---

## Project structure

```text
site/                       the website (published to GitHub Pages)
├── index.html              home: single check, bulk CSV check, result guide, FAQ
├── pricing.html  about.html  contact.html  privacy.html  terms.html  404.html
└── assets/
    ├── css/styles.css
    ├── js/app.js           page behaviour
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
scripts/update-disposable.js   refreshes the disposable domain list
test/engine.test.js            31 tests (no network needed)
```

---

## Run it locally

Needs Node.js 20+ (for tests) and Python 3 (for the preview server).

```bash
npm test          # run the tests
npm run serve     # open http://localhost:8080
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
| 1 | Website, single and bulk checks in the browser | ✅ This release |
| 2 | Accounts, credits and payments (Razorpay) | Planned — pricing to be confirmed |
| 3 | API keys and an MCP server so AI tools can use Truvio | Planned |

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
