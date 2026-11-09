const { open } = require('./lib.cjs');
const base = 'http://127.0.0.1:5402/';
const configs = [
  ['anim=0 (flash+tween)', '&anim=0', ''],
  ['anim=0 + motion-base:0 (flash only)', '&anim=0', '.ssg-root{--ssg-motion-base:0ms}'],
  ['anim=0 + motion-slow:0 (tween only?)', '&anim=0', '.ssg-root{--ssg-motion-slow:0ms}'],
  ['hl=0&anim=0', '&hl=0&anim=0', ''],
];
(async () => {
  for (const [name, q, css] of configs) {
    const { browser, page } = await open(`${base}?mode=replace${q}`);
    if (css) await page.addStyleTag({ content: css });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.waitForTimeout(2000);
    await page.evaluate(() => { window.__long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask' }); });
    const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    await page.waitForTimeout(15000);
    const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const r = await page.evaluate(() => ({ n: window.__long.length, max: Math.round(Math.max(0, ...window.__long)) }));
    const secs = m1.Timestamp - m0.Timestamp;
    console.log(`${name.padEnd(40)} busy=${((m1.TaskDuration - m0.TaskDuration) / secs * 100).toFixed(0)}% script=${((m1.ScriptDuration - m0.ScriptDuration) / secs * 100).toFixed(0)}% long=${r.n} max=${r.max}ms`);
    await browser.close();
  }
})();
