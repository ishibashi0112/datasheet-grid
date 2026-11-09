// 最小再現(min/index.html の 2 列のグリッド): Shift+↓ で選んだ範囲へ 3 行を貼る
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5401' });
  const page = await ctx.newPage();
  for (const how of ['shift+arrow', 'shift+click', 'shift+arrow-up']) {
    await page.goto('http://localhost:5401/min/rowsel.html?nosel');
    await page.waitForSelector('.ssg-body-cell');
    const cell = (r) => page.$(`[role="row"][aria-rowindex="${r + 1}"] [role="gridcell"][aria-colindex="2"]`);
    await page.evaluate(() => navigator.clipboard.writeText('A\nB\nC'));
    if (how === 'shift+arrow') {
      await (await cell(2)).click();
      await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowDown');
    } else if (how === 'shift+click') {
      await (await cell(2)).click();
      await page.keyboard.down('Shift'); await (await cell(4)).click(); await page.keyboard.up('Shift');
    } else {
      await (await cell(4)).click();
      await page.keyboard.press('Shift+ArrowUp'); await page.keyboard.press('Shift+ArrowUp');
    }
    const st = await page.evaluate(() => JSON.stringify({ active: window.__app.grid.getActiveCell(), range: window.__app.grid.getSelection().range }));
    await page.keyboard.press('Control+v'); await page.waitForTimeout(300);
    const names = await page.evaluate(() => window.__app.rows.slice(0, 7).map((r) => r.name));
    console.log(how.padEnd(15), '行 2〜4 を選択', st, '\n   貼り付け後 行 1〜7:', JSON.stringify(names));
  }
  await browser.close();
})();
