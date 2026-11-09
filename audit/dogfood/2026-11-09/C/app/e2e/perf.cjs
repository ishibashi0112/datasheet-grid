const { open, dumpLogs } = require('./lib.cjs');
(async () => {
  for (let run = 1; run <= 2; run++) {
    const t0 = Date.now();
    const { browser, page, logs } = await open();
    const loadMs = await page.evaluate(() => performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd);
    await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); });
    // 月の切り替え(クリック → 次のフレームで列数が変わるまで)
    const months = ['2026-11', '2027-02', '2027-01', '2026-12', '2026-11', '2026-12'];
    const times = [];
    for (const m of months) {
      const ms = await page.evaluate(async (m) => {
        const btn = document.querySelector(`button[data-month="${m}"]`);
        const t = performance.now();
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); btn.click();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return Math.round(performance.now() - t);
      }, m);
      times.push(`${m}:${ms}ms`);
      await page.waitForTimeout(200);
    }
    // 速い縦スクロール
    const box = await page.locator('.ssg-scroll-container').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.evaluate(() => { window.__lt = []; window.__frames = []; let last = performance.now(); const f = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 600) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    for (let i = 0; i < 30; i++) { await page.mouse.wheel(i % 10 < 5 ? 80 : -60, 400); await page.waitForTimeout(16); }
    for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(16); }
    await page.waitForTimeout(500);
    const fr = await page.evaluate(() => { const f = window.__frames.slice(1); const s = [...f].sort((a, b) => a - b); return { n: f.length, p50: Math.round(s[Math.floor(s.length / 2)]), p95: Math.round(s[Math.floor(s.length * 0.95)]), max: Math.round(s[s.length - 1]), longtasks: window.__lt }; });
    const mem = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) + 'MB' : 'n/a');
    console.log(`run ${run}: DCL ${Math.round(loadMs)}ms, month switch ${times.join(' ')}, scroll frames ${JSON.stringify(fr)}, heap ${mem}`);
    dumpLogs(logs);
    await browser.close();
  }
})();
