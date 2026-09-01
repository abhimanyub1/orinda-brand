---
name: ship
description: Ship a change to the live Orinda Labs site end to end — run the checks, commit, push, open a PR, wait for CI, merge to main, and verify the deploy is actually live. Use when the user asks to ship, deploy, publish, or push a change live, or says "make it live". Also use after finishing an edit the user clearly wants deployed.
---

# /ship — take a change all the way to the live site

The owner has granted standing permission to merge to `main` in this repository. The
whole point of this skill is that they do not have to click anything. Run the loop.

**Do not skip a step, and never merge around a red check.** The gates are what make the
standing permission safe. If something fails, fix the cause. Weakening a check to get
green is a bug, not a fix.

## 0. Know what you are shipping

If the working tree has no changes and the user has not asked for one, ask what to ship
rather than guessing. If the change is still being discussed, finish the change first.

Read `CLAUDE.md` before editing copy — the content rules there are not style preferences,
and `site-check.py` will reject violations anyway.

## 1. Start from a fresh branch off `main`

The previous PR is usually already merged, so do not stack onto stale history:

```bash
git fetch origin main
git checkout -B claude/<short-change-slug> origin/main
```

Reuse an existing unmerged branch only if this change genuinely continues it.

## 2. Make the change, then prove it

```bash
python3 scripts/site-check.py
```

Content rules, entity facts, canonical drift, broken links, unknown mailtos, and every
outstanding `OWNER: fill` placeholder. Zero dependencies, always run it.

Then the behaviour suite, against a local server:

```bash
python3 -m http.server 8099 --directory src &
node scripts/browser-test.mjs http://localhost:8099
```

Needs Playwright. If it is missing, install it (`npm i -D playwright`) or set
`PW_CHROMIUM` to an existing Chromium binary. If Playwright genuinely cannot run in the
environment, say so plainly in your report — do not silently ship without it.

**Run the browser suite against `localhost`, not a deployed URL.** In sandboxes whose
egress goes through a relay proxy, Chromium fails to reach external hosts even where curl
succeeds. Deployed URLs are verified with `live-smoke.sh` in step 6.

If you changed anything visual, screenshot it and look at the result. Do not report a
layout as fine because the CSS parsed.

## 3. Commit

One commit unless the change genuinely splits. Write the body for someone reading
`git log` in a year: what changed and *why*, and what you verified. Follow the
repository's existing commit style.

```bash
git add -A
git commit -m "..."
git push -u origin claude/<short-change-slug>
```

## 4. Open the PR

Use `mcp__github__create_pull_request` against `main`. Title states the outcome. Body
covers what changed, why, and how it was verified. Mention CAP-079 when the change is
part of that backlog item.

## 5. Wait for CI, then merge

Poll with `mcp__github__actions_list` (`list_workflow_runs`, filtered to the branch)
until the runs complete. Two workflows fire: **Site check** and **Deploy orindalabs.com**
(the PR builds a preview environment).

- **Green** → merge with `mcp__github__merge_pull_request`.
- **Red** → pull the logs with `mcp__github__get_job_logs` (`failed_only: true`), fix the
  cause, push again, and wait again. There is no round limit. Do not merge a red PR.

Merging to `main` triggers the production deploy automatically.

## 6. Verify the deploy is genuinely live

Wait for the `main` deploy run to finish, then check the real site yourself — do not
trust the green check alone:

```bash
scripts/live-smoke.sh https://proud-pond-015f5471e.6.azurestaticapps.net
```

curl only, works behind a proxy. It asserts every page resolves, the 404 works, assets
and fonts load, the entity facts and footer are present, all five in-development labels
are on the vision page, and the security headers survived.

If the custom domain is attached by then, smoke-test that host too.

Then confirm the *specific thing you changed* is actually live — the smoke test checks
the site is healthy, not that your edit shipped. `curl -sL <url>/<page> | grep` for it.

## 7. Report

Tell the user, briefly:

- what shipped and the PR link
- that CI passed and the deploy verified, with the live URL
- anything you could not verify, and why
- any placeholder or follow-up the run surfaced

Report faithfully. If a step was skipped, say so.

## Boundaries

There is no Azure CLI or credential in this environment. Azure resources, the custom
domain, the deployment token, and DNS at Northwest are the owner's to run — hand them
exact commands instead of pretending. **Never print, commit, or echo the deployment
token.**

Standing merge permission covers this repository only.
