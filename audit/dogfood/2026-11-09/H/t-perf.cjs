const { open, G, openColumnMenu, clickMenu, groupRows, cell } = require('./lib.cjs');
const log = (...a) => console.log(...a);
(async () => {
  for (let run = 0; run < 2; run++) {
    const { browser, page, logs } = await open();
    await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); });
    const measure = async (name, fn) => {
      await page.evaluate(() => { window.__lt = []; });
      const t0 = Date.now();
      await fn();
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const dt = Date.now() - t0;
      const lt = await page.evaluate(() => window.__lt.slice());
      log(run, name, dt + 'ms', 'longtasks', JSON.stringify(lt));
    };
    await measure('collapseAll', () => page.getByRole('button', { name: 'すべて閉じる', exact: true }).click());
    await page.waitForTimeout(500);
    await measure('expandAll', () => page.getByRole('button', { name: 'すべて開く', exact: true }).click());
    await page.waitForTimeout(500);
    await openColumnMenu(page, 'estimate');
    await measure('sort desc', () => clickMenu(page, '降順で並び替え'));
    await page.waitForTimeout(500);
    await measure('global filter', async () => { await page.locator('.ssg-bar-input').fill('API'); await page.waitForTimeout(400); });
    await page.locator('.ssg-bar-input').fill(''); await page.waitForTimeout(500);
    await measure('edit cell', async () => { const c = page.locator(`${G} [data-pane="center"][data-row-key] [data-ssg-col-key="estimate"]`).first(); await c.click(); await page.keyboard.type('12'); await page.keyboard.press('Enter'); });
    await page.waitForTimeout(300);
    await measure('scroll 50 steps', async () => { const b = await page.locator(G).boundingBox(); await page.mouse.move(b.x + 600, b.y + 300); for (let i = 0; i < 50; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(16); } });
    const mem = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null);
    log(run, 'heap MB', mem);
    log(logs.filter(l => !l.includes('DevTools')).join('\n'));
    await browser.close();
  }
})();
