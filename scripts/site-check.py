#!/usr/bin/env python3
"""site-check — enforce the Orinda Labs site's content rules mechanically.

The site's job is entity verification, so the rules that make it verifiable have
to be checked, not remembered. Zero dependencies:

    python3 scripts/site-check.py

Exit code is non-zero if any error is found, so it can gate CI.
"""
import json, os, re, sys

ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC   = os.path.join(ROOT, "src")
CFG   = json.load(open(os.path.join(ROOT, "config", "site.json"), encoding="utf-8"))

errors, warnings, notes = [], [], []

def err(f, m):  errors.append(f"{f}: {m}")
def warn(f, m): warnings.append(f"{f}: {m}")

pages = CFG["pages"]
html  = {}
for p in pages:
    fp = os.path.join(SRC, p)
    if not os.path.isfile(fp):
        err(p, "listed in config/site.json but missing from src/")
        continue
    html[p] = open(fp, encoding="utf-8").read()

def strip_comments(s):
    return re.sub(r"<!--.*?-->", "", s, flags=re.S)

# ── 1. Footer on every page ─────────────────────────────────────────────────
foot = CFG["entity"]["footerLine"]
for p, s in html.items():
    if foot not in s:
        err(p, f"footer line missing: {foot!r}")
    if "Orinda Labs LLC." not in s:
        err(p, "copyright line missing 'Orinda Labs LLC.'")

# ── 2. In-development products are always labelled ──────────────────────────
# Every mention of an unshipped product must have "in development" within the
# same block, and must never sit next to pricing/signup/waitlist language.
SELL = re.compile(r"\b(buy|purchase|subscribe|sign ?up|waitlist|pricing|price|\$\d)", re.I)
for p, s in html.items():
    body = strip_comments(s)
    for name in CFG["inDevelopment"]:
        for m in re.finditer(re.escape(name), body):
            block = body[max(0, m.start() - 400): m.end() + 400]
            if not re.search(r"in development", block, re.I):
                err(p, f"'{name}' appears without an 'in development' label nearby")
            sell = SELL.search(block)
            if sell and not re.search(r"[Nn]ot available for", block):
                warn(p, f"'{name}' appears near sales language {sell.group(0)!r} — verify it "
                        f"is not presented as purchasable")

# ── 3. Category framing: events and venues only ─────────────────────────────
BANNED_FRAMING = [
    r"\bmeeting notes?\b", r"\bmeeting transcription\b", r"\bmeetings?\b",
    r"\bworkplace\b", r"\bproductivity\b", r"\bcollaboration\b", r"\bstand-?up\b",
    r"\bteam chat\b", r"\balternative to\b", r"\bco-?worker", r"\bemployer\b",
]
for p, s in html.items():
    for pat in BANNED_FRAMING:
        for m in re.finditer(pat, strip_comments(s), re.I):
            err(p, f"workplace/meetings framing {m.group(0)!r} — rewrite around events and venues")

# ── 4. No named third-party software vendors ────────────────────────────────
VENDORS = ["Microsoft", "Google", "Salesforce", "HubSpot", "Zoom", "Slack", "Cvent",
           "Otter", "Gong", "Eventbrite", "Marketo", "Zapier", "Notion", "Apple",
           "Amazon", "Meta", "OpenAI", "Anthropic"]
for p, s in html.items():
    for v in VENDORS:
        if re.search(r"\b%s\b" % re.escape(v), strip_comments(s)):
            err(p, f"names a third-party vendor {v!r} — the site must not name or compare "
                   f"against other vendors")

# ── 5. Canonical URLs match the configured domain ───────────────────────────
dom = CFG["domain"].rstrip("/")
for p, s in html.items():
    for m in re.finditer(r'<link rel="canonical" href="([^"]+)"', s):
        if not m.group(1).startswith(dom):
            err(p, f"canonical {m.group(1)!r} does not use the configured domain {dom!r}")
    if p != "404.html" and '<link rel="canonical"' not in s:
        err(p, "no canonical URL")

# ── 6. No third-party network origins (no trackers, self-hosted fonts) ──────
# Our own domain, the product's two hosts, and spec namespaces. Anything else is
# a third-party origin the page must not reach.
ALLOWED_EXTERNAL = {dom, "https://raplo.ai", "https://capture.raplo.ai",
                    "https://schema.org", "http://www.w3.org", "https://www.sitemaps.org",
                    "https://json.schemastore.org"}
for p, s in html.items():
    for m in re.finditer(r'(?:src|href)="(https?://[^"]+)"', s):
        url = m.group(1)
        if not any(url.startswith(a) for a in ALLOWED_EXTERNAL):
            err(p, f"external resource or link to an unapproved origin: {url}")
    if re.search(r"googletagmanager|google-analytics|gtag\(|fbq\(|hotjar|segment\.com|plausible|mixpanel", s, re.I):
        err(p, "third-party analytics/tracker detected — the site must run none")

# ── 7. Entity facts stay reachable ──────────────────────────────────────────
# The site leads with the vision, not the entity record — but a reviewer who
# lands on the home page must still be able to get to the facts. The rule is
# reachability, not prominence.
legal = CFG["entity"]["legalName"]
for p in ("index.html", "about.html", "terms.html", "privacy.html", "contact.html"):
    if p in html and legal not in html[p]:
        err(p, f"legal name {legal!r} not present")
addr_head = CFG["entity"]["mailingAddress"].split(",")[0]
for p in ("index.html", "about.html", "contact.html"):
    if p in html and addr_head not in html[p]:
        err(p, f"mailing address not present (looked for {addr_head!r})")
if "index.html" in html:
    if 'href="/about.html"' not in html["index.html"]:
        err("index.html", "no link to the about page — a reviewer landing here must be "
                          "able to reach the entity facts in one click")
    if not re.search(r"limited liability company", html["index.html"], re.I):
        err("index.html", "does not state the entity type")
if "about.html" in html:
    for need in ("California", "limited liability company", "formed 2026",
                 "software subscriptions"):
        if not re.search(re.escape(need), html["about.html"], re.I):
            err("about.html", f"entity facts missing {need!r}")

# Products must be in the primary navigation, and the shipped one must be
# distinguishable from the five that are not.
for p, s_ in html.items():
    if '<nav class="site-nav"' in s_ and 'href="/products.html"' not in s_:
        err(p, "Products is missing from the primary navigation")
if "products.html" in html:
    if "Available now" not in html["products.html"]:
        err("products.html", "Raplo Capture is not labelled available now")

# ── 8. Product voice: Raplo is a product, never a company ───────────────────
for p, s in html.items():
    for m in re.finditer(r"Raplo[^.<]{0,40}\bis a (?:company|startup|business|firm)\b",
                         strip_comments(s), re.I):
        err(p, f"product-voice violation: {m.group(0)!r} — Raplo Capture is a product of "
               f"Orinda Labs LLC")

# ── 9. Consent language present in the vision ───────────────────────────────
if "vision.html" in html:
    v = html["vision.html"]
    if "privacy.html" not in v:
        err("vision.html", "vision must link the privacy policy")
    if v.lower().count("consent") < 4:
        err("vision.html", "consent-first language is thin — consent must be explicit "
                           "wherever data or memory concepts appear")
    for bad in (r"\btrack people\b", r"\bharvest\b", r"\bcapture everyone\b", r"\bsurveill"):
        if re.search(bad, v, re.I):
            err("vision.html", f"surveillance-adjacent phrasing matched {bad!r}")

# ── 10. Internal links resolve ──────────────────────────────────────────────
for p, s in html.items():
    for m in re.finditer(r'(?:src|href)="(/[^"#?]*)"', s):
        target = m.group(1)
        fs = os.path.join(SRC, target.lstrip("/")) if target != "/" else os.path.join(SRC, "index.html")
        if not os.path.exists(fs):
            err(p, f"broken internal link: {target}")

# ── 11. Contact addresses match config ──────────────────────────────────────
known = set(CFG["contact"][k] for k in ("info", "legal", "privacy", "support"))
for p, s in html.items():
    for m in re.finditer(r"mailto:([^\"'>\s]+)", s):
        if m.group(1) not in known:
            err(p, f"email {m.group(1)!r} is not in config/site.json contacts")

# ── 12. Owner placeholders are visible, and counted ─────────────────────────
for p, s in html.items():
    for m in re.finditer(r"OWNER: fill[^\n]*", s):
        notes.append(f"{p}: {m.group(0).strip()[:96]}")

# ── Report ──────────────────────────────────────────────────────────────────
print(f"Checked {len(html)} page(s) in src/\n")
if notes:
    print(f"Owner placeholders still to fill ({len(notes)}):")
    for n in notes: print("  · " + n)
    print()
if warnings:
    print(f"Warnings ({len(warnings)}):")
    for w in warnings: print("  ! " + w)
    print()
if errors:
    print(f"FAILED — {len(errors)} error(s):")
    for e in errors: print("  ✗ " + e)
    sys.exit(1)
print("site-check passed — footer, labels, framing, entity facts, links and contacts all OK.")
