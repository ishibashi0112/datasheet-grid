const { open } = require('./lib.cjs');
async function measure(url) {
  const { browser, page } = await open({ url });
  const box = await page.locator('.ssg-scroll-container').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); window.__frames = []; let last = performance.now(); const f = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 600) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(16); }
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(16); }
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => { const f = window.__frames.slice(1); const s = [...f].sort((a, b) => a - b); const lt = window.__lt; return { p50: Math.round(s[Math.floor(s.length / 2)]), p95: Math.round(s[Math.floor(s.length * 0.95)]), ltN: lt.length, ltSum: lt.reduce((a, b) => a + b, 0) }; });
  await browser.close();
  return r;
}
(async () => {
  for (let i = 0; i < 3; i++) {
    console.log('chips', JSON.stringify(await measure('http://127.0.0.1:5403/')), ' plain', JSON.stringify(await measure('http://127.0.0.1:5403/?plain')));
  }
})();
