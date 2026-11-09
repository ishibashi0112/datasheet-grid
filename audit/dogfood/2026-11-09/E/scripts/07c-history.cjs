// セルを編集 → カテゴリをまたぐ移動(onRowMove で undo())→ 先の編集を元に戻せるか / canRedo の推移
const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root'); await sleep(800);
  const st = () => page.evaluate(() => ({ canUndo: window.__grid.current.canUndo(), canRedo: window.__grid.current.canRedo() }));
  const handle = (r) => page.evaluate((r) => { for (const row of document.querySelectorAll(`[role="row"][aria-rowindex="${r}"]`)) { const h = row.querySelector('.ssg-row-drag-handle'); if (h) { const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; } } return null; }, r);
  await reveal(page, 421, 4); await page.mouse.wheel(0, 120); await sleep(500);
  // 備考を編集(P-00415 = aria 417, 備考 = col 17)
  await reveal(page, 417, 17);
  let c = await cellBox(page, 417, 17);
  await page.mouse.click(c.x, c.y); await page.keyboard.type('メモ1'); await page.keyboard.press('Enter'); await sleep(300);
  c = await cellBox(page, 417, 17);
  console.log('edited', c.text, await st());
  await reveal(page, 418, 4);
  const h = await handle(418); const t = await cellBox(page, 420, 4);
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(h.x, h.y + ((t.y + t.h / 2 + 4 - h.y) * i) / 12); await sleep(30); }
  await page.mouse.up();
  console.log('right after drop', await st());
  await sleep(800);
  console.log('after 800ms', await st());
  await page.evaluate(() => window.__grid.current.undo()); await sleep(500);
  await reveal(page, 417, 17);
  c = await cellBox(page, 417, 17);
  console.log('after undo() 備考 =', JSON.stringify(c.text), await st());
  console.log('LOGS:' + logs.filter(l => !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
