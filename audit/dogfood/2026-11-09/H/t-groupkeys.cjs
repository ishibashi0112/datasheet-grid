const { open, G } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  const r = await page.evaluate(() => { const g = window.__grid.current; const rows = g.getGroupRows(); return { n: rows.length, sample: rows.slice(0, 3), state: g.getState() }; });
  console.log(JSON.stringify(r, null, 1).slice(0, 1500));
  await page.evaluate(() => { const g = window.__grid.current; const gr = g.getGroupRows(); g.setGroupCollapsed(gr[0].groupKey, true); });
  await page.waitForTimeout(500);
  console.log('viewIndex of T-00001 when collapsed', await page.evaluate(() => window.__grid.current.getViewRowIndex('T-00001')));
  await browser.close();
})();
