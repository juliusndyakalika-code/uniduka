/**
 * Captures the landing page's screenshots from the real app.
 *
 * Same seeded shop and same rules as shoot.mjs: the pictures are taken, not
 * drawn, so a screen that changes shows up as a wrong picture. Each screen is
 * taken twice, once per language, because a Kiswahili page showing an English
 * till reads as a different product.
 *
 * Writes PNGs to web/public/landing/; convert them with the cwebp loop in the
 * README before committing.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5173';
const OUT = new URL('../../web/public/landing/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const USER = 'neema@mauzohalisi.co.tz';
const PASS = 'Neema@2026';
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function session(lang, viewport) {
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: 2, locale: 'en-GB', timezoneId: 'Africa/Dar_es_Salaam',
    colorScheme: 'light',
  });
  await ctx.addInitScript(l => { try { localStorage.setItem('lang', l); } catch {} }, lang);
  const page = await ctx.newPage();
  page.on('pageerror', e => log('  ! page error:', e.message));
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('input').first().fill(USER);
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  return { ctx, page };
}

// After a reload the app shows its dark loading screen until the session is
// restored, and a fixed wait sometimes photographs that instead of the page.
// Wait for the sidebar and the page's own heading to be on screen.
async function go(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('aside, nav') && document.body.innerText.length > 300, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
}

for (const lang of ['en', 'sw']) {
  log(lang);
  const { ctx, page } = await session(lang, { width: 1440, height: 900 });

  await go(page, '/dashboard');
  await page.screenshot({ path: `${OUT}/dashboard-${lang}.png` });
  log('  ✓ dashboard');

  await go(page, '/inventory/products');
  await page.screenshot({ path: `${OUT}/products-${lang}.png` });
  log('  ✓ products');

  // A sale in progress: the quantity dialog's field takes the number.
  await go(page, '/pos');
  for (const [term, qty] of [['Sukari Kilombero', 2], ['Coca-Cola 500ml', 6], ['Omo 1kg', 1]]) {
    await page.locator('button').filter({ hasText: term }).first().click();
    await page.waitForTimeout(500);
    await page.locator('div.fixed input').first().fill(String(qty));
    await page.locator('div.fixed button.btn-primary').last().click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/pos-${lang}.png` });
  log('  ✓ pos');
  await ctx.close();

  // The phone: the dashboard as an owner sees it on Android.
  const phone = await session(lang, { width: 390, height: 844 });
  await go(phone.page, '/dashboard');
  await phone.page.screenshot({ path: `${OUT}/phone-${lang}.png` });
  log('  ✓ phone');
  await phone.ctx.close();
}

await browser.close();
log('done');
