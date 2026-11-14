const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root'); await sleep(800);
  const st = () => page.evaluate(() => ({ canUndo: window.__grid.current.canUndo(), canRedo: window.__grid.current.canRedo(), vi416: window.__grid.current.getViewRowIndex('P-00416'), vi417: window.__grid.current.getViewRowIndex('P-00417') }));
  const around = () => page.evaluate(() => { const out = []; for (let r = 417; r <= 421; r++) { const row = [...document.querySelectorAll(`[role="row"][aria-rowindex="${r}"]`)].map(e => e.textContent).join(''); out.push(r + ':' + (row.match(/P-\d{5}|C0\d [^\d]+/)?.[0] ?? '?')); } return out.join(' '); });
  const handle = (r) => page.evaluate((r) => { for (const row of document.querySelectorAll(`[role="row"][aria-rowindex="${r}"]`)) { const h = row.querySelector('.ssg-row-drag-handle'); if (h) { const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; } } return null; }, r);
  await reveal(page, 421, 4); await page.mouse.wheel(0, 120); await sleep(500);
  const h = await handle(418); const t = await cellBox(page, 420, 4);
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(h.x, h.y + ((t.y + t.h / 2 + 4 - h.y) * i) / 12); await sleep(30); }
  await page.mouse.up(); await sleep(800);
  console.log('after guarded drop', await around(), await st());
  await page.evaluate(() => window.__grid.current.redo()); await sleep(800);
  console.log('after handle.redo()', await around(), await st(), 'log:', await page.locator('[data-testid="move-log"]').textContent());
  await sleep(1500);
  console.log('later', await around(), await st());
  await shot(page, '07d-after-redo');
  await browser.close();
})();
