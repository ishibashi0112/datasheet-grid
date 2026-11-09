const { chromium } = require('playwright');
const path = require('path');
const DIR = path.resolve(__dirname, '..');
const SHOTS = path.join(DIR, 'shots');
const BASE = process.env.BASE || 'http://localhost:5401/';

async function open(opts = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1400, height: 1100 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(BASE);
  await page.waitForSelector('.ssg-body-cell');
  await page.waitForTimeout(300);
  return { browser, context, page, logs };
}

// セルの DOM を (表示行, 列キー) で探す
async function cellBox(page, rowNumber, colTitle) {
  return page.evaluate(({ rowNumber, colTitle }) => {
    const headers = [...document.querySelectorAll('[role="columnheader"]')];
    const h = headers.find((el) => (el.textContent || '').trim().startsWith(colTitle));
    if (!h) return null;
    const colindex = h.getAttribute('aria-colindex');
    const rowEls = [...document.querySelectorAll(`[role="row"][aria-rowindex="${rowNumber + 1}"]`)];
    for (const r of rowEls) {
      const c = r.querySelector(`[role="gridcell"][aria-colindex="${colindex}"]`);
      if (c) {
        const b = c.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2, text: c.textContent };
      }
    }
    return null;
  }, { rowNumber, colTitle });
}

async function ensureVisible(page, rowNumber, colTitle) {
  const vis = await page.evaluate(({ rowNumber }) => {
    const sc = document.querySelector('.ssg-scroll-container');
    const r = sc.getBoundingClientRect();
    const rows = [...document.querySelectorAll(`[role="row"][aria-rowindex="${rowNumber + 1}"]`)];
    if (!rows.length) return false;
    const b = rows[0].getBoundingClientRect();
    const total = document.querySelector('.ssg-total-row');
    const bottom = total ? total.getBoundingClientRect().top : r.bottom;
    const header = document.querySelector('.ssg-header-row, [role="row"][aria-rowindex="1"]');
    const top = header ? header.getBoundingClientRect().bottom : r.top;
    return b.top >= top - 1 && b.bottom <= bottom + 1;
  }, { rowNumber });
  if (!vis) {
    await page.evaluate((i) => window.__app.grid.scrollToRow(i, { align: 'center' }), rowNumber - 1);
    await page.waitForTimeout(250);
  }
}

async function clickCell(page, rowNumber, colTitle, opts = {}) {
  await ensureVisible(page, rowNumber, colTitle);
  const b = await cellBox(page, rowNumber, colTitle);
  if (!b) throw new Error(`cell not found ${rowNumber} ${colTitle}`);
  if (opts.dbl) await page.mouse.dblclick(b.cx, b.cy);
  else await page.mouse.click(b.cx, b.cy);
  await page.waitForTimeout(120);
  return b;
}

async function cellText(page, rowNumber, colTitle) {
  const b = await cellBox(page, rowNumber, colTitle);
  return b ? (b.text || '').trim() : null;
}

async function headerTotal(page) {
  return (await page.textContent('[data-testid="header-total"]')).trim();
}

async function totalRowText(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll('.ssg-total-row .ssg-total-cell')];
    return cells.map((c) => (c.textContent || '').trim()).filter(Boolean);
  });
}

async function bottomBar(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.ssg-statusbar, .ssg-bottom-bar, [class*="status"]');
    return el ? el.textContent : null;
  });
}

async function shot(page, name) {
  const p = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: p });
  return p;
}

module.exports = { ensureVisible, open, cellBox, clickCell, cellText, headerTotal, totalRowText, bottomBar, shot, DIR, SHOTS, BASE };
