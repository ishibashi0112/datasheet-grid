const { open, shot } = require('./lib.cjs');
const mode = process.argv[2] ?? 'replace';
const base = process.argv[3] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=${mode}`);
  await page.evaluate(() => {
    window.__long = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask', buffered: true });
    window.__changed = 0;
    const mo = new MutationObserver((ms) => { for (const m of ms) if (m.type === 'attributes' && m.target.classList?.contains('ssg-body-cell--changed')) window.__changed++; });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.waitForTimeout(3000);
  await shot(page, `02-feed-${mode}`);
  const r = await page.evaluate(() => ({ ticks: window.__app.ticks(), long: window.__long.length, longMax: Math.max(0, ...window.__long), longSum: window.__long.reduce((a, b) => a + b, 0), changed: window.__changed, changedNow: document.querySelectorAll('.ssg-body-cell--changed').length }));
  console.log(mode, JSON.stringify(r));
  // undo state
  const undo = await page.evaluate(() => ({ canUndo: window.__app.grid().canUndo() }));
  console.log('undo', undo);
  console.log('LOGS', logs.slice(0, 20), logs.length);
  await browser.close();
})();
