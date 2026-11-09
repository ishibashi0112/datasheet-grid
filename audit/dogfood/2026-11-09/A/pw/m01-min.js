// 最小再現: http://localhost:5401/min/
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5401' });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto('http://localhost:5401/min/');
  await page.waitForSelector('.ssg-body-cell');
  // 1 行目の日付セルを押して 8 行ぶん貼る
  const c = await page.$('[role="row"][aria-rowindex="2"] [role="gridcell"][aria-colindex="2"]');
  await c.click();
  const tsv = ['11/2\t交通費', '1/15\t会議費', '2026/2/30\tmeal', '12/31', '2026年11月4日', 'Nov 1', '2026.11.1', '1/2/3'].join('\n');
  await page.evaluate((t) => navigator.clipboard.writeText(t), tsv);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(400);
  const rows = await page.evaluate(() => window.__app.rows);
  const src = tsv.split('\n');
  rows.forEach((r, i) => console.log(JSON.stringify(src[i]), '→', JSON.stringify({ date: r.date, kind: r.kind })));
  const shown = await page.$$eval('[role="row"][aria-rowindex] [role="gridcell"][aria-colindex="3"]', (els) => els.map((e) => e.textContent));
  console.log('区分の表示', shown.join(','));
  // set: グローバルフィルターで表示名を探す
  const gf = await page.$('input[placeholder="グローバルフィルター"]');
  for (const q of ['交通費', 'transport', '会議費']) {
    await gf.fill(q); await page.waitForTimeout(400);
    console.log(`global "${q}" →`, await page.evaluate(() => window.__app.grid.getExportData().rows.length), '行');
  }
  console.log('LOGS', logs.filter((l) => !l.includes('vite') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
