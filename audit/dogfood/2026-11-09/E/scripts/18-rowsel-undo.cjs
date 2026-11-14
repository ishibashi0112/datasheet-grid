const { open, shot, sleep, cellBox } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  const checked = () => page.evaluate(() => [...document.querySelectorAll('[role="row"]')].filter(r => r.querySelector('[role="checkbox"][aria-checked="true"]')).map(r => r.getAttribute('aria-rowindex') + ':' + (r.closest('.ssg-root').querySelector(`[role="row"][aria-rowindex="${r.getAttribute('aria-rowindex')}"] [aria-colindex="4"]`)?.textContent || '?')));
  for (const r of [8, 9, 10]) {
    const b = await page.evaluate((r) => { for (const row of document.querySelectorAll(`[role="row"][aria-rowindex="${r}"]`)) { const cb = row.querySelector('.ssg-row-checkbox, [role="checkbox"]'); if (cb) { const b = cb.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; } } }, r);
    await page.mouse.click(b.x, b.y); await sleep(100);
  }
  console.log('selected', await checked(), await page.evaluate(() => document.querySelector('.ssg-root').textContent.match(/選択[^行]*行|\d+ 行選択/)?.[0]));
  await page.click('[data-testid="delete-rows"]'); await sleep(500);
  console.log('after delete', await checked());
  await page.click('[data-testid="undo"]'); await sleep(500);
  console.log('after undo', await checked());
  await shot(page, '18-after-undo');
  console.log(logs.filter(l => !l.includes('vite') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
