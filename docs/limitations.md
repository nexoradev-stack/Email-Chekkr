# 🧭 What Email Chekkr can't tell you

Email Chekkr is honest about what it checks. Read this before you rely on a result for anything important.

## 1. "Valid" doesn't prove the mailbox exists

Email Chekkr checks the address format and the **domain**: does it exist, does it have a mail server, is it a temporary inbox service. It does **not** log in to the mail server to ask whether `jane@` exists.

So `jane@example.com` and `made-up-person-123@example.com` get the same result if `example.com` is a healthy domain. That's why every valid result has **medium** confidence.

> The optional [mailbox check](mailbox-check.md) does ask the mail server about the exact mailbox. It needs a server that allows port 25, so it's off until you set one up. Even then it isn't 100%: some providers accept every address, and some refuse to answer.

## 2. Catch-all domains accept everything

Some company domains are set up to accept mail for **any** name. On those, even a fake address looks fine to any checker. With the mailbox check on, Email Chekkr spots these and marks them risky (*catch-all*), but it still can't tell a real name from a fake one there.

## 3. Placeholder names are a guess

`test@`, `sample@`, `fake@`, `asdf@`, `123456@` and similar are marked risky because people type them to get past a form. A real person whose address really is `test@theirdomain.com` will be marked risky too.

## 4. New temporary inbox services slip through

The disposable list has 10,000+ services and is refreshed from a community list (see [disposable-list-updates.md](disposable-list-updates.md)). New services appear all the time, so a brand-new one may be marked valid until the list catches up.

## 5. Team addresses are a guess

`info@`, `sales@`, `support@` and about 50 other common names are flagged as team addresses. A person whose address happens to be `hr@theirname.com` will also be flagged. A team inbox with an unusual name (for example `growth@`) won't be.

## 6. Typo suggestions cover popular providers and common extension slips

Suggestions work for around 20 big providers (`gmial.com` → `gmail.com`) and common extension mistakes (`.con` → `.com`). They won't catch a typo in a company domain (`66degres.com`), because we can't know the right spelling.

## 7. "Unknown" isn't a verdict

A timeout means the DNS server didn't answer in time. Check again later; don't delete the address because of it.

## 8. It can't tell you about inbox placement

Even a perfect address can land in spam because of your sending domain, content or reputation. Email Chekkr only helps with the "is this address worth sending to" part.

## 9. It doesn't prove who owns an address

A valid result says nothing about whether the person gave you the address or agreed to receive email. Only check addresses you have a lawful reason to hold (see the [terms](../site/terms.html)).

## 10. Service limits

| Where | Limit |
|---|---|
| Website single check | No limit |
| Website bulk check | 10,000 rows per CSV |
| API without a key | 30 requests a minute per IP, 50 emails per batch |
| API with a key | 120 requests a minute per key, 500 emails per batch |
| MCP `verify_csv` | 10,000 rows per call, and the request body must be under 1 MB |
| Free Render server | Sleeps after 15 minutes idle; the first request then takes about 50 seconds |

Limits can be changed with the settings in [`.env.example`](../.env.example).
