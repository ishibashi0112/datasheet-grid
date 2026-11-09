// カテゴリをまたぐ移動を onRowMove の中で undo() で戻した後、Ctrl+Y(やり直し)で禁止した移動が戻ってくるか
const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root'); await sleep(800);
  const handle = (r) => page.evaluate((r) => { for (const row of document.querySelectorAll(`[role="row"][aria-rowindex="${r}"]`)) { const h = row.querySelector('.ssg-row-drag-handle'); if (h) { const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; } } return null; }, r);
  const ids = () => page.evaluate(() => { const rows = window.__grid.current; return null; });
  const around = () => page.evaluate(() => { const out = []; for (let r = 416; r <= 422; r++) { const row = [...document.querySelectorAll(`[role="row"][aria-rowindex="${r}"]`)].map(e => e.textContent).join(''); out.push(r + ':' + (row.match(/P-\d{5}|C0\d [^\d]+/)?.[0] ?? '?')); } return out.join(' '); });
  await reveal(page, 421, 4); await page.mouse.wheel(0, 120); await sleep(500);
  console.log('before   ', await around());
  const h = await handle(418); const t = await cellBox(page, 420, 4);
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(h.x, h.y + ((t.y + t.h / 2 + 4 - h.y) * i) / 12); await sleep(30); }
  await page.mouse.up(); await sleep(800);
  console.log('after drop (guard undo)', await around(), '| msg:', await page.locator('[data-testid="message"]').textContent().catch(() => null));
  console.log('focus', await page.evaluate(() => document.activeElement?.className), 'canRedo', await page.evaluate(() => window.__grid.current?.canRedo?.()));
  // グリッドのセルを押してフォーカスを置いてから Ctrl+Y
  const c = await cellBox(page, 417, 5); await page.mouse.click(c.x, c.y); await sleep(200);
  await page.keyboard.press('Control+y'); await sleep(600);
  console.log('after Ctrl+Y', await around(), 'log:', await page.locator('[data-testid="move-log"]').textContent());
  console.log('focus now', await page.evaluate(() => document.activeElement?.className), 'canRedo', await page.evaluate(() => window.__grid.current?.canRedo?.()));
  await page.keyboard.press('Control+Shift+z'); await sleep(600);
  console.log('after Ctrl+Shift+Z', await around());
  await page.evaluate(() => window.__grid.current.redo()); await sleep(600);
  console.log('after handle.redo()', await around(), 'log:', await page.locator('[data-testid="move-log"]').textContent());
  await shot(page, '07b-after-redo');
  console.log('LOGS:' + logs.filter(l => !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
