# 🤖 Connect Email Chekkr to your AI tool

MCP (Model Context Protocol) lets an AI assistant call Email Chekkr's tools itself. Once connected, you can say *"check these 30 emails"* or *"clean this CSV"* and the assistant checks them for real instead of guessing.

## The tools your AI gets

| Tool | What it does |
|---|---|
| `verify_email` | Checks one address |
| `verify_emails_batch` | Checks up to 500 addresses at once |
| `verify_csv` | Checks a whole CSV (up to 10,000 rows) and returns it with result columns added |
| `check_domain` | Checks a domain: does it exist, take email, is it disposable or free |
| `get_statistics` | Totals since the server started (no addresses are kept) |

## Pick a way to connect

| | 🌐 Remote (easiest) | 💻 Local |
|---|---|---|
| What runs where | Our server on Render does the checks | Email Chekkr runs on your own computer |
| You need | An **API key** (ask via the [contact form](https://nexoradev-stack.github.io/Email-Chekkr/contact.html)) | **Node.js 20+** and a copy of this repository |
| Address | `https://email-chekkr-api.onrender.com/mcp` | `node /full/path/to/Email-Chekkr/server/stdio.js` |

In every example below:
- replace `YOUR_API_KEY` with your key, and
- replace `/full/path/to/Email-Chekkr` with where you saved the project (Windows example: `C:\\Users\\you\\Email-Chekkr`, with double backslashes inside JSON).

> 🔐 Never put a real API key in a file you commit to Git. The user-level config files below live in your home folder, outside any project.

**Local setup, done once:** download the project (GitHub → **Code → Download ZIP**, then unzip), or clone it with Git. There's nothing to install: Email Chekkr uses only Node's built-in modules. To check it works, open a terminal in the folder and run `npm run mcp`. You should see `Email Chekkr MCP server ready on stdio`. Press Ctrl + C to stop it.

---

## Claude Desktop

1. Open Claude Desktop → **Settings → Developer → Edit Config**. This opens `claude_desktop_config.json`:
   - Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
2. Paste **one** of these (if the file already has `mcpServers`, add the `email-chekkr` part inside it):

   **Local**
   ```json
   {
     "mcpServers": {
       "email-chekkr": {
         "command": "node",
         "args": ["/full/path/to/Email-Chekkr/server/stdio.js"]
       }
     }
   }
   ```

   **Remote**: Claude Desktop starts remote servers through the small `mcp-remote` helper, which adds your key to every request:
   ```json
   {
     "mcpServers": {
       "email-chekkr": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "https://email-chekkr-api.onrender.com/mcp", "--header", "Authorization:${AUTH_HEADER}"],
         "env": { "AUTH_HEADER": "Bearer YOUR_API_KEY" }
       }
     }
   }
   ```
   (The key goes in `env` because some systems break a header that has a space inside `args`.)
3. Save the file, then **quit Claude Desktop completely** and open it again.
4. Click the tools (🔨) icon in the chat box. You should see the five Email Chekkr tools.
5. Try it: *"Use Email Chekkr to check sample.user@gmial.com"*.

> Claude's **custom connectors** (Settings → Connectors) need servers that sign in with OAuth. Email Chekkr uses API keys instead, so use the config file above.

## Claude Code

Run one of these in a terminal. `--scope user` makes it available in every project.

**Remote**
```bash
claude mcp add --scope user --transport http email-chekkr https://email-chekkr-api.onrender.com/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

**Local**
```bash
claude mcp add --scope user email-chekkr -- node /full/path/to/Email-Chekkr/server/stdio.js
```

Check it with `claude mcp list`, or type `/mcp` inside Claude Code.

## Cursor

1. Open (or create) `~/.cursor/mcp.json` to use it in every project, or `.cursor/mcp.json` inside one project.
2. Paste one of these:

   **Remote**
   ```json
   {
     "mcpServers": {
       "email-chekkr": {
         "url": "https://email-chekkr-api.onrender.com/mcp",
         "headers": { "Authorization": "Bearer ${env:EMAIL_CHEKKR_API_KEY}" }
       }
     }
   }
   ```
   Then set `EMAIL_CHEKKR_API_KEY` as an environment variable on your computer, or replace `${env:EMAIL_CHEKKR_API_KEY}` with the key itself, but only in the `~/.cursor` file, never in a project file you commit.

   **Local**
   ```json
   {
     "mcpServers": {
       "email-chekkr": {
         "command": "node",
         "args": ["/full/path/to/Email-Chekkr/server/stdio.js"]
       }
     }
   }
   ```
3. Open **Cursor Settings → MCP** (called *Tools & MCP* in newer versions). Email Chekkr should show a green dot. If not, toggle it off and on.
4. In Agent chat, ask: *"Check these emails with Email Chekkr: …"*.

## Gemini CLI

1. Open `~/.gemini/settings.json` (every project) or `.gemini/settings.json` (one project).
2. Add one of these inside the top-level `{ }`:

   **Remote**: remote Streamable HTTP servers use `httpUrl`:
   ```json
   {
     "mcpServers": {
       "email-chekkr": {
         "httpUrl": "https://email-chekkr-api.onrender.com/mcp",
         "headers": { "Authorization": "Bearer $EMAIL_CHEKKR_API_KEY" },
         "timeout": 30000
       }
     }
   }
   ```
   Set `EMAIL_CHEKKR_API_KEY` in your terminal first (for example `export EMAIL_CHEKKR_API_KEY=...`).

   **Local**
   ```json
   {
     "mcpServers": {
       "email-chekkr": {
         "command": "node",
         "args": ["/full/path/to/Email-Chekkr/server/stdio.js"]
       }
     }
   }
   ```
3. Start `gemini` and type `/mcp`. Email Chekkr should be listed as connected, with its five tools.

> The `timeout` gives the free Render server time to wake up (about 50 seconds after 15 idle minutes). If the first call still times out, just ask again.

## Any other MCP app

Remote servers: Streamable HTTP at `https://email-chekkr-api.onrender.com/mcp`, header `Authorization: Bearer YOUR_API_KEY` (or `X-API-Key: YOUR_API_KEY`). Requests are `POST` with JSON-RPC 2.0. Local servers: run `node server/stdio.js`, one JSON message per line over stdin/stdout.

Supported protocol versions: `2025-06-18`, `2025-03-26`, `2024-11-05`.

---

## Good things to ask your AI

- *"Check jane@gmial.com and tell me what's wrong with it."*
- *"Here's my event signup list. Which addresses should I remove before sending?"* (attach the CSV)
- *"Clean this CSV with Email Chekkr and give me only the valid rows."*
- *"Is acme-corp.io a real domain that receives email?"*
- *"How many emails has the Email Chekkr server checked so far?"*

Something not working? See [troubleshooting](troubleshooting.md#mcp-ai-tools).
