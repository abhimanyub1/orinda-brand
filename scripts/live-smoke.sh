#!/usr/bin/env bash
# live-smoke — verify a deployed Orinda Labs site is actually serving the real thing.
#
#   scripts/live-smoke.sh https://orindalabs.com
#   scripts/live-smoke.sh https://<name>.azurestaticapps.net
#
# curl only, no dependencies, and it works from behind an egress proxy — which is
# why this rather than the Playwright suite is the post-deploy gate. Use
# scripts/browser-test.mjs for behaviour (theme, reveals, mobile, no-JS); use this
# for "is the right build live and are the headers on".
set -uo pipefail

BASE="${1:-}"
if [ -z "$BASE" ]; then echo "usage: $0 <base-url>" >&2; exit 2; fi
BASE="${BASE%/}"

pass=0; fail=0
ok()   { printf '  PASS  %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  FAIL  %s\n' "$1"; fail=$((fail+1)); }
try()  { if [ "$1" = "0" ]; then ok "$2"; else bad "$2"; fi; }

echo "Smoke-testing ${BASE}"

# Pages resolve (following the .html → extensionless redirect Azure applies).
for p in / /products.html /vision.html /about.html /contact.html /terms.html /privacy.html; do
  code="$(curl -sL -o /dev/null -w '%{http_code}' --max-time 25 "${BASE}${p}" || echo 000)"
  [ "$code" = "200" ] && ok "${p} → 200" || bad "${p} → ${code}"
done

code="$(curl -sL -o /dev/null -w '%{http_code}' --max-time 25 "${BASE}/definitely-not-a-page" || echo 000)"
[ "$code" = "404" ] && ok "unknown path → 404" || bad "unknown path → ${code} (expected 404)"

for a in /site.css /site.js /brand/raplo-theme.css /fonts/inter.woff2 /fonts/fraunces.woff2 /robots.txt /sitemap.xml; do
  code="$(curl -sL -o /dev/null -w '%{http_code}' --max-time 25 "${BASE}${a}" || echo 000)"
  [ "$code" = "200" ] && ok "${a} → 200" || bad "${a} → ${code}"
done

# The right build is live, not a stale one.
home="$(curl -sL --max-time 25 "${BASE}/" || true)"
printf '%s' "$home" | grep -q "Orinda Labs LLC"; try $? "home names the legal entity"
printf '%s' "$home" | grep -q "2108 N St, Ste N"; try $? "home carries the mailing address"
printf '%s' "$home" | grep -qi "subscription"; try $? "home states the revenue model"
printf '%s' "$home" | grep -q "maker of Raplo Capture"; try $? "footer line present"

company="$(curl -sL --max-time 25 "${BASE}/about.html" || true)"
printf '%s' "$company" | grep -q "California"; try $? "about page states the jurisdiction"
printf '%s' "$company" | grep -qi "Software subscriptions"; try $? "about page states the revenue model"

# Nothing unshipped may read as available on the live site.
vision="$(curl -sL --max-time 25 "${BASE}/products.html" || true)"
n="$(printf '%s' "$vision" | grep -c 'In development' || true)"
[ "$n" -ge 5 ] && ok "products shows ${n} in-development labels" \
                || bad "products shows only ${n} in-development labels (expected 5)"
printf '%s' "$vision" | grep -q "Available now"; try $? "Raplo Capture labelled available now"

# Security headers survived the deploy.
hdrs="$(curl -sSIL --max-time 25 "${BASE}/" || true)"
for h in strict-transport-security content-security-policy x-content-type-options referrer-policy; do
  printf '%s' "$hdrs" | grep -qi "^${h}:"; try $? "header ${h}"
done

echo
echo "${pass} passed, ${fail} failed against ${BASE}"
[ "$fail" -eq 0 ] || exit 1
