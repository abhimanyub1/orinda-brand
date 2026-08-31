# Moving the domain from Northwest to Azure

There are **two different things** people mean by "move my domain to Azure", and
they have very different consequences. Pick one before you touch anything.

| | Option A — Keep registration at Northwest | Option B — Move DNS to Azure DNS | Option C — Transfer the registration |
|---|---|---|---|
| Who bills you for the domain | Northwest | Northwest | Azure (via a domain partner) |
| Where DNS records live | Northwest | **Azure DNS zone** | Azure |
| Downtime risk | None | None if done in the right order | Low, but a 5–7 day transfer window |
| Cost | Northwest renewal only | Northwest renewal + ~$0.50/zone/month | Azure renewal pricing |
| Effort | 10 minutes | ~45 minutes | Days |

**Recommendation: Option A.** For a static marketing site you gain nothing from
moving DNS or registration into Azure. Azure Static Web Apps validates and
issues TLS certificates through records you add at *any* DNS provider —
Northwest works fine. Keep the registrar where it is, point two records at
Azure, and be done.

Choose **Option B** only if you want DNS managed as Azure infrastructure
(Bicep/Terraform, RBAC, alongside other Azure resources). Choose **Option C**
essentially never — Azure App Service Domains is a thin GoDaddy reseller and is
worse than Northwest for privacy.

The rest of this document covers all three, starting with the recommended one.

---

## Before you start: create the Static Web App

You need the Azure resource to exist before DNS can point at it.

```bash
# Sign in and pick the subscription
az login
az account set --subscription "<SUBSCRIPTION_NAME_OR_ID>"

# Resource group
az group create \
  --name rg-orinda-web \
  --location westus2

# Static Web App (Free tier includes custom domains + managed TLS)
az staticwebapp create \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  --location westus2 \
  --sku Free
```

> `--location` for Static Web Apps is the *control plane* region; the content is
> served from Azure's global edge regardless. Valid values include `westus2`,
> `centralus`, `eastus2`, `westeurope`, `eastasia`.

Grab the default hostname — you will need it for the CNAME:

```bash
az staticwebapp show \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  --query defaultHostname -o tsv
# → something like: gentle-sand-0a1b2c3d4.6.azurestaticapps.net
```

Then wire up deployment (see [`../README.md`](../README.md#deployment)) and
confirm the site is live on that `*.azurestaticapps.net` address **before**
changing any DNS. Never point DNS at an origin you have not tested.

---

## Option A — Keep the domain at Northwest, point it at Azure  ⭐ recommended

### A1. Add the custom domains in Azure

Azure will tell you exactly which validation records it wants.

```bash
# www — validated by the CNAME itself
az staticwebapp hostname set \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  --hostname www.orindalabs.com

# apex/root — validated by a TXT record
az staticwebapp hostname set \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  --hostname orindalabs.com \
  --validation-method dns-txt-token

# Read back the token Azure wants you to publish
az staticwebapp hostname show \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  --hostname orindalabs.com \
  --query validationToken -o tsv
```

In the portal the same flow is: **Static Web App → Custom domains → + Add →
Custom domain on other DNS**.

### A2. Add the records in Northwest

Log in to Northwest → **Domains** → your domain → **Manage DNS**
(Northwest's DNS manager; on some accounts it is labelled "DNS Records" or
"Nameservers & DNS"). Add:

| Type | Host / Name | Value | TTL |
|---|---|---|---|
| `CNAME` | `www` | `<your>.azurestaticapps.net` | 3600 |
| `TXT` | `_dnsauth` | `<validationToken from above>` | 3600 |
| `ALIAS` or `ANAME` | `@` | `<your>.azurestaticapps.net` | 3600 |

**About the apex record.** You cannot use a plain `CNAME` at the apex — the DNS
spec forbids it. Your options, best first:

1. **`ALIAS` / `ANAME` at Northwest** — if Northwest's DNS offers it, use it.
   This is the clean answer and it follows Azure's IP changes automatically.
2. **URL forward `orindalabs.com` → `https://www.orindalabs.com`** — Northwest
   supports domain forwarding. Serve the site on `www` and redirect the apex.
   Slightly worse for the first-hit experience, perfectly acceptable in
   practice, and zero maintenance.
3. **Move DNS to Azure DNS (Option B)** — Azure DNS alias records handle the
   apex natively. Do this if you want the apex to be the canonical name and
   Northwest cannot do `ALIAS`.

Do **not** hardcode an `A` record to whatever IP the Static Web App resolves to
today. Those IPs are shared edge addresses and they change without notice.

### A3. Verify and wait

```bash
# Check propagation (should show your azurestaticapps.net target)
dig +short www.orindalabs.com CNAME
dig +short _dnsauth.orindalabs.com TXT
dig +short orindalabs.com

# Azure's view of the domain — poll until status is "Ready"
az staticwebapp hostname list \
  --name swa-orinda-labs \
  --resource-group rg-orinda-web \
  -o table
```

Validation usually completes in a few minutes; the managed TLS certificate is
issued and installed within about 15 minutes after that, occasionally up to a
few hours. Certificates renew automatically — nothing to diarise.

Once it is `Ready`, confirm the real thing:

```bash
curl -sSI https://www.orindalabs.com | head -20
curl -sSI https://orindalabs.com | head -20
```

You should see `HTTP/2 200` and the security headers set in
[`src/staticwebapp.config.json`](../src/staticwebapp.config.json).

### A4. Lower TTLs first if the domain is already serving a live site

If `orindalabs.com` currently points somewhere real and you cannot take an
outage:

1. **24 hours before**: drop the TTL on the existing records to `300`.
2. Wait for the old TTL to expire so resolvers pick up the short one.
3. Make the change. Rollback is then five minutes, not a day.
4. **A week after**, once you are happy, put the TTL back to `3600`.

---

## Option B — Move DNS hosting to Azure DNS

Do this only if you want the zone managed as Azure infrastructure. Registration
stays at Northwest; only the nameservers change.

### B1. Create the zone and copy every existing record

```bash
az network dns zone create \
  --resource-group rg-orinda-web \
  --name orindalabs.com
```

Before switching nameservers, **export what Northwest currently serves** and
recreate all of it in Azure. Email is the thing people forget and it is the
thing that hurts:

```bash
# Dump the current zone from Northwest's nameservers so nothing is missed
for t in A AAAA CNAME MX TXT SRV CAA NS SOA; do
  echo "── $t"; dig +noall +answer @ns1.nwrgstr.com orindalabs.com "$t"
done
# Also check the hosts you actually use
for h in www mail autodiscover _dmarc _domainkey selector1._domainkey selector2._domainkey; do
  dig +short "$h.orindalabs.com" ANY
done
```

Recreate each one. The usual suspects:

```bash
# Website
az network dns record-set cname set-record -g rg-orinda-web -z orindalabs.com \
  -n www -c <your>.azurestaticapps.net

# Apex — Azure DNS alias record, the reason to be here at all
az network dns record-set a create -g rg-orinda-web -z orindalabs.com -n "@" \
  --target-resource $(az staticwebapp show -n swa-orinda-labs -g rg-orinda-web --query id -o tsv)

# Mail (example — copy YOUR real values, do not use these)
az network dns record-set mx add-record -g rg-orinda-web -z orindalabs.com \
  -n "@" --exchange <mail-host> --preference 10
az network dns record-set txt add-record -g rg-orinda-web -z orindalabs.com \
  -n "@" --value "v=spf1 include:<your-provider> ~all"
az network dns record-set txt add-record -g rg-orinda-web -z orindalabs.com \
  -n _dmarc --value "v=DMARC1; p=none; rua=mailto:dmarc@orindalabs.com"
```

### B2. Point Northwest at Azure's nameservers

```bash
az network dns zone show -g rg-orinda-web -n orindalabs.com \
  --query nameServers -o tsv
# → ns1-05.azure-dns.com. ns2-05.azure-dns.net. ns3-05.azure-dns.org. ns4-05.azure-dns.info.
```

In Northwest → **Domains → your domain → Nameservers → Custom nameservers**,
replace Northwest's with those four (drop the trailing dots).

Propagation takes 1–48 hours depending on the old NS TTL. **Leave the Northwest
zone records in place during this window** — while resolvers are split between
old and new nameservers, both must answer correctly. Delete the Northwest
records only after a week of clean traffic.

### B3. Verify the delegation actually moved

```bash
dig +short NS orindalabs.com @1.1.1.1     # should list azure-dns hosts
dig +short MX orindalabs.com @1.1.1.1     # mail must still resolve
dig +short www.orindalabs.com @1.1.1.1
```

Send yourself a test email from an external account before you consider this
done.

---

## Option C — Transfer the registration to Azure

Not recommended, documented for completeness.

Azure does not run a registrar. **App Service Domains** resells GoDaddy, is
limited in TLD support, and gives you worse WHOIS privacy than Northwest —
which is one of the better registrars precisely on that axis. If your reason is
"one bill", the saving is a few dollars a year against a real loss of privacy
and control.

If you still want to:

1. At Northwest: unlock the domain, disable WHOIS privacy temporarily, and
   request the **EPP / authorization code**.
2. Confirm the domain is more than 60 days past registration or its last
   transfer — ICANN blocks transfers inside that window.
3. In Azure: **Create a resource → App Service Domain → Transfer**, supply the
   EPP code, and pay for one year (this extends the expiry, it is not lost).
4. Approve the transfer email. It completes in 5–7 days.
5. Re-enable privacy and re-check every DNS record afterwards — transfers
   routinely reset nameservers to the new registrar's defaults.

Keep DNS on Azure DNS (Option B) throughout so records survive the move.

---

## Email will break if you are careless

The single most common failure in a domain move is losing MX records. Before
any nameserver change:

```bash
dig +short MX orindalabs.com
dig +short TXT orindalabs.com          # SPF
dig +short TXT _dmarc.orindalabs.com   # DMARC
dig +short TXT selector1._domainkey.orindalabs.com  # DKIM (selector varies)
```

Save that output. Recreate every line exactly at the new provider. Test by
sending mail **to** and **from** the domain before you delete anything old.

---

## Rollback

Option A and B are both reversible in minutes to hours:

- **Option A**: delete or re-point the CNAME/ALIAS at Northwest. If you lowered
  TTLs first, you are back in ~5 minutes.
- **Option B**: set the nameservers at Northwest back to Northwest's own. As
  long as you did not delete the Northwest zone records, service resumes as the
  old NS records propagate.
- **Option C**: transfers cannot be cancelled once approved. You must wait 60
  days and transfer back. This is why it is last.

---

## Quick reference

```bash
# What is Azure serving?
az staticwebapp show -n swa-orinda-labs -g rg-orinda-web --query defaultHostname -o tsv

# Domain status
az staticwebapp hostname list -n swa-orinda-labs -g rg-orinda-web -o table

# Force Azure to re-check validation
az staticwebapp hostname set -n swa-orinda-labs -g rg-orinda-web \
  --hostname orindalabs.com --validation-method dns-txt-token

# Remove a custom domain
az staticwebapp hostname delete -n swa-orinda-labs -g rg-orinda-web \
  --hostname orindalabs.com
```
