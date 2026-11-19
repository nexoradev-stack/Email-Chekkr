# 🧭 What Email Chekkr can't tell you

Email Chekkr is honest about what it checks. Read this before you rely on a result for anything important.

## 1. "Valid" doesn't prove the mailbox exists

Email Chekkr checks the address format and the **domain**: does it exist, does it have a mail server, is it a temporary inbox service. It does **not** log in to the mail server to ask whether `jane@` exists.

So `jane@example.com` and `made-up-person-123@example.com` get the same result if `example.com` is a healthy domain. That's why every valid result has **medium** confidence.

> Mailbox (SMTP) checks are planned as an optional extra. Even then, many big providers (Gmail, Outlook, Yahoo) don't answer these checks honestly, so they never give a 100% answer.

## 2. Catch-all domains accept everything

Some company domains are set up to accept mail for **any** name. On those, even a fake address looks fine to any checker. Email Chekkr can't spot catch-all domains yet.

## 3. New temporary inbox services slip through

The disposable list has 10,000+ services and is refreshed from a community list (see [disposable-list-updates.md](disposable-list-updates.md)). New services appear all the time, so a brand-new one may be marked valid until the list catches up.

## 4. Team addresses are a guess

`info@`, `sales@`, `support@` and about 50 other common names are flagged as team addresses. A person whose address happens to be `hr@theirname.com` will also be flagged. A team inbox with an unusual name (for example `growth@`) won't be.

## 5. Typo suggestions cover popular providers and common extension slips

Suggestions work for around 20 big providers (`gmial.com` → `gmail.com`) and common extension mistakes (`.con` → `.com`). They won't catch a typo in a company domain (`66degres.com`), because we can't know the right spelling.

## 6. "Unknown" isn't a verdict

A timeout means the DNS server didn't answer in time. Check again later; don't delete the address because of it.

## 7. It can't tell you about inbox placement

Even a perfect address can land in spam because of your sending domain, content or reputation. Email Chekkr only helps with the "is this address worth sending to" part.

## 8. It doesn't prove who owns an address

A valid result says nothing about whether the person gave you the address or agreed to receive email. Only check addresses you have a lawful reason to hold (see the [terms](../site/terms.html)).

## 9. Service limits

| Where | Limit |
|---|---|
| Website single check | No limit |
| Website bulk check | 10,000 rows per CSV |
| API without a key | 30 requests a minute per IP, 50 emails per batch |
| API with a key | 120 requests a minute per key, 500 emails per batch |
| MCP `verify_csv` | 10,000 rows per call, and the request body must be under 1 MB |
| Free Render server | Sleeps after 15 minutes idle; the first request then takes about 50 seconds |

Limits can be changed with the settings in [`.env.example`](../.env.example).
