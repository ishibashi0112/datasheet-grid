const { open, shot, center, cellHandle } = require('./lib.cjs');
const mode = process.argv[2] ?? 'replace';
const minutes = Number(process.argv[3] ?? 4);
const base = process.argv[4] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=${mode}`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  await page.evaluate(() => {
    window.__long = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask', buffered: false });
  });
  const metrics = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    const extra = await page.evaluate(() => {
      const l = window.__long.splice(0);
      return { ticks: window.__app.ticks(), longN: l.length, longSum: Math.round(l.reduce((a, b) => a + b, 0)), longMax: Math.round(Math.max(0, ...l)), dom: document.getElementsByTagName('*').length, tooltips: document.querySelectorAll('.ssg-tooltip').length };
    });
    return { heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), nodes: m.Nodes, listeners: m.JSEventListeners, docs: m.Documents, layoutCount: m.LayoutCount, taskSec: +m.TaskDuration.toFixed(1), ...extra };
  };
  const t0 = Date.now();
  console.log(mode, '0s', JSON.stringify(await metrics()));
  const steps = minutes * 2;
  for (let i = 1; i <= steps; i++) {
    // light interaction each 30s
    if (i % 2 === 1) await page.evaluate(() => window.__app.grid().applyState({ sort: [{ columnKey: 'changePct', direction: 'desc' }] }));
    else await page.evaluate(() => window.__app.grid().applyState({ sort: [] }));
    await page.waitForTimeout(30000);
    console.log(mode, `${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(await metrics()));
  }
  await shot(page, `19-soak-${mode}`);
  console.log('LOGS', logs.length, logs.slice(0, 10));
  await browser.close();
})();
