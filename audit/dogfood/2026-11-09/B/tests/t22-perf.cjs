// Main-thread cost of the feed for different toggles (prod). 20 s per config, prints TaskDuration per second and long tasks.
const { open } = require('./lib.cjs');
const base = process.argv[2] ?? 'http://127.0.0.1:5402/';
const configs = (process.argv[3] ?? 'all,hl=0,anim=0,cf=0,hl=0&anim=0&cf=0,idle').split(',');
(async () => {
  for (const cfg of configs) {
    const q = cfg === 'all' ? '' : cfg === 'idle' ? '&run=0' : `&${cfg}`;
    const { browser, page, logs } = await open(`${base}?mode=replace${q}`);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.waitForTimeout(2000);
    await page.evaluate(() => { window.__long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask' }); window.__t0 = window.__app.ticks(); });
    const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    await page.waitForTimeout(20000);
    const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const r = await page.evaluate(() => ({ ticks: window.__app.ticks() - window.__t0, longN: window.__long.length, longSum: Math.round(window.__long.reduce((a, b) => a + b, 0)), longMax: Math.round(Math.max(0, ...window.__long)) }));
    const secs = (m1.Timestamp - m0.Timestamp);
    console.log(`${cfg.padEnd(22)} busy=${((m1.TaskDuration - m0.TaskDuration) / secs * 100).toFixed(0)}% script=${((m1.ScriptDuration - m0.ScriptDuration) / secs * 100).toFixed(0)}% layout=${((m1.LayoutDuration - m0.LayoutDuration) / secs * 100).toFixed(0)}% style=${((m1.RecalcStyleDuration - m0.RecalcStyleDuration) / secs * 100).toFixed(0)}% ticks/s=${(r.ticks / secs).toFixed(2)} longtasks=${r.longN} sum=${r.longSum}ms max=${r.longMax}ms logs=${logs.length}`);
    await browser.close();
  }
})();
