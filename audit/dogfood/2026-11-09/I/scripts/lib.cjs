const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:5409/';
async function open(query = '', opts = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, ...opts });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(BASE + query);
  await page.waitForSelector('.ssg-body-cell');
  await page.waitForTimeout(300);
  return { browser, context, page, logs };
}
const sel = {
  input: '.ssg-ask-input',
};
async function askBar(page, text, { wait = true } = {}) {
  await page.click(sel.input);
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  if (wait) await page.waitForFunction(() => !document.querySelector('.ssg-ask')?.textContent?.match(/考えています|Thinking/), null, { timeout: 10000 });
  await page.waitForTimeout(150);
}
async function barText(page) {
  return page.evaluate(() => document.querySelector('.ssg-ask')?.innerText ?? '');
}
async function state(page) {
  return page.evaluate(() => window.__grid.getState());
}
async function rowCountText(page) {
  return page.evaluate(() => document.querySelector('.ssg-root')?.querySelector('[class*="bar"]')?.innerText ?? '');
}
module.exports = { open, askBar, barText, state, sel, rowCountText, BASE };
// 見えている行(center ペイン)を data-row-index 順に、行データ(window.__rows)で返す
async function viewRows(page, n = 10) {
  return page.evaluate((n) => {
    const byId = new Map(window.__rows.map((r) => [String(r.id), r]));
    const rows = [...document.querySelectorAll('.ssg-body-row[data-pane="center"]')]
      .map((el) => ({ idx: Number(el.getAttribute('data-row-index')), key: el.getAttribute('data-row-key') }))
      .sort((a, b) => a.idx - b.idx)
      .slice(0, n);
    return rows.map((r) => ({ idx: r.idx, key: r.key, row: byId.get(r.key) ?? null }));
  }, n);
}
async function counts(page) {
  return page.evaluate(() => {
    const t = document.querySelector('.ssg-root').innerText.match(/行 (\d+) \/ (\d+)|Rows (\d+) \/ (\d+)|(\d+) of (\d+)|(\d+) \/ (\d+) rows/i);
    return t ? t[0] : null;
  });
}
async function expected(page, fn) {
  return page.evaluate(`window.__rows.filter(${fn}).length`);
}
module.exports.viewRows = viewRows;
module.exports.counts = counts;
module.exports.expected = expected;
