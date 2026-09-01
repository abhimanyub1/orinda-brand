/**
 * browser-test — drive the real site in Chromium and assert it behaves.
 *
 *   node scripts/browser-test.mjs                              # localhost:8099
 *   node scripts/browser-test.mjs http://localhost:8099
 *   node scripts/browser-test.mjs https://orindalabs.com       # post-deploy smoke test
 *
 * Needs Playwright: `npm i -D playwright` (the repo has no other dependency).
 * Set PW_CHROMIUM to an existing Chromium binary to skip Playwright's download.
 *
 * site-check.py checks what the pages SAY. This checks what they DO: theme
 * persistence, scroll reveals, the mobile menu, reduced motion, and that the
 * pages still render with JavaScript switched off.
 */
import { chromium } from 'playwright';

const BASE = (process.argv[2] || 'http://localhost:8099').replace(/\/$/, '');
const PAGES = ['/', '/vision.html', '/company.html', '/contact.html',
               '/terms.html', '/privacy.html', '/404.html'];
const IN_DEV = ['Raplo Me', 'Raplo Handshake', 'Raplo Whisper', 'Raplo Autopilot', 'Raplo Floor'];

const results = [];
const check = (name, pass) => results.push({ name, pass: !!pass });

const launch = () => {
  const opts = {};
  if (process.env.PW_CHROMIUM) opts.executablePath = process.env.PW_CHROMIUM;
  // Behind an egress proxy (CI sandboxes, corporate networks), Chromium needs
  // to be told about it explicitly — it does not read HTTPS_PROXY the way curl
  // does, and navigation to an external URL fails with ERR_CONNECTION_RESET.
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
    opts.proxy = { server: proxy };
    opts.args = ['--ignore-certificate-errors'];
  }
  return chromium.launch(opts);
};

const browser = await launch();
const PROXIED = !!(process.env.HTTPS_PROXY || process.env.https_proxy)
  && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE);
const ctxOpts = extra => PROXIED ? { ignoreHTTPSErrors: true, ...extra } : extra;

try {
  // ── Every page loads, carries the footer, and does not overflow ──────────
  {
    const ctx = await browser.newContext(ctxOpts({ viewport: { width: 1360, height: 900 } }));
    const page = await ctx.newPage();
    const noise = [];
    page.on('pageerror', e => noise.push(`pageerror: ${e.message}`));
    page.on('requestfailed', r => noise.push(`requestfailed: ${r.url()}`));

    for (const path of PAGES) {
      const res = await page.goto(BASE + path, { waitUntil: 'networkidle' });
      check(`${path} responds OK`, res.ok());
      check(`${path} carries the footer`,
        (await page.textContent('.site-foot')).includes('maker of Raplo Capture'));
      check(`${path} no horizontal overflow @1360`,
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    }
    check(`no page errors or failed requests (${noise.join('; ') || 'none'})`, noise.length === 0);
    await ctx.close();
  }

  // ── The KYC path: everything a reviewer needs, one click from home ───────
  {
    const ctx = await browser.newContext(ctxOpts({ viewport: { width: 1360, height: 900 } }));
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const home = await page.textContent('main');
    check('home states the legal name', home.includes('Orinda Labs LLC'));
    check('home states entity type and state',
      /limited liability company/i.test(home) && home.includes('California'));
    check('home states the mailing address', home.includes('2108 N St, Ste N'));
    check('home states the revenue model', /subscription/i.test(home));

    await page.click('a[href="/company.html"]');
    await page.waitForLoadState('networkidle');
    check('company page is one click from home', /\/company(\.html)?$/.test(new URL(page.url()).pathname));
    const co = await page.textContent('main');
    for (const need of ['Orinda Labs LLC', 'California', '2108 N St',
                        'info@orindalabs.com', 'Raplo Capture', 'Revenue model'])
      check(`company page states "${need}"`, co.includes(need));
    await ctx.close();
  }

  // ── Vision discipline: nothing unshipped may read as purchasable ─────────
  {
    const ctx = await browser.newContext(ctxOpts({ viewport: { width: 1360, height: 900 } }));
    const page = await ctx.newPage();
    await page.goto(BASE + '/vision.html', { waitUntil: 'networkidle' });
    for (const name of IN_DEV) {
      const text = await page.locator('.pcard', { hasText: name }).first().textContent();
      check(`${name} is labelled in development`, /In development/i.test(text));
      check(`${name} is not purchasable`, /Not available for purchase/i.test(text));
    }
    const shipped = await page.locator('.pcard', { hasText: 'Raplo Capture' }).first().textContent();
    check('Raplo Capture is labelled available now', /Available now/i.test(shipped));
    check('vision links the privacy policy',
      await page.locator('a[href="/privacy.html"]').first().isVisible());
    await ctx.close();
  }

  // ── Theme, navigation, and scroll reveals ────────────────────────────────
  {
    const ctx = await browser.newContext(ctxOpts({ viewport: { width: 1360, height: 900 } }));
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.click('.theme-btn');
    const picked = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.reload({ waitUntil: 'networkidle' });
    check('theme toggles and survives a reload',
      picked === await page.evaluate(() => document.documentElement.getAttribute('data-theme')));

    await page.goto(BASE + '/vision.html', { waitUntil: 'networkidle' });
    check('the active nav item is marked',
      (await page.getAttribute('.site-nav a[href="/vision.html"]', 'aria-current')) === 'page');

    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += window.innerHeight / 2) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await new Promise(r => setTimeout(r, 110));
      }
    });
    await page.waitForTimeout(1000);
    const stuck = await page.$$eval('.rise', els => els.filter(e => !e.classList.contains('in')).length);
    check(`every reveal fired (${stuck} left hidden)`, stuck === 0);
    await ctx.close();
  }

  // ── Mobile ───────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext(ctxOpts({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }));
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    check('no horizontal overflow @390',
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.click('.nav-toggle');
    await page.waitForTimeout(200);
    check('the mobile menu opens', await page.locator('.site-nav a').first().isVisible());
    check('nav-toggle reports aria-expanded',
      (await page.getAttribute('.nav-toggle', 'aria-expanded')) === 'true');
    await ctx.close();
  }

  // ── Reduced motion ───────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext(ctxOpts({ viewport: { width: 1360, height: 900 }, reducedMotion: 'reduce' }));
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    check('reduced motion hides the hero canvas',
      await page.evaluate(() => getComputedStyle(document.getElementById('floor')).display === 'none'));
    check('reduced motion still shows the content', await page.isVisible('h1'));
    await ctx.close();
  }

  // ── No JavaScript at all: the page must never render blank ───────────────
  {
    const ctx = await browser.newContext(ctxOpts({ javaScriptEnabled: false, viewport: { width: 1360, height: 900 } }));
    const page = await ctx.newPage();
    await page.goto(BASE + '/vision.html', { waitUntil: 'load' });
    check('no-JS: vision content is visible', await page.isVisible('.pcard'));
    await page.goto(BASE + '/company.html', { waitUntil: 'load' });
    check('no-JS: the entity record is visible', await page.isVisible('.facts'));
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.pass);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
console.log(`\n${results.length - failed.length}/${results.length} passed against ${BASE}`);
process.exit(failed.length ? 1 : 0);
