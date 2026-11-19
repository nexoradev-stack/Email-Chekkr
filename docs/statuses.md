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

- Score: **95** (mail server record found).
- Confidence: **medium**. The domain is fine, but Email Chekkr never logs in to the mail server, so the exact mailbox isn't confirmed. See [limitations](limitations.md).

**What to do:** send.

### 🟠 Risky — send with care

The domain takes email, but something is off. The reason tells you which:

| Reason | Score change | Confidence | What to do |
|---|---|---|---|
| Possible typo — did you mean …? | −40 | medium | Fix the address with the suggestion, then check again |
| Disposable (temporary) email domain | −60 | **high** | Remove. These inboxes disappear within hours or days |
| Role address (reaches a team, not a person) | −25 | medium | Keep for business mail; leave out of marketing sends |
| No mail server record; delivery may fail | starts at 75 | medium | Send carefully, or leave out of big sends |

When more than one applies, the score drops for each, and the reason shows the most important one, in the order above.

### 🔴 Invalid — will bounce

| Reason | Score | Meaning |
|---|---|---|
| Format problems (see below) | 0 | The address is not written correctly |
| Domain does not exist | 5 | Nobody owns the domain, or it was mistyped |
| Domain does not accept email | 10 | The domain says it never takes mail (null MX), or has no mail server and no address record |

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
| **medium** | The domain looks fine, or a soft warning applies (typo, team address, no MX record). Every **valid** result is medium, because the mailbox itself isn't checked |
| **low** | The lookup didn't answer, so we can't tell yet |

> When optional mailbox (SMTP) checks are added in a later version, a confirmed mailbox will raise confidence to high.

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

`mx` values: **mx** has a mail server · **a-fallback** no MX record but has an address record · **null-mx** says it never accepts email · **no-mail** no mail server and no address record · **nxdomain** domain doesn't exist · **error** lookup timed out · **not-checked** the address was badly formed, so no lookup was made.
