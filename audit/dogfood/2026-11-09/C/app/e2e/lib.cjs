const { chromium } = require('playwright');
const path = require('path');
const SHOTS = path.resolve(__dirname, '../../shots');
const BASE = process.env.BASE || 'http://127.0.0.1:5403/';

async function open(opts = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1400, height: 860 },
    deviceScaleFactor: 1,
    locale: 'ja-JP',
    acceptDownloads: true,
    ...(opts.context || {}),
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.replace(/\/$/, '') });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/\[vite\]|React DevTools/.test(t)) return;
    logs.push(`[${m.type()}] ${t}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.goto(opts.url || BASE);
  await page.waitForSelector('.ssg-root');
  await page.waitForTimeout(600);
  return { browser, context, page, logs };
}

async function shot(page, name, opts = {}) {
  const p = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: p, ...opts });
  return p;
}

/** 行キーと列キーのセルの矩形(描画されていなければ null) */
async function cellRect(page, rowKey, colKey) {
  return page.evaluate(([rowKey, colKey]) => {
    const el = document.querySelector(`.ssg-body-row[data-row-key="${rowKey}"] [data-ssg-col-key="${colKey}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, text: el.textContent };
  }, [rowKey, colKey]);
}

async function clickCell(page, rowKey, colKey, opts = {}) {
  const r = await cellRect(page, rowKey, colKey);
  if (!r) throw new Error(`cell not rendered ${rowKey}/${colKey}`);
  await page.mouse.click(r.cx, r.cy, opts);
  return r;
}

async function gridState(page) {
  return page.evaluate(() => {
    const g = window.__grid.current;
    return { active: g.getActiveCell(), sel: g.getSelection(), scroll: g.getScrollPosition() };
  });
}

/** 行データ(staff)を行キーで */
async function rowData(page, key) {
  return page.evaluate((key) => window.__rows.find((r) => r.id === key), key);
}

function dumpLogs(logs, label = '') {
  console.log(`--- console ${label} (${logs.length}) ---`);
  for (const l of logs) console.log(l.slice(0, 800));
}

const MOD = 'Control';
module.exports = { open, shot, cellRect, clickCell, gridState, rowData, dumpLogs, SHOTS, BASE, MOD };

async function snapshot(page) {
  return page.evaluate(() => window.__rows.filter((r) => r.kind === 'staff').map((r) => ({ id: r.id, dept: r.dept, name: r.name, s: r.shifts.slice() })));
}
function diff(a, b) {
  const out = [];
  const m = new Map(a.map((r) => [r.id, r]));
  for (const r of b) {
    const o = m.get(r.id);
    if (!o) { out.push(`+${r.id}`); continue; }
    if (o.dept !== r.dept) out.push(`${r.id}.dept ${o.dept}->${r.dept}`);
    if (o.name !== r.name) out.push(`${r.id}.name ${o.name}->${r.name}`);
    const n = Math.max(o.s.length, r.s.length);
    for (let i = 0; i < n; i++) if (o.s[i] !== r.s[i]) out.push(`${r.id}.d${i + 1} ${o.s[i]}->${r.s[i]}`);
  }
  return out;
}
async function ensureVisible(page, rowKey, colKey, align = 'center') {
  await page.evaluate(([rowKey, colKey, align]) => {
    const g = window.__grid.current;
    g.scrollToCell(g.getViewRowIndex(rowKey), g.getColIndex(colKey), { align });
  }, [rowKey, colKey, align]);
  await page.waitForTimeout(250);
}
module.exports.snapshot = snapshot;
module.exports.diff = diff;
module.exports.ensureVisible = ensureVisible;
