const { open, sleep, waitRows } = require('./lib');
(async () => {
  for (let run = 1; run <= 2; run++) {
    const { browser, page, logs, reqs, context } = await open();
    await page.addInitScript(() => {
      window.__lt = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: 'longtask', buffered: true });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const t0 = Date.now();
    await page.goto(process.env.URLP || 'http://localhost:3401/users');
    await waitRows(page, 60000);
    const tFirst = Date.now() - t0;
    const heap = async () => { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); const m = (await cdp.send('Performance.getMetrics')).metrics; const g = (n) => m.find((x) => x.name === n)?.value; return { heapMB: +(g('JSHeapUsedSize') / 1048576).toFixed(1), nodes: g('Nodes'), listeners: g('JSEventListeners') }; };
    const h0 = await heap();
    await page.evaluate(() => { window.__lt = []; });
    // 80 random jumps (like dragging the scrollbar)
    const tS = Date.now();
    for (let i = 0; i < 80; i++) {
      await page.evaluate((f) => { const s = document.querySelector('.ssg-scroll-container'); s.scrollTop = Math.floor(f * (s.scrollHeight - s.clientHeight)); }, (i * 0.618) % 1);
      await sleep(100);
    }
    await sleep(2000);
    const tScroll = Date.now() - tS;
    const lt = await page.evaluate(() => window.__lt.slice());
    const h1 = await heap();
    const rowsDom = await page.evaluate(() => document.querySelectorAll('[role="row"]').length);
    const gets = reqs.filter((r) => r.method === 'GET' && r.url.startsWith('/api/users?'));
    // wheel scroll smoothness: 100 wheel events
    await page.evaluate(() => { window.__lt = []; });
    await page.mouse.move(700, 500);
    const tW = Date.now();
    for (let i = 0; i < 100; i++) { await page.mouse.wheel(0, 120); await sleep(16); }
    await sleep(1000);
    const ltW = await page.evaluate(() => window.__lt.slice());
    const h2 = await heap();
    console.log(`run ${run}: firstRows=${tFirst}ms heap0=${JSON.stringify(h0)} afterJumps=${JSON.stringify(h1)} afterWheel=${JSON.stringify(h2)} domRows=${rowsDom} GETs=${gets.length} (aborted/failed=${gets.filter((g) => !g.status).length})`);
    console.log(`  jumps: longtasks n=${lt.length} max=${Math.max(0, ...lt).toFixed(0)}ms sum=${lt.reduce((a, b) => a + b, 0).toFixed(0)}ms; wheel: n=${ltW.length} max=${Math.max(0, ...ltW).toFixed(0)}ms`);
    const errs = logs.filter((l) => /error|warn/i.test(l));
    console.log('  console warn/error:', errs.length, errs.slice(0, 3));
    await browser.close();
  }
})();
