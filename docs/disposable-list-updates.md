# 🔄 Keeping the disposable list up to date

The list of temporary inbox services lives in [`site/assets/data/disposable-domains.txt`](../site/assets/data/disposable-domains.txt). It comes from the community project [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains) (CC0 1.0, public domain).

## How the update works

`npm run update:disposable` downloads the latest community list and replaces the file, with three safety rules:

1. **Free providers are never added.** Any domain in [`free-providers.txt`](../site/assets/data/free-providers.txt) is skipped, so Gmail-type domains can never be marked temporary.
2. **Broken downloads are ignored.** If fewer than 1,000 domains arrive, the file isn't touched.
3. **Big drops are ignored.** If the new list is more than 20% smaller than today's, the file isn't touched.

## The daily automatic update (GitLab)

Because GitLab is the main copy of this project (it pushes to GitHub), the daily update runs as a **GitLab scheduled pipeline**, defined in [`.gitlab-ci.yml`](../.gitlab-ci.yml). Once a day it:

1. runs `npm run update:disposable`,
2. stops if nothing changed,
3. runs all the tests and the secrets scan,
4. opens a **merge request** for you to review. It never changes `main` by itself.

When you merge that request, GitLab copies it to GitHub, and the website redeploys with the new list.

### One-time setup (about 5 minutes, all in the GitLab website)

**Step 1: create a token the job can use to open merge requests**
1. Open the project on GitLab → **Settings → Access tokens** → **Add new token**.
2. Name: `chekkr-bot`. Role: **Developer**. Scopes: tick **write_repository** and **api**. Pick an expiry date (GitLab allows up to a year).
3. Click **Create project access token** and copy the token. It's only shown once.

**Step 2: save the token as a CI/CD variable**
1. **Settings → CI/CD → Variables** → **Add variable**.
2. Key: `CHEKKR_BOT_TOKEN`. Value: the token. Tick **Mask variable**. Leave **Protect variable** ticked.
3. Save.

**Step 3: create the daily schedule**
1. **Build → Pipeline schedules** → **New schedule**.
2. Description: `Daily disposable list update`. Interval: **Custom**, `20 6 * * *` (06:20 every day). Timezone: your own. Target branch: `main`.
3. Save. To test it now, press the ▶ (play) button next to the schedule.

> On GitLab.com, CI jobs use shared runners. If the job says your account needs to be verified, follow GitLab's prompt once (it's free).

### Updating by hand

```bash
npm run update:disposable
npm test
```

Then commit `site/assets/data/disposable-domains.txt`.
