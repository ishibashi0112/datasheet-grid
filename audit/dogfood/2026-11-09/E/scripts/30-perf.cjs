const { open, sleep, cellBox } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.addInitScript(() => {
    window.__lt = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: 'longtask', buffered: true });
  });
  await page.reload();
  await page.waitForSelector('.ssg-body-row');
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), now: Math.round(performance.now()) }; });
  await sleep(1500);
  const lt0 = await page.evaluate(() => { const a = window.__lt; window.__lt = []; return { n: a.length, max: Math.round(Math.max(0, ...a)), sum: Math.round(a.reduce((s, x) => s + x, 0)) }; });
  // スクロール(ホイール 60 回)
  const box = await page.evaluate(() => { const b = document.querySelector('.ssg-scroll-container').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.move(box.x, box.y);
  await page.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 100000 && !window.__stop) requestAnimationFrame(tick); }; window.__stop = false; requestAnimationFrame(tick); });
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 600); await sleep(16); }
  await sleep(500);
  const sc = await page.evaluate(() => { window.__stop = true; const f = window.__frames.slice(1); f.sort((a, b) => a - b); const a = window.__lt; window.__lt = []; return { frames: f.length, p50: f[Math.floor(f.length * 0.5)]?.toFixed(1), p95: f[Math.floor(f.length * 0.95)]?.toFixed(1), max: f[f.length - 1]?.toFixed(1), over50: f.filter(x => x > 50).length, lt: a.length, ltMax: Math.round(Math.max(0, ...a)), top: document.querySelector('.ssg-scroll-container').scrollTop }; });
  // ソート(売価の見出しクリック)
  const h = await page.evaluate(() => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace(/[⋮↑↓]/g, '').trim() === '売価'); const b = h.getBoundingClientRect(); return { x: b.x + b.width * 0.7, y: b.y + b.height / 2 }; });
  const t0 = await page.evaluate(() => performance.now());
  await page.keyboard.down('Shift'); await page.mouse.click(h.x, h.y); await page.keyboard.up('Shift');
  await page.waitForFunction(() => /並び替え: 売価/.test(document.querySelector('.ssg-root').textContent));
  const t1 = await page.evaluate(() => performance.now());
  await sleep(300);
  const ltSort = await page.evaluate(() => { const a = window.__lt; window.__lt = []; return Math.round(Math.max(0, ...a)); });
  // グローバルフィルター
  const gf = await page.evaluate(() => { const i = document.querySelector('input[placeholder="グローバルフィルター"]'); const b = i.getBoundingClientRect(); return { x: b.x + 30, y: b.y + b.height / 2 }; });
  await page.mouse.click(gf.x, gf.y);
  const t2 = await page.evaluate(() => performance.now());
  await page.keyboard.type('緑茶');
  await page.waitForFunction(() => /行 \d+ \/ 5000/.test(document.querySelector('.ssg-root').textContent) && !/行 5000 \/ 5000/.test(document.querySelector('.ssg-root').textContent));
  const t3 = await page.evaluate(() => performance.now());
  await sleep(500);
  const ltFilter = await page.evaluate(() => { const a = window.__lt; window.__lt = []; return Math.round(Math.max(0, ...a)); });
  const rowsTxt = await page.evaluate(() => document.querySelector('.ssg-root').textContent.match(/行 \d+ \/ 5000/)?.[0]);
  // 1 セル編集(ソート + フィルター中)
  console.log(JSON.stringify({ nav, initialLongTasks: lt0, scroll: sc, sortMs: Math.round(t1 - t0), ltSort, filterMs: Math.round(t3 - t2), ltFilter, rowsTxt }));
  console.log('LOGS:' + logs.filter(l => !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
