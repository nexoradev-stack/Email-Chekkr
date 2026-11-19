# 🔒 Security policy

## Reporting a problem

If you find a security problem in Email Chekkr (the website, the API or the MCP server), **please don't open a public issue.**

Report it privately instead, using either:
- GitHub: **Security → Report a vulnerability** on [nexoradev-stack/Email-Chekkr](https://github.com/nexoradev-stack/Email-Chekkr/security), or
- the [contact form](https://nexoradev-stack.github.io/Email-Chekkr/contact.html), with "Security" in the subject.

Please include what you found, how to reproduce it, and what someone could do with it. We'll reply within 5 working days and tell you when it's fixed. We're happy to credit you in the changelog if you'd like.

## What's supported

Only the latest version on `main` gets security fixes. That's what runs on the live website and API.

## What's in scope

- The website at `nexoradev-stack.github.io/Email-Chekkr`
- The API and MCP server at `email-chekkr-api.onrender.com`
- The code in this repository

Not in scope: rate limits being reachable (they're meant to be), results that are wrong because of the [known limitations](docs/limitations.md), and problems in GitHub, GitLab, Render or the DNS providers themselves.

Please don't run load tests or automated scanners against the live API. It's a small shared server.

## How Email Chekkr protects data

- **Addresses stay private.** The website checks addresses in your browser. Only the domain (for example `example.com`) is looked up, never the full address. CSV files are never uploaded.
- **Nothing is stored.** The API and MCP server don't store or log email addresses. `get_statistics` returns counts only.
- **Keys stay out of the code.** API keys live only in the host's environment settings (`EMAIL_CHEKKR_API_KEYS`). Every push runs `npm run check:secrets`, which fails if a key, token or personal email address appears in the code.
- **Safe downloads.** Result CSVs escape cells starting with `=`, `+`, `-` or `@`, so spreadsheets don't run them as formulas.
- **Limits.** Request bodies are capped (1 MB by default), batches and CSVs have row limits, and every client is rate limited.
- **No dependencies.** The server uses only Node's built-in modules, so there are no third-party packages to go bad. CI still runs `npm audit` in case that changes.
- **No tracking.** The website sets no cookies and loads no analytics or ad scripts.
