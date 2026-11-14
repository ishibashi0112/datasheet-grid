const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:5408/';
async function open(opts = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1600, height: 900 }, deviceScaleFactor: 1, ...(opts.context || {}) });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  if (opts.clearStorage !== false) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
  }
  await page.goto(BASE);
  await page.waitForSelector('[role="grid"]');
  await page.waitForTimeout(800);
  return { browser, context, page, logs };
}
const outer = (page) => page.locator('[aria-label="タスク一覧"]').first();
async function cellText(page, sel) { return page.locator(sel).first().innerText(); }
module.exports = { open, BASE, outer, cellText };
const G = '[aria-label="タスク一覧"]';
async function openColumnMenu(page, colKey) {
  const hdr = page.locator(`${G} [role="columnheader"][data-ssg-col-key="${colKey}"]`).first();
  await hdr.click({ button: 'right' });
  await page.waitForTimeout(300);
}
async function clickMenu(page, text) {
  const item = page.locator('.ssg-menu-item', { hasText: text }).first();
  await item.click();
  await page.waitForTimeout(300);
}
async function groupRows(page) {
  return page.evaluate(() => {
    const g = document.querySelector('[aria-label="タスク一覧"]');
    return [...g.querySelectorAll('[data-ssg-group-row][data-pane="left"]')]
      .sort((a, b) => Number(a.dataset.rowIndex) - Number(b.dataset.rowIndex))
      .map((r) => {
        const cell = r.querySelector('[data-ssg-col-key="__ssg_group__"]');
        const vals = {};
        g.querySelectorAll(`[data-ssg-group-row][data-row-index="${r.dataset.rowIndex}"] .ssg-group-value`).forEach((v) => {
          vals[v.closest('[data-ssg-col-key]').dataset.ssgColKey] = v.textContent;
        });
        return { i: Number(r.dataset.rowIndex), label: cell?.querySelector('.ssg-group-label')?.textContent, count: cell?.querySelector('.ssg-group-count')?.textContent, expanded: cell?.querySelector('button')?.getAttribute('aria-expanded'), indent: cell?.querySelector('.ssg-group-indent')?.style.width, vals };
      });
  });
}
async function cell(page, rowKey, colKey) {
  return page.locator(`${G} [data-row-key="${rowKey}"] [data-ssg-col-key="${colKey}"]`).first();
}
async function totalRow(page) {
  return page.evaluate(() => {
    const g = document.querySelector('[aria-label="タスク一覧"]');
    const o = {};
    g.querySelectorAll('.ssg-total-row .ssg-total-cell').forEach((c) => { const k = c.dataset.ssgColKey || c.getAttribute('data-ssg-col-key'); if (c.textContent.trim()) o[k || ('?' + Object.keys(o).length)] = c.textContent.trim(); });
    return o;
  });
}
async function bars(page) {
  return page.evaluate(() => [...document.querySelector('[aria-label="タスク一覧"]').closest('.ssg-root').querySelectorAll(':scope > .ssg-bar--top, :scope > .ssg-bar--bottom')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));
}
module.exports = Object.assign(module.exports, { G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars });
