# 📝 Changelog

All notable changes to Email Chekkr. Newest first. Dates are in YYYY-MM-DD.

## [Unreleased]

### Added
- **Mailbox check (SMTP), off by default.** The API can ask the domain's mail server whether the exact mailbox exists (`checks.mailbox`: `exists`, `not-found`, `full`, `catch-all`, `unknown`), without sending any email. A confirmed mailbox is valid with score 99 and high confidence; "no such user" is invalid. Catch-all domains are spotted with a random-address probe. Needs a server that allows port 25; see `docs/mailbox-check.md`.
- The website's single check uses the API's mailbox check when it's on, and says so next to the check. Bulk CSV checks stay in the browser.
- **Placeholder names** like `test@`, `sample@`, `fake@`, `asdf@` and `123456@` are now risky (`checks.placeholder`), so made-up addresses at Gmail and similar providers no longer show as valid.
- `/health` reports `mailbox_check`; `get_statistics` reports mailboxes checked.

### Fixed
- The API's home page (`GET /`) linked to an old docs address.

### Changed
- The daily disposable list update now runs on **GitHub Actions** (`.github/workflows/update-disposable.yml`) and opens the merge request on GitLab. GitLab.com needs card verification to run jobs, so `.gitlab-ci.yml` is removed; this also stops the empty failed pipelines on GitLab.

## [0.4.0] — 2026-11-19

### Added
- **Confidence** (`high` / `medium` / `low`) and **provider type** (`disposable` / `free` / `custom`) on every result, next to the score. Shown on the website, in the API, the MCP tools and two new CSV columns (`chekkr_confidence`, `chekkr_provider`).
- **New MCP tools:** `verify_csv` checks a whole CSV file (up to 10,000 rows) and returns it with result columns; `get_statistics` returns totals since the server started (no addresses kept).
- **Free-provider list** moved to its own data file, `site/assets/data/free-providers.txt`, and grown from 36 to 131 domains (Microsoft, Yahoo, GMX, Zoho and Indian, European, Asian and American ISPs).
- **Daily disposable list update** that opens a merge request. The update script now skips free providers and refuses suspiciously small downloads.
- **About page** with credits, and an About link in every footer.
- **SEO and sharing:** `robots.txt`, `sitemap.xml`, canonical links, Open Graph and Twitter card tags, and a 1200×630 social preview image, built from `docs/assets/og-image.svg` on every deploy.
- **Docs folder:** results explained, limitations, troubleshooting, MCP setup for Claude, Claude Code, Cursor and Gemini CLI, and disposable list updates.
- `CONTRIBUTING.md`, `SECURITY.md`, this changelog, and issue / pull request / merge request templates.
- New settings: `EMAIL_CHEKKR_CSV_MAX_ROWS`, `EMAIL_CHEKKR_FREE_PROVIDERS_PATH`.

### Changed
- Tests split into one file per check, with 76 tests in all (up from 45).
- CI also runs `npm audit`, builds the Docker image, starts it and checks `/health`.
- The Docker image now includes the free-provider list.

### Fixed
- `sify.com` was on both the free and the disposable list. It's now only on the disposable list, and a test makes sure the lists never overlap.

## [0.3.0] — 2026-11-11

### Changed
- Renamed to **Email Chekkr** and rebuilt the website in the 66° colours (Night Blue, 66° White, Shark Grey, 66° Blue) with Inter and IBM Plex Mono, light and dark mode, and a CSS-only spinning globe hero.
- Removed every reference to the old name.

## [0.2.0] — 2026-11-10

### Added
- REST API (`/v1/verify`, `/v1/verify/batch`, `/v1/domain`) with API keys and rate limits, deployable to Render.
- MCP server over HTTP (`POST /mcp`) and stdio, with `verify_email`, `verify_emails_batch` and `check_domain`.
- Secrets scan on every push (`npm run check:secrets`).
- Colourful README and `ARCHITECTURE.md` with diagrams.

## [0.1.0] — 2026-11-10

### Added
- First website with single and bulk CSV checks running entirely in the browser: format, domain, mail server, temporary inboxes, team addresses and typos.
