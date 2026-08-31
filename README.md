# orindalabs.com — Orinda Labs LLC corporate site

The corporate website for **Orinda Labs LLC**, a California limited liability company that
builds commercial ambient intelligence software for events and venues. Its shipped product is
**Raplo Capture**, sold by subscription.

The site's first job is **entity verification**: a compliance reviewer — a bank KYC analyst, a
state agency, a payment processor — must be able to answer, in plain English and within 30
seconds, whether this entity exists, what it does, how it earns revenue, and how to reach it.
Every design and copy decision is ranked against that, then commercial legitimacy, then
customer trust.

Static HTML/CSS/JS on the shared [Raplo design system](https://github.com/abhimanyub1/leadcapture-saas/blob/main/brand/RAPLO-DESIGN-SYSTEM.md).
No build step, no dependencies, no trackers, self-hosted fonts.

---

## Fill these in before launch

| Placeholder | Where | Notes |
|---|---|---|
| **[YEAR] formed** | `company.html` | Year of formation from the CA Secretary of State filing |
| **[DATE] published** | `terms.html`, `privacy.html` | Publication date of each document |
| **[RETENTION PERIOD]** | `privacy.html` | How long email correspondence is kept |
| **Governing-law state** | `terms.html` | Defaulted to California; confirm with counsel |
| **Final domain** | every page + `config/site.json` | Assumed `https://orindalabs.com` |

Each is marked in the HTML with a visible `<!-- OWNER: fill -->` comment and rendered in a
contrasting colour so it cannot ship unnoticed. `scripts/site-check.py` lists every outstanding
one on each run.

**Already supplied and in place:** legal name, California jurisdiction, mailing address
(2108 N St, Ste N, Sacramento, CA 95816), phone, all four contact addresses, the product URLs.

Both legal pages carry a `TODO(legal)` banner and are templates, not legal advice. Have
counsel review them before relying on them commercially.

---

## Structure

```
src/
  index.html        Who we are · what we sell today · how we earn revenue · condensed vision · entity facts
  vision.html       The full thesis · the two-sided consented loop · the product line · consent commitment
  company.html      The entity record — the page a KYC reviewer is looking for
  contact.html      Addresses, mailing address, response expectation
  terms.html        Terms of Use — Orinda Labs LLC is the contracting party
  privacy.html      Privacy Policy — this website only; Raplo Capture has its own
  404.html
  site.css          Layout, page structure, and motion
  site.js           Theme toggle, scroll reveal, hero motion graphic. No network calls.
  brand/raplo-theme.css   Design system tokens (copy of the monorepo's brand/raplo-theme.css)
  fonts/            Inter + Fraunces, self-hosted
  assets/brand/     Orinda Labs + Raplo logo set, light and dark variants
  staticwebapp.config.json  Routing, cache headers, CSP
  robots.txt · sitemap.xml · site.webmanifest
config/site.json    Single source of truth for domain, entity, contacts, product URLs
scripts/site-check.py     Enforces the content rules below
```

### Where the copy comes from

`config/site.json` is the single source of truth for the domain, entity facts, contact
addresses, and product URLs. The pages are static HTML with no build step, so they cannot
import it at runtime — `scripts/site-check.py` is what proves they still agree. This mirrors
the `config/contact.json` + `npm run contact:check` pattern in the product monorepo.

---

## The content rules, and how they are enforced

These are not style preferences. They are what keeps the site verifiable and honest, so they
are checked mechanically rather than remembered:

```bash
python3 scripts/site-check.py
```

| Rule | Check |
|---|---|
| Every unshipped product is labelled **in development** | Fails if a name from `inDevelopment` appears without the label within the same block |
| Nothing but Raplo Capture reads as purchasable | Warns when an in-development name sits near pricing/signup/waitlist language |
| Events-and-venues framing only | Fails on meetings / workplace / productivity / collaboration / "alternative to" wording |
| No named third-party vendors | Fails on a list of large software vendors |
| Footer correct on every page | Fails if the copyright or "maker of Raplo Capture" line is missing |
| Raplo is a product, never a company | Fails on "Raplo … is a company/startup/business" |
| Consent language present in the vision | Fails if consent is thin, the privacy link is missing, or surveillance-adjacent phrasing appears |
| No trackers, no third-party origins | Fails on any external resource outside the product's own hosts |
| Entity facts present where reviewers look | Fails if the legal name or address is missing from index/company/contact |
| Canonicals match the configured domain | Fails on drift from `config/site.json` |
| Internal links resolve · contacts match config | Fails on a broken link or an unknown mailto |

It also prints every outstanding `OWNER: fill` placeholder.

CI runs it on every pull request (`.github/workflows/site-check.yml`).

---

## Run locally

```bash
python3 -m http.server 8099 --directory src
# → http://localhost:8099/
```

Serve from `src/` rather than opening the files directly — every path is root-relative
(`/site.css`, `/fonts/…`, `/brand/…`) and `file://` cannot resolve those.

---

## Deployment (Azure Static Web Apps)

`.github/workflows/azure-static-web-apps.yml` uploads `src/` to the Static Web App. It runs on
push to `main`, builds a preview environment for each pull request, and tears the preview down
when the PR closes.

**Full step-by-step runbook: [docs/deploy-azure.md](docs/deploy-azure.md)** — resource
creation, the deployment token, the first deploy, custom domain, rollback, and cost.

The short version:

```bash
az login && az account set --subscription "<SUBSCRIPTION>"
az group create --name rg-orinda-web --location westus2
az staticwebapp create --name swa-orinda-labs --resource-group rg-orinda-web \
  --location westus2 --sku Free
az staticwebapp secrets list --name swa-orinda-labs --resource-group rg-orinda-web \
  --query "properties.apiKey" -o tsv
```

Add that token as the repository secret **`AZURE_STATIC_WEB_APPS_API_TOKEN`**
(GitHub → Settings → Secrets and variables → Actions). It is the only secret the workflow needs.

**The first deploy has to be a merge to `main`.** GitHub only lists a `workflow_dispatch`
workflow in the Actions tab once the workflow file is on the default branch, so the "Run
workflow" button does not exist until `.github/workflows/` lands on `main`. Set the secret
first, then merge — the push to `main` deploys. Safe before DNS: no custom domain is attached
yet, so production is just the `*.azurestaticapps.net` URL.

After that first merge, manual runs work: Actions → *Deploy orindalabs.com (Azure Static Web
Apps)* → Run workflow → type `deploy`. The run refuses to publish unless you type it, fails
early with a clear message if the secret is missing, runs `site-check.py`, and then polls the
live URL until it actually serves the new page — so green means live, not just uploaded.

### Custom domain

Full comparison of the options in
**[docs/dns-northwest-to-azure.md](docs/dns-northwest-to-azure.md)**. Short version: keep the
domain registered at Northwest, add a `CNAME` for `www` and a `TXT` for `_dnsauth` pointing at
the Static Web App, and let Azure issue the managed TLS certificate. Do not transfer the
registration.

---

## Editing

- **Keep the design system as-is.** Restyle globally by syncing `src/brand/raplo-theme.css`
  from the monorepo's `brand/raplo-theme.css` rather than editing tokens here. Orinda-specific
  accents live at the top of `src/site.css`.
- Pages are standalone HTML, matching the `raplo-site/` convention — edit them directly.
- Run `python3 scripts/site-check.py` before every commit.
- Never restate Raplo Capture's prices here. Link to the product pricing page so they cannot
  drift.

## Accessibility & motion

Landmarks, a skip link, visible focus states, `aria-current` on the active nav item, and
`aria-expanded` on the mobile menu. The hero graphic and the loop diagram are `aria-hidden` or
carry a text description.

`prefers-reduced-motion: reduce` disables the hero canvas entirely, stops the diagram
animation, and renders every revealed section immediately. Reveal animations are gated behind a
`.js` class, so a script failure renders the page fully visible rather than blank.
