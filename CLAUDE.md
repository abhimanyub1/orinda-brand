# CLAUDE.md — orinda-brand

The corporate website for **Orinda Labs LLC**, live on Azure Static Web Apps.
Static HTML/CSS/JS in `src/`. No build step, no runtime dependencies, no trackers.

## What this site is for, in priority order

**This ranking changed on 2026-09-01. It used to lead with KYC; it no longer does.**

1. **Inspire.** The visitors who matter are investors, people about to try Raplo Capture for
   the first time, and people who might come and build here. They should leave excited about
   what this company is doing. **Rank every decision against this first.**
2. **Explain what we actually do.** Orinda Labs builds **ambient intelligence** — software
   that understands real conversations between real people, with consent, and acts on them.
   Raplo Capture is *one application* of that, not the shape of the company. Never let the
   site read as though events are the whole ambition.
3. **Keep the entity verifiable.** A compliance reviewer — bank, payment processor, state
   agency, procurement — must still be able to find the legal name, entity type, address,
   contact, and revenue model. They get there from a clear link, not from the site leading
   with it. `company.html` is that page; `site-check.py` enforces it stays one click away.

## Facts you may state (do not embellish, do not invent)

Orinda Labs LLC is a **California limited liability company** building commercial
**ambient intelligence software**. Its shipped product is **Raplo Capture**
(capture.raplo.ai): AI-powered conversation capture for events and venues — exhibitors and
hosts capture visitor contact details and conversations **with the visitor's explicit
consent**, and the software transcribes, qualifies, and follows up automatically. Revenue
is **software subscriptions** (free tier plus paid monthly plans).

`config/site.json` is the single source of truth for the domain, entity facts, contact
addresses, and product URLs. The pages are static and cannot import it at runtime, so
`scripts/site-check.py` is what proves they still agree. **Change a value there, mirror it
in the HTML, then run the check.**

## Rules that are not style preferences

These keep the site verifiable and honest. `scripts/site-check.py` enforces them and CI
runs it on every PR — but know them, do not just lean on the checker:

- **Every unshipped product is labelled "in development", everywhere it appears.** Only
  Raplo Capture may read as purchasable. Never attach pricing, signup, or a waitlist to an
  in-development product.
- **Broad technology, events as the proof point.** The *framing* may be as broad as
  ambient intelligence for real-world, in-person interaction. The *examples* stay events and
  venues, because that is what is shipped. Never frame anything as meeting transcription,
  meeting notes, workplace collaboration, or productivity software — that guardrail did not
  change when the positioning broadened. If a sentence would fit a workplace product, rewrite
  it. `site-check.py` fails on those words.
- **Never name, compare against, or allude to another software vendor.** No "alternative to X".
- **Consent-first language wherever data, memory, or graph concepts appear.** Always
  "consented"; always "the person controls and can delete their data"; always link the
  privacy policy. Never "track people", "capture everyone", "harvest". Prefer "a consented
  map of real-world intent" over "a dataset about people".
- **Raplo Capture is a product of Orinda Labs LLC.** Never write "Raplo is a company".
- **Truth only.** No invented customers, testimonials, logos, revenue figures, team size, or
  office photos. There is **no publishable traction yet**, so the page earns excitement from
  the idea and from the fact that the product genuinely ships and can be used today — never
  from numbers. If a section needs fabrication to look good, cut it. Sparse and honest reads
  better to an investor than vague puffery, and it is the only version that survives scrutiny.
- **No invented job listings.** Hiring copy says we are small and early and invites a letter.
  It never implies open roles that do not exist.
- **Commercial tone.** Never hobby, side project, experiment, or passion project.
- **Never restate Raplo Capture's prices here.** Link the product pricing page so they cannot drift.
- **No third-party trackers or analytics. Fonts stay self-hosted.**

## Layout

```
src/                index · vision · company · contact · terms · privacy · 404
                    site.css (layout + motion) · site.js (theme, reveals, hero canvas)
                    brand/raplo-theme.css — design system, synced from the product monorepo
                    fonts/ — Inter + Fraunces, self-hosted
                    assets/brand/ — logo set, light and dark variants
                    staticwebapp.config.json — routing, cache headers, CSP
config/site.json    single source of truth
scripts/            site-check.py · browser-test.mjs · live-smoke.sh
docs/               deploy-azure.md · dns-northwest-to-azure.md
```

Pages are standalone HTML, matching the `raplo-site/` convention in the product monorepo.
Edit them directly. Restyle globally by syncing `src/brand/raplo-theme.css` from that
monorepo's `brand/raplo-theme.css` rather than editing tokens here; Orinda-specific accents
live at the top of `src/site.css`.

## Checks — run these, in this order

```bash
python3 scripts/site-check.py                       # content rules, entity facts, links (no deps)
python3 -m http.server 8099 --directory src &       # serve for the browser suite
node scripts/browser-test.mjs                       # behaviour: theme, reveals, mobile, no-JS
scripts/live-smoke.sh <deployed-url>                # after a deploy: right build live, headers on
```

`site-check.py` also prints every outstanding `<!-- OWNER: fill -->` placeholder.

`browser-test.mjs` needs Playwright (`npm i -D playwright`); set `PW_CHROMIUM` to an existing
Chromium binary to skip the download. It can target any URL, but **in a sandbox whose egress
goes through a relay proxy, Chromium may fail to reach external hosts even though curl
succeeds** — so run the browser suite against `localhost` and use `live-smoke.sh` (curl only)
for anything deployed.

## Deploying

`.github/workflows/azure-static-web-apps.yml` deploys `src/` to Azure Static Web Apps on
every push to `main`, builds a preview environment per PR, and tears it down on close. The
run gates on `site-check.py` and then polls the deployed URL until it serves the new page, so
**a green run means live, not merely uploaded**.

Live: <https://www.orindalabs.com> (also on <https://proud-pond-015f5471e.6.azurestaticapps.net>).
The site is served on **www**; the apex forwards to it, because the DNS provider offers no
`ALIAS`/`ANAME` record and DNS forbids a `CNAME` at the apex. Canonical URLs therefore name
the www host and the **extensionless** path Azure actually serves — `/vision`, not
`/vision.html`, which 301s. `site-check.py` fails on drift from `config/site.json`.

Full runbook in [docs/deploy-azure.md](docs/deploy-azure.md).

## What Claude may do here

The owner has granted **standing permission to run the full ship loop** in this repository:
branch → commit → push → open PR → wait for CI → **merge to `main`** → verify the deploy is
live. Use the `/ship` skill; it encodes the order and the gates. You do not need to ask
before merging a change the owner asked for and the checks pass on.

That permission covers this repository only, and it is not a licence to skip the gates: if
`site-check.py` or the browser suite fails, fix the cause — never merge around a red check,
and never weaken a check to make it pass.

## What Claude cannot do here

There is **no Azure CLI and no Azure credential** in the agent environment. Anything on the
Azure or DNS side is the owner's to run, and you should hand them exact commands rather than
pretending:

- creating or changing Azure resources
- adding or validating the custom domain
- rotating the deployment token (`AZURE_STATIC_WEB_APPS_API_TOKEN`)
- DNS records at Northwest

This does not block deploys: the deploy path is entirely GitHub-native.

**Never** print, commit, or echo the deployment token. It is a write credential for the
Static Web App. If it is ever exposed, tell the owner to rotate it immediately.

## Outstanding

- **No `OWNER: fill` placeholders remain.** Entity facts are complete: California LLC formed
  2026, address, phone, all four contact addresses, product URLs.
- The legal pages were drafted in-house and have not been through outside counsel. That
  caveat now lives in an HTML comment in each page rather than a visible banner — a banner
  telling compliance reviewers the terms were provisional undercut the page it sat on. Get
  counsel to read them before relying on them in a dispute.
- **The apex serves over HTTPS but not HTTP.** `https://orindalabs.com` correctly 301s to
  `https://www.orindalabs.com` with a valid certificate, but `http://orindalabs.com` returns
  a 503 from the forwarding host — its port-80 listener is not serving the rule. Low impact
  (browsers try HTTPS first), but plain `http://` links and older clients fail. Fix is at the
  DNS provider, not here.
- SPF still leads with the `a` mechanism, which now authorises Azure's shared edge IPs to send
  mail as this domain. Drop it once nothing sends from the old apex host — see
  [docs/dns-northwest-to-azure.md](docs/dns-northwest-to-azure.md).

## Related

The product monorepo is `abhimanyub1/leadcapture-saas`: Raplo Capture itself, the shared
design system (`brand/raplo-theme.css`), and the backlog. This site's backlog item is
**CAP-079** under bet **B6 · Trust & operability at scale**. Work tracked there, built here.
