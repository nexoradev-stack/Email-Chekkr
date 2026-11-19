# 📝 Changelog

All notable changes to Email Chekkr. Newest first. Dates are in YYYY-MM-DD.

## [0.4.0] — 2026-11-19

### Added
- **Confidence** (`high` / `medium` / `low`) and **provider type** (`disposable` / `free` / `custom`) on every result, next to the score. Shown on the website, in the API, the MCP tools and two new CSV columns (`chekkr_confidence`, `chekkr_provider`).
- **New MCP tools:** `verify_csv` checks a whole CSV file (up to 10,000 rows) and returns it with result columns; `get_statistics` returns totals since the server started (no addresses kept).
- **Free-provider list** moved to its own data file, `site/assets/data/free-providers.txt`, and grown from 36 to 131 domains (Microsoft, Yahoo, GMX, Zoho and Indian, European, Asian and American ISPs).
- **Daily disposable list update** as a scheduled GitLab pipeline that opens a merge request (`.gitlab-ci.yml`). The update script now skips free providers and refuses suspiciously small downloads.
- **About page** with credits, and an About link in every footer.
- **SEO and sharing:** `robots.txt`, `sitemap.xml`, canonical links, Open Graph and Twitter card tags, and a 1200×630 social preview image.
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
