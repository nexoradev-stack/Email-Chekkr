# 🙌 Contributing to Email Chekkr

Thanks for helping. This page explains how to report problems, suggest ideas and send changes.

> The main copy of this project is on **GitLab** (`deepanjandasgupta26/Email-Chekkr`), which copies every change to **GitHub** (`nexoradev-stack/Email-Chekkr`). Please open merge requests on GitLab. Changes made directly on GitHub get overwritten by the next copy.

## Reporting a bug

Open an issue with the **Bug report** template. Include:
- what you did (the page, API call or AI prompt),
- what you expected and what happened,
- a **made-up** example address that shows the problem (for example `jane@example.com`). Never paste real customer addresses.

Security problems are different: see [SECURITY.md](SECURITY.md) and don't open a public issue.

## Suggesting an idea

Open an issue with the **Feature request** template. Say what problem it solves and who it's for.

## Sending a change

### 1. Get it running

You need **Node.js 20+** and Python 3 (only for the website preview). There's nothing to install: the project uses only Node's built-in modules.

```bash
npm test                 # all tests (no network needed)
npm run check:secrets    # scan for keys and personal emails
npm run serve            # website at http://localhost:8080
npm start                # API at http://localhost:8787
npm run mcp              # MCP server over stdio
```

### 2. Make your change

- **One checking engine.** The checks live in `site/assets/js/engine/` and run in browsers, the API and the MCP server. Change them there, never in a copy.
- **Lists are data files.** Disposable domains and free providers live in `site/assets/data/` (one domain per line). Team addresses, typo targets and extension fixes are in `site/assets/js/engine/lists.js`.
- **No new dependencies** unless there's no reasonable way without one. Ask in an issue first.
- **Privacy first.** Never send a full email address anywhere; only domains are looked up. Never log or store addresses.
- **Honest results.** Don't claim more than the checks prove. See [docs/limitations.md](docs/limitations.md).
- **Plain words.** Messages users see should read like a person wrote them: short, no jargon.
- **Sample data only.** Use `example.com`-style addresses in code, docs and tests. The secrets scan fails the build otherwise.

### 3. Add tests

Tests live in `test/`, one file per check (`syntax`, `typo`, `dns`, `verify`, `lists`, `csv`, `pool`, `service`, `mcp`, `api`). DNS is faked in `test/helpers.js`, so tests never need the network. Every new behaviour needs a test.

### 4. Open a merge request

- Branch from `main` and give it a short name, like `add-typo-for-outlook`.
- Fill in the merge request template.
- Update [CHANGELOG.md](CHANGELOG.md) under a new version or an "Unreleased" heading.
- CI must pass: tests on Node 20 and 22, the secrets scan, `npm audit`, and the Docker build with a `/health` check.

## Design

The website follows the 66° brand: Night Blue `#040A18`, 66° White `#FFFDF9`, Shark Grey `#B3C5D0` and 66° Blue `#3952FF`. Inter at weights 400 and 500 only, IBM Plex Mono for labels. Green, amber and red appear only on results. Every page must work in light and dark mode and respect reduced motion.

## Credits

| Contributor | Role |
|---|---|
| 👤 **[nexoradev-stack](https://github.com/nexoradev-stack)** | Owner, product and design direction |
| 🤖 **Claude** (Anthropic) | Code, design and docs |
| 🖱️ **Cursor** | AI code editor |

By contributing you agree that your contribution can be used in Email Chekkr under the project's licence terms (see the README).
