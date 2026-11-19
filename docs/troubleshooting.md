# 🛠️ Troubleshooting

Find your problem, then try the fixes in order.

---

## Website

### My CSV won't load, or says "no email column"
1. Save the file as **CSV UTF-8** (Excel: *File → Save As → CSV UTF-8*). `.xlsx` files don't work.
2. Give the email column a header such as `email`, `Email Address`, `Work Email` or `E-mail`.
3. Without a header, Email Chekkr picks the column with the most `@` signs, so make sure the addresses are in one column.
4. Keep it to 10,000 rows. Split bigger files.

Try the [sample file](../site/assets/data/email-chekkr-sample.csv) to compare.

### Lots of results say "Unknown"
The DNS lookups timed out. Usually it's a slow or busy network.
1. Wait a minute and run the check again. Successful lookups are remembered, so it's quicker the second time.
2. If you're on an office VPN or a network that blocks `dns.google` and `cloudflare-dns.com`, try another network. The website needs one of them to look up domains.

### The page looks broken or old
Do a hard refresh: **Ctrl + Shift + R** (Windows) or **Cmd + Shift + R** (Mac). GitHub Pages can take a few minutes to show a new version after a merge.

### Excel shows a `'` at the start of some cells
That's on purpose. Cells starting with `=`, `+`, `-` or `@` get a `'` so spreadsheets don't run them as formulas. See [statuses.md](statuses.md#csv-columns).

---

## API

| What you see | Code | Fix |
|---|---|---|
| First request takes about 50 seconds | — | The free Render server was asleep. Later requests are fast. To stop it sleeping, upgrade the Render plan |
| `429 Too Many Requests` | `rate_limited` | Wait the seconds in the `Retry-After` header, or use an API key for higher limits |
| `401` | `api_key_required` | Send the key as `Authorization: Bearer <key>` or `X-API-Key: <key>` |
| `401` | `invalid_api_key` | The key is wrong or was removed. Check `EMAIL_CHEKKR_API_KEYS` on Render |
| `400` | `batch_too_large` | Too many emails in one batch: 50 without a key, 500 with one. Split the list |
| `400` | `invalid_input` | `email` / `emails` / `domain` is missing or isn't text |
| `400` | `invalid_json` | The body isn't valid JSON. Check quotes and commas |
| `413` | `body_too_large` | The body is over 1 MB. Send smaller batches |
| `415` | `unsupported_media_type` | Add the header `Content-Type: application/json` |
| `404` | `not_found` | Wrong path. `GET /` lists every endpoint |
| A browser app gets a CORS error | — | Add the site's address to `EMAIL_CHEKKR_CORS_ORIGINS` on Render |

Check the server is up: open `https://email-chekkr-api.onrender.com/health`. It should show `{"status":"ok"}`.

---

## MCP (AI tools)

### Email Chekkr doesn't show up in my AI app
1. **Restart the app completely** after editing its config. In Claude Desktop that means *Quit*, not just closing the window.
2. Check the JSON is valid: no trailing commas, every `{` has a `}`. Paste it into [jsonlint.com](https://jsonlint.com) if unsure.
3. **Local setup:** the path to `server/stdio.js` must be the **full** path, for example `/Users/you/Email-Chekkr/server/stdio.js` or `C:\\Users\\you\\Email-Chekkr\\server\\stdio.js` (double backslashes in JSON on Windows).
4. **Local setup:** run `node --version` in a terminal. You need Node.js 20 or newer.
5. Run `npm run mcp` in the project folder. You should see `Email Chekkr MCP server ready on stdio`. Press Ctrl + C to stop. If you see an error instead, that's the problem to fix.

### Remote MCP says 401
The `/mcp` endpoint always needs an API key. Check the header is exactly `Authorization: Bearer <your key>`, with one space after `Bearer`.

### Remote MCP says 503 `mcp_disabled`
The server has no API keys set, so MCP is switched off. Add one under Render → email-chekkr-api → Environment → `EMAIL_CHEKKR_API_KEYS`.

### `verify_csv` says the file is too big
One call takes up to 10,000 rows and must stay under 1 MB. Ask the AI to split the file, or use the website's **Bulk check**, which runs in your browser with no upload.

Full setup steps for each app: [mcp-setup.md](mcp-setup.md).

---

## Running it yourself

| Problem | Fix |
|---|---|
| `npm test` fails right after cloning | Run `node --version`. Node.js 20+ is required |
| `npm run serve` says `python3: command not found` | Install Python 3, or use any static file server pointed at the `site/` folder |
| Port 8787 is already in use | Start with another port: `PORT=8790 npm start` |
| CI fails on "Check for secrets" | A real-looking key or personal email address is in a file. Use made-up samples like `jane@example.com` |
| The Docker job fails in CI | Open the job's log. It prints the container's output when the API doesn't start |

Still stuck? [Open an issue](../CONTRIBUTING.md#reporting-a-bug) or use the [contact form](https://nexoradev-stack.github.io/Email-Chekkr/contact.html).
