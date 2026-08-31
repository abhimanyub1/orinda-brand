# Deploying orindalabs.com to Azure Static Web Apps

Start to finish. Steps 1–4 stand up hosting and get the site live on an Azure URL.
Step 5 puts your domain in front of it. **Do step 4 before step 5** — never point a
domain at an origin you have not seen working.

Total: about 20 minutes of work, then up to a few hours of waiting on DNS and the
TLS certificate.

Everything below assumes these names. Change them if you like, but change them
consistently:

| Thing | Value used here |
|---|---|
| Resource group | `rg-orinda-web` |
| Static Web App | `swa-orinda-labs` |
| Region | `westus2` |
| Domain | `orindalabs.com` |

---

## 1. Sign in and pick the subscription

```bash
az login
az account list --output table          # find the one you want
az account set --subscription "<SUBSCRIPTION_NAME_OR_ID>"
az account show --query "{name:name, id:id}" -o table
```

No Azure CLI? Install it (`brew install azure-cli`, or see Microsoft's install docs),
or use the **Cloud Shell** button in the Azure portal, which has it preinstalled.

---

## 2. Create the resource group and the Static Web App

```bash
az group create \
  --name rg-orinda-web \
  --location westus2

az staticwebapp create \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  --location westus2 \
  --sku Free
```

Two things worth knowing:

- **`--location` is the control-plane region, not where the site is served from.**
  Content is served from Azure's global edge either way. Valid values include
  `westus2`, `centralus`, `eastus2`, `westeurope`, `eastasia`.
- **Do not link a GitHub repo during creation.** Creating it bare puts the app in
  manual deployment mode, which is what our own workflow expects. If you create it
  through the portal, choose **Deployment source: Other**. Letting Azure wire up
  GitHub itself will generate a second, competing workflow file.

Note the default hostname — you need it in step 4 and step 5:

```bash
az staticwebapp show \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  --query defaultHostname -o tsv
# → e.g. gentle-sand-0a1b2c3d4.6.azurestaticapps.net
```

---

## 3. Put the deployment token in GitHub

```bash
az staticwebapp secrets list \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  --query "properties.apiKey" -o tsv
```

Copy that value, then in GitHub:

**Settings → Secrets and variables → Actions → New repository secret**

| Field | Value |
|---|---|
| Name | `AZURE_STATIC_WEB_APPS_API_TOKEN` |
| Secret | the token you just printed |

That is the only secret the deploy needs. It is a write credential for the Static
Web App — treat it like a password, and never paste it into a file in the repo. If
it leaks, rotate it with `az staticwebapp secrets reset-api-key`.

---

## 4. Merge to `main`, which deploys

> **Why you cannot run it from the feature branch.** GitHub only lists a
> `workflow_dispatch` workflow in the **Actions** tab if that workflow file exists on
> the repository's **default branch**. Until `.github/workflows/` is on `main`, the
> Actions tab has nothing to offer you — no "Run workflow" button, and the workflow
> name will not appear in the left-hand sidebar. This trips up almost everyone the
> first time. The manual "Run workflow" route only becomes available *after* the
> first merge.

Set the secret in step 3 **first**, then merge:

```bash
git checkout main
git pull origin main
git merge --no-ff claude/orinda-labs-website-azure-wwwpx5
git push origin main
```

Or open a pull request from the branch into `main` and merge it in the GitHub UI.

The push to `main` triggers the deploy automatically. This is safe to do before DNS:
no custom domain is attached yet, so "production" is just the
`*.azurestaticapps.net` URL that nobody else knows about. You still get to look at
the real thing before pointing the domain at it.

If the secret is not set yet, the run fails immediately at the token check with an
explanatory message and nothing is published — so a premature merge costs you a red
run, not a broken site. Set the secret and re-run.

### After the first merge

The workflow now exists on `main`, so the manual route works from then on:

**GitHub → Actions → "Deploy orindalabs.com (Azure Static Web Apps)" → Run workflow**

- **Use workflow from:** any branch
- **Confirm:** type `deploy`

It refuses to publish unless you type `deploy`, runs `scripts/site-check.py`, uploads
`src/`, and then polls the live URL until it actually serves the new page. A green run
means the site is genuinely live, not just that the upload returned 200.

### Still no Actions tab at all?

If the tab itself is missing rather than empty:

- **Actions may be disabled for the repository.** Settings → Actions → General →
  *Allow all actions and reusable workflows* → Save.
- **Narrow browser window.** The tab collapses into the `…` overflow menu next to
  *Insights*.
- **You may be in the Azure portal.** This step is on GitHub, at
  `https://github.com/abhimanyub1/orinda-brand/actions` — Azure does not run it.

### Deploying without GitHub at all

If you would rather publish straight from your own machine, the Static Web Apps CLI
takes the same token:

```bash
npx @azure/static-web-apps-cli deploy ./src \
  --deployment-token "<the token from step 3>" \
  --env production
```

Useful as a fallback, but prefer the workflow — it runs `site-check.py` and verifies
the deploy went live, which a bare CLI push does not.

### Check the real thing

Open the `defaultHostname` from step 2 and confirm:

- The home page states the legal name, California LLC, the Sacramento address, and
  the subscription revenue model.
- `/company.html`, `/vision.html`, `/contact.html`, `/terms.html`, `/privacy.html` all load.
- A nonsense path such as `/nope` renders the 404 page.
- Fonts render as Fraunces headings and Inter body text (proof `/fonts/` resolved).
- The light/dark toggle works.

From here on, every push to `main` deploys, and every pull request gets its own
preview URL that is torn down when the PR closes.

---

## 5. Point the domain at it

The domain is registered at Northwest. **Keep it there** — Azure Static Web Apps
issues free managed TLS for domains hosted at any DNS provider, so moving the
registration buys you nothing. The full comparison, including moving DNS to Azure
DNS and transferring the registration, is in
[dns-northwest-to-azure.md](dns-northwest-to-azure.md).

### 5a. Tell Azure about the domains first

Azure hands you the validation token you need for the apex, so do this before
touching Northwest.

```bash
# www — validated by the CNAME itself
az staticwebapp hostname set \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  --hostname www.orindalabs.com

# apex — validated by a TXT record
az staticwebapp hostname set \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  --hostname orindalabs.com \
  --validation-method dns-txt-token

# read the token Azure wants published
az staticwebapp hostname show \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  --hostname orindalabs.com \
  --query validationToken -o tsv
```

In the portal the same flow is **Static Web App → Custom domains → + Add → Custom
domain on other DNS**.

### 5b. Add the records at Northwest

Log in to Northwest → **Domains** → your domain → **Manage DNS**.

| Type | Host | Value | TTL |
|---|---|---|---|
| `CNAME` | `www` | `<your>.azurestaticapps.net` | 3600 |
| `TXT` | `_dnsauth` | the `validationToken` from 5a | 3600 |
| `ALIAS` or `ANAME` | `@` | `<your>.azurestaticapps.net` | 3600 |

**The apex is the only awkward part.** DNS forbids a plain `CNAME` at the root, so:

1. **`ALIAS` / `ANAME` at Northwest** if they offer it. Cleanest — it follows Azure's
   IP changes automatically.
2. **Otherwise, URL-forward `orindalabs.com` → `https://www.orindalabs.com`.** Northwest
   supports domain forwarding. Serve on `www`, redirect the apex. Zero maintenance.
3. **Otherwise, move DNS to Azure DNS**, whose alias records handle the apex natively.

Never hardcode an `A` record to whatever IP the app resolves to today. Those are
shared edge addresses and they change without notice.

### 5c. Watch it go green

```bash
dig +short www.orindalabs.com CNAME
dig +short _dnsauth.orindalabs.com TXT

az staticwebapp hostname list \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  -o table          # poll until Status is "Ready"
```

Validation is usually minutes. The TLS certificate is issued and installed within
about 15 minutes after that, occasionally a few hours. It renews automatically —
nothing to diarise.

Then confirm the real endpoints:

```bash
curl -sSI https://www.orindalabs.com | head -20
curl -sSI https://orindalabs.com     | head -20
```

Expect `HTTP/2 200` and the security headers from `src/staticwebapp.config.json`
(`strict-transport-security`, `content-security-policy`, `x-content-type-options`).

### If the domain is already serving something live

Lower TTLs first so a mistake costs minutes instead of a day:

1. **24 hours before:** set the TTL on the existing records to `300`.
2. Wait for the old TTL to expire so resolvers pick up the short one.
3. Make the change.
4. **A week later**, once you are happy, put the TTL back to `3600`.

---

## 6. Set the canonical domain in the site

Once the domain is final, make sure the site agrees with it:

1. Update `domain` in `config/site.json`.
2. Update the `<link rel="canonical">` and `og:url` on all seven pages, plus
   `src/sitemap.xml` and `src/robots.txt`.
3. Run `python3 scripts/site-check.py` — it fails on any canonical that does not
   match `config/site.json`, so drift cannot ship.

Then clear the remaining `OWNER: fill` placeholders (year of formation, legal-page
dates, retention period, governing-law confirmation) that the same script lists.

---

## Rollback

Static Web Apps keeps the previous production deployment. To go back, re-run the
workflow from the last known-good commit:

**Actions → Deploy orindalabs.com → Run workflow →** pick the commit's branch or tag,
type `deploy`.

To take the domain off Azure entirely, delete or re-point the `CNAME`/`ALIAS` at
Northwest. If you lowered TTLs first, you are back in about five minutes.

---

## Quick reference

```bash
# Default hostname
az staticwebapp show -n swa-orinda-labs -g rg-orinda-web --query defaultHostname -o tsv

# Custom domain status
az staticwebapp hostname list -n swa-orinda-labs -g rg-orinda-web -o table

# Rotate the deployment token (then update the GitHub secret)
az staticwebapp secrets reset-api-key -n swa-orinda-labs -g rg-orinda-web

# Remove a custom domain
az staticwebapp hostname delete -n swa-orinda-labs -g rg-orinda-web --hostname orindalabs.com

# Tear the whole thing down
az group delete --name rg-orinda-web --yes
```

## Cost

The **Free** tier covers this site: 100 GB bandwidth a month, 0.5 GB storage, two
custom domains, and managed TLS. A static marketing site will not approach those
limits. Azure DNS, if you ever move the zone there, is about $0.50 per zone per
month plus query charges.
