const { chromium } = require('playwright');
const path = require('path');
const SHOTS = path.join(__dirname, '..', 'shots');
async function open(url = 'http://127.0.0.1:5405/', opts = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
    colorScheme: opts.colorScheme || 'light',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.goto(url);
  return { browser, context, page, logs };
}
async function shot(page, name, opts = {}) {
  const p = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: p, ...opts });
  return p;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// セルの中心座標(表示中のもの)。row は aria-rowindex、col は aria-colindex
async function cellBox(page, rowIndexAria, colKeyOrIndex, root = '') {
  return page.evaluate(({ r, c, root }) => {
    const scope = root ? document.querySelector(root) : document;
    const rowEls = [...scope.querySelectorAll(`[role="row"][aria-rowindex="${r}"]`)];
    for (const row of rowEls) {
      const cell = row.querySelector(`[aria-colindex="${c}"]`);
      if (cell) { const b = cell.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height, text: cell.textContent }; }
    }
    return null;
  }, { r: rowIndexAria, c: colKeyOrIndex, root });
}
// セルが見えるまで、ユーザーと同じくホイールで横 / 縦にスクロールする
async function reveal(page, r, c, root = '') {
  for (let i = 0; i < 120; i++) {
    const st = await page.evaluate(({ r, c, root }) => {
      const scope = root ? document.querySelector(root) : document;
      const sc = scope.querySelector('.ssg-scroll-container');
      const sb = sc.getBoundingClientRect();
      const rows = [...scope.querySelectorAll(`[role="row"][aria-rowindex="${r}"]`)];
      const base = { cx: sb.x + sb.width / 2, cy: sb.y + sb.height / 2 };
      if (rows.length === 0) {
        const idx = [...scope.querySelectorAll('[role="row"][aria-rowindex]')].map((e) => Number(e.getAttribute('aria-rowindex'))).filter((n) => n > 1);
        const min = Math.min(...idx), max = Math.max(...idx);
        const dist = r < min ? (r - min) : (r - max);
        return { ...base, found: false, dx: 0, dy: Math.sign(dist) * Math.min(Math.abs(dist) * 36, 3000) };
      }
      for (const row of rows) {
        const cell = row.querySelector(`[aria-colindex="${c}"]`);
        if (cell) {
          const b = cell.getBoundingClientRect();
          const dx = b.right > sb.right - 2 ? b.right - sb.right + 20 : b.left < sb.left ? b.left - sb.left - 20 : 0;
          const dy = b.bottom > sb.bottom - 2 ? b.bottom - sb.bottom + 20 : b.top < sb.top + 80 ? b.top - sb.top - 120 : 0;
          return { ...base, found: true, dx, dy };
        }
      }
      // 行はあるが列が描かれていない → 横へ
      const b = rows[0].getBoundingClientRect();
      const dy = b.bottom > sb.bottom - 2 ? b.bottom - sb.bottom + 20 : b.top < sb.top + 80 ? b.top - sb.top - 120 : 0;
      return { ...base, found: false, dx: 400, dy };
    }, { r, c, root });
    if (st.found && Math.abs(st.dx) < 1 && Math.abs(st.dy) < 1) return true;
    await page.mouse.move(st.cx, st.cy);
    await page.mouse.wheel(st.dx, st.dy);
    await sleep(100);
  }
  return false;
}
module.exports = { open, shot, sleep, cellBox, reveal, SHOTS };
