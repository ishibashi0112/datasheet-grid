const { chromium } = require('playwright');
const path = require('path');
const SHOTS = path.join(__dirname, '..', 'shots');
const BASE = process.env.BASE || 'http://localhost:3401';

async function open(opts = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: opts.colorScheme || 'light',
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  const reqs = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/')) reqs.push({ t: Date.now(), method: r.method(), url: decodeURIComponent(u.replace(BASE, '')), post: r.postData() });
  });
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('/api/')) {
      const rec = reqs.find((x) => x.url === decodeURIComponent(u.replace(BASE, '')) && !x.status);
      if (rec) rec.status = r.status();
    }
  });
  return { browser, context, page, logs, reqs };
}

async function shot(page, name) {
  const p = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: p });
  return p;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitRows(page, timeout = 15000) {
  await page.waitForFunction(() => {
    const cells = document.querySelectorAll('.ssg-body-cell');
    return [...cells].some((c) => /@example\.com/.test(c.textContent || ''));
  }, null, { timeout });
}

// cell text by row (aria-rowindex) and column title using DOM
async function gridText(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="row"]')];
    return rows.slice(0, 8).map((r) => [...r.querySelectorAll('[role="gridcell"],[role="columnheader"],[role="rowheader"]')].map((c) => (c.textContent || '').trim()).join(' | '));
  });
}

async function debug(page, body) {
  return page.evaluate(async (b) => (await fetch('/api/debug', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json(), body);
}

module.exports = { open, shot, sleep, waitRows, gridText, debug, BASE, SHOTS };

async function openFilter(page, key) {
  const h = page.locator(`[role="columnheader"][data-ssg-col-key="${key}"]`);
  await h.scrollIntoViewIfNeeded();
  await h.hover();
  await h.locator('button[aria-label^="Column menu"]').click();
  await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: 'Filter…' }).click();
  await page.waitForSelector('.ssg-filter-popover');
  await sleep(300);
  return page.locator('.ssg-filter-popover');
}
async function menuAction(page, key, label) {
  const h = page.locator(`[role="columnheader"][data-ssg-col-key="${key}"]`);
  await h.hover();
  await h.locator('button[aria-label^="Column menu"]').click();
  await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: label }).first().click();
  await sleep(200);
}
function lastGet(reqs) {
  const g = reqs.filter((r) => r.method === 'GET' && r.url.startsWith('/api/users?'));
  const last = g[g.length - 1];
  if (!last) return null;
  const q = new URL('http://x' + last.url.replace(/\{/g, '%7B')).searchParams;
  return { start: q.get('start'), end: q.get('end'), query: JSON.parse(last.url.split('query=')[1]) , status: last.status};
}
async function topBar(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.ssg-root');
    const chips = [...root.querySelectorAll('[class*="summary"], [class*="chip"]')].map((c) => c.textContent.trim()).filter(Boolean);
    return [...new Set(chips)].slice(0, 12);
  });
}
module.exports.openFilter = openFilter;
module.exports.menuAction = menuAction;
module.exports.lastGet = lastGet;
module.exports.topBar = topBar;

// locate a body cell by row id (ID column text) and column key
async function cellBox(page, id, key) {
  return page.evaluate(({ id, key }) => {
    const c = document.querySelector(`[role="row"][data-row-key="${id}"] [role="gridcell"][data-ssg-col-key="${key}"]`);
    if (!c) return null;
    const b = c.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, text: c.textContent.trim(), save: c.getAttribute('data-ssg-save'), cls: c.className, invalid: c.getAttribute('aria-invalid') };
  }, { id, key });
}
async function serverUser(page, id) {
  return page.evaluate(async (id) => {
    const q = { columnFilters: { id: { kind: 'number', raw: '', parsed: { mode: 'comparison', operator: '=', value: id } } } };
    const r = await fetch('/api/users?start=0&end=1&query=' + encodeURIComponent(JSON.stringify(q)));
    return (await r.json()).rows[0];
  }, id);
}
module.exports.cellBox = cellBox;
module.exports.serverUser = serverUser;
async function firstKeys(page, n = 5) {
  return page.evaluate((n) => [...new Set([...document.querySelectorAll('[role="row"][data-row-key]')].map((r) => r.getAttribute('data-row-key')))].slice(0, n), n);
}
module.exports.firstKeys = firstKeys;
async function visibleKeys(page, n = 10) {
  return page.evaluate((n) => {
    const sc = document.querySelector('.ssg-scroll-container').getBoundingClientRect();
    const out = [];
    for (const r of document.querySelectorAll('[role="row"][data-row-key][data-pane="left"]')) {
      const b = r.getBoundingClientRect();
      if (b.top >= sc.top + 40 && b.bottom <= Math.min(sc.bottom, window.innerHeight) - 2) out.push({ key: r.getAttribute('data-row-key'), top: b.top });
    }
    out.sort((a, b) => a.top - b.top);
    return out.slice(0, n).map((o) => o.key);
  }, n);
}
module.exports.visibleKeys = visibleKeys;
