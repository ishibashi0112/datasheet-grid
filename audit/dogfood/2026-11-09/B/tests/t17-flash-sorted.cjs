const { open, shot } = require('./lib.cjs');
const mode = process.argv[2] ?? 'replace';
const base = process.argv[3] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=${mode}`);
  const count = async (label) => {
    await page.evaluate(() => {
      window.__changed = 0;
      window.__mo?.disconnect();
      window.__mo = new MutationObserver((ms) => { for (const m of ms) if (m.target.classList?.contains('ssg-body-cell--changed') && !(m.oldValue ?? '').includes('ssg-body-cell--changed')) window.__changed++; });
      window.__mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
      window.__t0 = window.__app.ticks();
    });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => ({ flashes: window.__changed, ticks: window.__app.ticks() - window.__t0 }));
    console.log(label, JSON.stringify(r));
  };
  await count('unsorted');
  await page.evaluate(() => window.__app.grid().applyState({ sort: [{ columnKey: 'changePct', direction: 'desc' }] }));
  await page.waitForTimeout(500);
  await count('sorted by chg% desc');
  await page.evaluate(() => window.__app.grid().applyState({ sort: [{ columnKey: 'symbol', direction: 'asc' }] }));
  await page.waitForTimeout(500);
  await count('sorted by symbol (static)');
  await shot(page, `17-flash-sorted-${mode}`);
  console.log('LOGS', logs);
  await browser.close();
})();
