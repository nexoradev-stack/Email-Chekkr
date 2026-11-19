# 🔄 Keeping the disposable list up to date

The list of temporary inbox services lives in [`site/assets/data/disposable-domains.txt`](../site/assets/data/disposable-domains.txt). It comes from the community project [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains) (CC0 1.0, public domain).

## How the update works

`npm run update:disposable` downloads the latest community list and replaces the file, with three safety rules:

1. **Free providers are never added.** Any domain in [`free-providers.txt`](../site/assets/data/free-providers.txt) is skipped, so Gmail-type domains can never be marked temporary.
2. **Broken downloads are ignored.** If fewer than 1,000 domains arrive, the file isn't touched.
3. **Big drops are ignored.** If the new list is more than 20% smaller than today's, the file isn't touched.

## The daily automatic update

The update runs every day at 06:20 India time on **GitHub Actions** (free), defined in [`.github/workflows/update-disposable.yml`](../.github/workflows/update-disposable.yml). It:

1. runs `npm run update:disposable`,
2. stops if nothing changed,
3. runs all the tests and the secrets scan,
4. opens a **merge request on GitLab** (the main copy of this project) for you to review. It never changes `main` by itself.

When you merge that request, GitLab copies it to GitHub and the website redeploys with the new list.

> Why GitHub and not GitLab? GitLab.com asks for account verification with a credit card before it runs jobs on its servers. GitHub Actions doesn't, so the job runs there and only *sends* the result to GitLab.

### One-time setup (about 5 minutes)

**Step 1: create a GitLab token the job can use** (on GitLab)
1. Open the project → **Settings → Access tokens** → **Add new token**.
2. Name: `chekkr-bot`. Expiration: the latest date allowed. Role: **Developer**. Scopes: tick **api** and **write_repository**.
3. Click **Create project access token** and copy the token. It's only shown once.

**Step 2: save it as a GitHub secret** (on GitHub)
1. Open [github.com/nexoradev-stack/Email-Chekkr](https://github.com/nexoradev-stack/Email-Chekkr) → **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**. Name: `GITLAB_BOT_TOKEN`. Secret: the token. Click **Add secret**.

**Step 3: test it**
1. On GitHub, open **Actions → Update disposable domains → Run workflow → Run workflow**.
2. When it finishes (about a minute), check GitLab's **Merge requests**. If the list had changed, a new "Update disposable domain list" request is there. If it was already up to date, the run's log says *Nothing to do*.

> GitHub pauses scheduled workflows in a repository with no activity for 60 days. If that happens, GitHub emails you; open the Actions tab and click **Enable workflow**.

### When the token expires

The run fails with an authentication error. Make a new GitLab token (Step 1) and replace the GitHub secret (Step 2, **Update** instead of New).

### Updating by hand

```bash
npm run update:disposable
npm test
```

Then commit `site/assets/data/disposable-domains.txt`.
