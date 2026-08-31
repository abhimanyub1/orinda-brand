# Orinda Labs — website

Static marketing site for Orinda Labs, deployed to **Azure Static Web Apps** by
GitHub Actions on every push to `main`.

No build step, no dependencies, no framework. `src/` is what ships.

```
src/
  index.html            home page — all copy and business details live here
  privacy.html          privacy policy skeleton
  terms.html            terms of use skeleton
  404.html              not-found page
  styles.css            all styles, brand tokens at the top
  main.js               reveal animations, counters, hero canvas, form
  staticwebapp.config.json   routing, caching, security headers
  robots.txt  sitemap.xml  site.webmanifest
  assets/brand/         logo set (light + dark variants)
docs/
  dns-northwest-to-azure.md   moving the domain off Northwest
.github/workflows/
  azure-static-web-apps.yml   deploy + PR preview environments
  link-check.yml              internal link check, flags leftover placeholders
```

---

## Fill in the placeholders first

Every business fact that needs a real value is marked `TODO:` in the source.
Find them all with:

```bash
grep -rn "TODO:" src/
```

They cover:

| Where | What |
|---|---|
| `index.html` head | canonical URL, OG URL |
| `index.html` hero | the three headline statistics |
| `index.html` Raplo section | Raplo Capture and API docs URLs |
| `index.html` contact | form endpoint, contact email |
| `index.html` company details | exact registered entity name, state filing / entity number |
| `privacy.html`, `terms.html` | dates, retention period |
| `sitemap.xml` | production domain |

Already filled in: registered agent address (2108 N St, Ste N, Sacramento, CA
95816), mailing address, phone `(925) 540-2024`, California jurisdiction, and
the matching schema.org `PostalAddress` / `ContactPoint`.

### The Northwest registration block

The **Company details** card in the contact section is where the Northwest
Registered Agent information goes. Copy the values straight out of your
Northwest account dashboard — they appear under *Registered Agent Service* and
*Company Information*. The fields map one to one.

Two things worth getting right:

- **Registered agent address vs. mailing address are not the same thing.** The
  RA address is Northwest's, and it is the address for service of process. Your
  mailing address may be Northwest's mail forwarding address or your own — use
  whichever you actually want on a public page. Both currently show the same
  Sacramento address; change the mailing one if you would rather publish your
  own.
- If you use Northwest's privacy-by-default setup, the RA address is the one
  already on your public state filing, so publishing it exposes nothing new.

The CI link-check job prints any remaining `TODO:` as a warning on every PR, so
they will not quietly ship.

---

## Deployment

### One-time Azure setup

```bash
az login
az group create --name rg-orinda-web --location westus2
az staticwebapp create \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  --location westus2 \
  --sku Free
```

Get the deployment token and store it as a GitHub secret:

```bash
az staticwebapp secrets list \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  --query "properties.apiKey" -o tsv
```

Then in GitHub → **Settings → Secrets and variables → Actions → New repository
secret**:

- Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
- Value: the token above

That is the only secret the workflow needs. Push to `main` and it deploys.

### What the workflow does

- **Push to `main`** → validates the config files parse, then uploads `src/` to
  production.
- **Pull request** → deploys a preview environment on its own URL and comments
  the link on the PR.
- **PR closed** → tears the preview environment down.

Deploys take about a minute. There is no build, so there is nothing to cache.

### Custom domain

See **[docs/dns-northwest-to-azure.md](docs/dns-northwest-to-azure.md)**. Short
version: keep the domain registered at Northwest, add a `CNAME` for `www` and a
`TXT` for `_dnsauth` pointing at the Static Web App, and let Azure issue the
TLS certificate. Do not transfer the registration.

---

## Local development

```bash
python3 -m http.server 8000 --directory src
# → http://localhost:8000
```

Serving over HTTP rather than opening the file directly matters: every path in
the site is root-relative (`/styles.css`, `/assets/...`), which `file://` cannot
resolve.

---

## Contact form

The form posts to Formspree by default because Static Web Apps' free tier has no
server side. Replace `FORM_ENDPOINT` in `index.html` with your own endpoint.

Until you do, submitting shows an inline message pointing at the email address
instead of silently failing.

If you would rather not use a third party, the alternative is an Azure Function
in an `api/` directory — Static Web Apps hosts one for free. That requires
setting `api_location: "api"` in the deploy workflow.

---

## Design notes

Brand colours are CSS custom properties at the top of `styles.css`:

```css
--blue-deep: #1B4FA0;   --blue: #4A9BE8;   --orange: #E8703A;   --raplo: #E24B2B;
```

The Orinda gradient (`--grad`) runs deep blue → blue → orange and is reused for
the primary button, headline accent, statistics, and card bullets.

Both light and dark themes are supported. The toggle in the nav writes to
`localStorage`, and an inline script in `<head>` applies the stored value before
first paint so there is no flash. Logos swap automatically — `-dark.svg`
variants are the white-wordmark versions for dark backgrounds.

**Motion.** The hero runs a canvas constellation that pauses when scrolled out
of view or the tab is hidden. Sections fade in on scroll via
`IntersectionObserver`, statistics count up, cards tilt toward the pointer, and
the Raplo mock animates a scan line and field extraction. All of it respects
`prefers-reduced-motion: reduce`, which disables animation and hides the canvas
entirely.

**No-JS.** Reveal animations are gated behind a `.js` class set in `<head>`. If
the script fails to load, the page renders fully visible rather than blank.

---

## Accessibility

- Skip link, visible focus rings, semantic landmarks and heading order.
- Every animation has a `prefers-reduced-motion` path.
- Decorative graphics are `aria-hidden`; the mobile menu button carries
  `aria-expanded` and `aria-controls`.
- The colour tokens meet WCAG AA for body text in both themes.

## Security headers

Set in `staticwebapp.config.json`: HSTS with preload, `nosniff`,
`strict-origin-when-cross-origin` referrer policy, a locked-down
`Permissions-Policy`, and a CSP allowing only same-origin resources plus the
Formspree endpoint. If you add an analytics script or web font CDN, you must
extend the CSP or it will be blocked.
