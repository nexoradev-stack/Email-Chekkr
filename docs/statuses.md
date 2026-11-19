# 🚦 Results explained

Every address Email Chekkr checks gets:

| Field | What it is |
|---|---|
| **status** | `valid`, `risky`, `invalid` or `unknown` (below) |
| **score** | 0 to 100. Higher is safer to send to |
| **confidence** | `high`, `medium` or `low`. How sure we are about the status |
| **provider_type** | `disposable`, `free`, `custom`, or empty when the address is badly formed |
| **reason** | One plain sentence explaining the result |
| **suggestion** | A corrected address when we spot a typo, otherwise empty |

The website, the API and the MCP tools all use the same engine, so a result is the same everywhere.

---

## The four statuses

### 🟢 Valid — safe to send

The address is written correctly, the domain exists, it has a mail server, and there are no warning signs.

- Score: **95** (mail server record found), confidence **medium**: the domain is fine, but the exact mailbox isn't confirmed.
- With the [mailbox check](mailbox-check.md) on and the mail server confirming it: score **99**, confidence **high**, reason *Mailbox confirmed by the mail server*.

**What to do:** send.

### 🟠 Risky — send with care

The domain takes email, but something is off. The reason tells you which:

| Reason | Score change | Confidence | What to do |
|---|---|---|---|
| Possible typo — did you mean …? | −40 | medium | Fix the address with the suggestion, then check again |
| Disposable (temporary) email domain | −60 | **high** | Remove. These inboxes disappear within hours or days |
| Looks like a placeholder address (like test@ or sample@), not a real person | −45 | medium | Ask for a real address; these are usually typed to skip a form |
| Role address (reaches a team, not a person) | −25 | medium | Keep for business mail; leave out of marketing sends |
| No mail server record; delivery may fail | starts at 75 | medium | Send carefully, or leave out of big sends |
| Mailbox is full, so email will bounce for now ¹ | −40 | medium | Try again in a few days |
| Domain accepts every address (catch-all), so this mailbox can't be confirmed ¹ | −20 | medium | Send carefully; there's no way to confirm it |

¹ Only when the [mailbox check](mailbox-check.md) is on.

When more than one applies, the score drops for each, and the reason shows the most important one, in the order above.

### 🔴 Invalid — will bounce

| Reason | Score | Meaning |
|---|---|---|
| Format problems (see below) | 0 | The address is not written correctly |
| Domain does not exist | 5 | Nobody owns the domain, or it was mistyped |
| Domain does not accept email | 10 | The domain says it never takes mail (null MX), or has no mail server and no address record |
| Mailbox does not exist (the mail server said so) | 5 | Only with the [mailbox check](mailbox-check.md) on: the mail server said there's no such user |

Confidence is always **high**. **What to do:** remove, or fix it if there's a suggestion.

#### Format reasons

| Reason | Example |
|---|---|
| Empty value | an empty cell |
| Missing @ or missing part before/after it | `janeexample.com` |
| Contains more than one @ | `jane@@example.com` |
| Contains spaces | `jane doe@example.com` |
| Address is longer than 254 characters | — |
| Part before @ is longer than 64 characters | — |
| Part before @ has characters that are not allowed | `jane(at)@example.com` |
| Dots are misplaced in the part before @ | `.jane@example.com`, `sample..user@example.com` |
| Domain has no extension (like .com) | `jane@example` |
| Domain extension is not valid | `jane@example.c` |
| Domain has characters that are not allowed | `jane@acme_corp.com` |
| Domain is not valid | — |
| IP-address domains are not supported | `jane@[192.0.2.1]` |

### ⚪ Unknown — try again later

The domain lookup didn't answer in time (reason: *Domain lookup timed out — try again*).

- Score: **50**. Confidence: **low**.
- This is **not** the same as invalid. It's usually a slow DNS server, and a second check a few minutes later normally works.

---

## Confidence

Confidence is separate from the score. The score says *how safe the address is*; confidence says *how sure we are about the status*.

| Confidence | When |
|---|---|
| **high** | The evidence is clear: badly formed, domain doesn't exist, domain refuses email, or a known temporary inbox |
| **medium** | The domain looks fine, or a soft warning applies (typo, placeholder, team address, no MX record, catch-all). A **valid** result is medium unless the mailbox check confirmed the mailbox |
| **low** | The lookup didn't answer, so we can't tell yet |

> With the [mailbox check](mailbox-check.md) on, a confirmed mailbox raises confidence to **high**, and "no such user" from the mail server is **high**-confidence invalid.

## Provider type

| Value | Meaning | Example |
|---|---|---|
| `disposable` | A temporary inbox service. Comes from the [disposable list](../site/assets/data/disposable-domains.txt) | `mailinator.com` |
| `free` | A free personal mailbox. Not a problem by itself; it just isn't a company address. Comes from the [free-provider list](../site/assets/data/free-providers.txt) | `gmail.com`, `outlook.com`, `rediffmail.com` |
| `custom` | Any other domain, usually a company or personal domain | `66degrees.com` |
| empty / `null` | The address is badly formed, so there is no domain to judge | `not-an-email` |

If a domain were somehow on both lists, `disposable` wins. A test makes sure the two lists never overlap.

---

## CSV columns

A checked CSV (from the website's **Bulk check** or the MCP `verify_csv` tool) keeps all your columns and adds these at the end:

| Column | Holds |
|---|---|
| `chekkr_status` | valid / risky / invalid / unknown |
| `chekkr_score` | 0–100 |
| `chekkr_reason` | the reason sentence |
| `chekkr_suggestion` | the corrected address, if any |
| `chekkr_confidence` | high / medium / low |
| `chekkr_provider` | disposable / free / custom |

Cells that start with `=`, `+`, `-` or `@` get a `'` in front, so Excel and Google Sheets show them as text instead of running them as formulas.

## The `checks` object (API and MCP)

| Key | Values |
|---|---|
| `syntax` | `true` / `false` |
| `domain` | the domain in ASCII form (international domains are converted), or `null` |
| `mx` | `mx`, `a-fallback`, `null-mx`, `no-mail`, `nxdomain`, `error`, or `not-checked` |
| `disposable` | `true` / `false` |
| `role` | `true` / `false` |
| `free` | `true` / `false` |
| `placeholder` | `true` when the part before @ looks made up (`test`, `sample`, `fake`, `asdf`, `123456` …) |
| `mailbox` | `exists`, `not-found`, `full`, `catch-all`, `unknown` or `not-checked`. See [mailbox check](mailbox-check.md) |

`mx` values: **mx** has a mail server · **a-fallback** no MX record but has an address record · **null-mx** says it never accepts email · **no-mail** no mail server and no address record · **nxdomain** domain doesn't exist · **error** lookup timed out · **not-checked** the address was badly formed, so no lookup was made.
