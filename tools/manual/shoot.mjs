/**
 * Drives the real app and captures the manual's screenshots.
 *
 * Everything here is the app as a user meets it: a real login, real clicks,
 * real seeded figures. Nothing is mocked, so a picture that comes out wrong is
 * telling the truth about the screen.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5173';
const OUT = new URL('../../web/public/manual/shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const USER = 'neema@mauzohalisi.co.tz';
const PASS = 'Neema@2026';

const log = (...a) => console.log(...a);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: 'en-GB',
  timezoneId: 'Africa/Dar_es_Salaam',
});
const page = await ctx.newPage();
page.on('pageerror', e => log('  ! page error:', e.message));

async function shot(name, opts = {}) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
  log('  ✓', name);
}

// ── sign in ────────────────────────────────────────────────────────────────
log('login');
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.locator('input').first().fill(USER);
await page.locator('input[type="password"]').first().fill(PASS);
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL(/dashboard|setup|verify/, { timeout: 20000 });
log('  landed on', page.url());

async function go(path, name) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  await shot(name);
}

// ── the retail shop ────────────────────────────────────────────────────────
await go('/dashboard', '01-dashboard');
// The calendar opens on the current month, which is only a few days old.
// Step back one month so the picture shows a full grid.
await page.goto(`${BASE}/reports/calendar`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.getByRole('button', { name: /previous month/i }).click();
await page.waitForTimeout(1800);
await shot('02-calendar');

// POS, mid-sale: three items in the cart, waiting to be charged.
log('pos');
await page.goto(`${BASE}/pos`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
// Clicking a product opens a quantity dialog; the sale only reaches the cart
// once Add to Cart is pressed, so both steps are needed.
for (const [term, qty] of [['Sukari Kilombero', 2], ['Coca-Cola 500ml', 6], ['Omo 1kg', 1]]) {
  const card = page.locator('button').filter({ hasText: term }).first();
  await card.click();
  await page.waitForTimeout(700);
  for (let i = 1; i < qty; i++) {
    await page.getByRole('button', { name: '+' }).first().click().catch(() => {});
    await page.waitForTimeout(150);
  }
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.waitForTimeout(700);
}
await shot('03-pos-midsale');

await go('/inventory/products', '04-products');
await go('/inventory', '05-inventory');
await go('/pos/debts', '06-debts');
await go('/expenses', '07-expenses');
await go('/reports/sales', '08-sales-report');
await go('/admin/users', '09-users');

// The report schedule lives at the bottom of shop settings, so scroll to it.
log('report schedule');
await page.goto(`${BASE}/admin/shop`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const sched = page.getByText(/Business reports/i).first();
if (await sched.count()) {
  await sched.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
}
await shot('10-report-schedule');

await go('/billing', '11-subscription');

// The subscription page renders its disabled state when SPLASHPAY_* is
// missing from backend/.env, and a screenshot of that tells the reader to
// contact support when the manual has just told them to pay in the app.
// It has happened once; it fails the run now rather than shipping quietly.
{
  const body = await page.locator('body').innerText();
  if (/not switched on/i.test(body)) {
    log('  ! REFUSING: payments are off, so 11-subscription shows the disabled page.');
    log('    Put the SPLASHPAY_* placeholders in backend/.env and run again (see README).');
    await browser.close();
    process.exit(1);
  }
}

// ── the other business types ───────────────────────────────────────────────
async function switchTo(shopName) {
  log('switch to', shopName);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  // The switcher is the shop button at the top of the sidebar.
  const trigger = page.locator('aside button, nav button').filter({ hasText: /Duka la Neema|Afya Chemist|Mgahawa|Baobab|Fundi/ }).first();
  await trigger.click();
  await page.waitForTimeout(600);
  await page.getByText(shopName, { exact: false }).last().click();
  await page.waitForURL(/dashboard/, { timeout: 15000 });
  await page.waitForTimeout(1500);
}

// Navigating by URL reloads the page, and the reload re-issues a token for
// the account's default shop, so these are reached by clicking the sidebar
// exactly as an owner would.
async function clickNav(...labels) {
  for (const label of labels) {
    const link = page.getByRole('link', { name: label, exact: false }).first();
    const btn = page.getByRole('button', { name: label, exact: false }).first();
    if (await link.count()) await link.click();
    else await btn.click();
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(1600);
}

for (const [shopName, nav, name] of [
  ['Afya Chemist',        ['Inventory', 'Products'], '12-pharmacy-products'],
  ['Mgahawa wa Kijani',   ['Kitchen Display'],       '13-kitchen-display'],
  ['Baobab Guest House',  ['Hotel Rooms'],           '14-hotel-rooms'],
  ['Fundi Simu Workshop', ['Work Orders'],           '15-work-orders'],
]) {
  try {
    await switchTo(shopName);
    await clickNav(...nav);
    // A list with nothing selected teaches half the screen. Open the first
    // job so the reader sees where the detail appears.
    if (name.includes('work-orders')) {
      await page.getByText(/JOB-201/).first().click().catch(() => {});
      await page.waitForTimeout(1400);
    }
    await shot(name);
  } catch (e) { log('  !', shopName, e.message); }
}

await browser.close();
log('done');
