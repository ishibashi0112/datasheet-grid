const { open, center, cellHandle } = require('./lib.cjs');
const base = process.argv[2] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=apply&ms=500`);
  await page.evaluate(() => { const g = window.__app.grid(); g.selectCell(2, g.getColIndex('memo'), { scrollIntoView: true }); g.focus(); });
  await page.waitForTimeout(300);
  await page.keyboard.type('hello');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
  const t0 = await page.evaluate(() => window.__app.ticks());
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.__app.setRunning(false));
  await page.waitForTimeout(300);
  const t1 = await page.evaluate(() => window.__app.ticks());
  const snap = () => page.evaluate(() => { const r = window.__app.getRows(); return { memo: r[2].memo, sumLast: Math.round(r.reduce((a, q) => a + q.last, 0) * 100) / 100, canUndo: window.__app.grid().canUndo(), canRedo: window.__app.grid().canRedo() }; });
  console.log('ticks after edit', t1 - t0, JSON.stringify(await snap()));
  for (let i = 1; i <= 12; i++) {
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(150);
    console.log('undo', i, JSON.stringify(await snap()));
  }
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(150);
  console.log('redo', JSON.stringify(await snap()));
  console.log('LOGS', logs);
  await browser.close();
})();
