// Shared helpers for the stock-board checks.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

async function open(url, opts = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: opts.viewport ?? { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    ...opts.context,
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'warning' || t === 'error' || t === 'warn' || opts.allConsole) logs.push(`[${t}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));
  await page.goto(url);
  await page.waitForSelector('.ssg-body-cell');
  return { browser, context, page, logs };
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

// Center of an element in viewport coordinates.
async function center(page, selectorOrHandle) {
  const h = typeof selectorOrHandle === 'string' ? await page.$(selectorOrHandle) : selectorOrHandle;
  if (!h) throw new Error(`no element ${selectorOrHandle}`);
  const b = await h.boundingBox();
  if (!b) throw new Error('no bbox');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

// Find a body cell by visible row index (aria-rowindex) and column key via DOM attributes.
async function cellHandle(page, rowNumber, colKey) {
  const h = await page.evaluateHandle(
    ([r, k]) => {
      const rows = [...document.querySelectorAll('[role="row"]')].filter((el) => el.getAttribute('aria-rowindex') === String(r));
      for (const row of rows) {
        const c = row.querySelector(`[data-ssg-col-key="${k}"]`);
        if (c) return c;
      }
      return null;
    },
    [rowNumber, colKey],
  );
  const el = h.asElement();
  if (!el) throw new Error(`no cell row=${rowNumber} col=${colKey}`);
  return el;
}

// CJK scan of visible text / attributes.
const CJK = /[　-〿぀-ヿ㐀-鿿＀-￯]/;
async function scanJapanese(page, label) {
  const found = await page.evaluate((src) => {
    const re = new RegExp(src);
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue;
      if (t && re.test(t)) {
        const el = n.parentElement;
        out.push(`text: "${t.trim().slice(0, 80)}" in <${el?.tagName.toLowerCase()} class="${el?.className}">`);
      }
    }
    for (const el of document.querySelectorAll('*')) {
      for (const a of el.getAttributeNames()) {
        const v = el.getAttribute(a);
        if (v && re.test(v) && a !== 'style') out.push(`attr ${a}="${v.slice(0, 80)}" on <${el.tagName.toLowerCase()} class="${el.className}">`);
      }
    }
    return out;
  }, CJK.source);
  return found.map((f) => `[${label}] ${f}`);
}

module.exports = { open, shot, center, cellHandle, scanJapanese, OUT };