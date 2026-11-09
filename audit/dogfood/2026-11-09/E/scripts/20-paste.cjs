const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  const rowText = async (r, c0, c1) => { const o = []; for (let c = c0; c <= c1; c++) o.push((await cellBox(page, r, c))?.text); return o; };
  // 商品名(5)から 6 列: 商品名 JAN メーカー 仕入先 売価 原価
  const tsv = [
    ['貼り付け商品A', '4900000000016', '鈴木乳業', 'S05', '１，２００', '800'],
    ['貼り付け商品B', '123', '存在しないメーカー', 'S06', '1,500', '2000'],
    ['', '4900000000023', 'M010', 'S07', 'abc', '-5'],
  ].map((r) => r.join('\t')).join('\r\n');
  await page.evaluate((t) => navigator.clipboard.writeText(t), tsv);
  const c = await cellBox(page, 3, 5);
  await page.mouse.click(c.x, c.y); await sleep(100);
  await page.keyboard.press('Control+v'); await sleep(500);
  console.log('canUndo after paste1', await page.evaluate(() => window.__grid.current.canUndo()));
  for (const r of [3, 4, 5]) console.log('row', r, await rowText(r, 5, 10));
  console.log('invalid cells', await page.evaluate(() => [...document.querySelectorAll('.ssg-body-cell--invalid')].map(e => e.closest('[role="row"]').getAttribute('aria-rowindex') + ':' + e.getAttribute('aria-colindex'))));
  await shot(page, '20-paste');
  // 状態・発売日・税率(13..15)へ
  await reveal(page, 3, 13);
  await page.evaluate((t) => navigator.clipboard.writeText(t), ['販売停止\t2026/11/1\t10%', '準備中\t11/1\t8', 'xx\t2026-02-30\t10'].join('\n'));
  const d = await cellBox(page, 3, 13);
  await page.mouse.click(d.x, d.y); await sleep(100);
  await page.keyboard.press('Control+v'); await sleep(500);
  for (const r of [3, 4, 5]) console.log('row', r, await rowText(r, 13, 15));
  // ラベル行をまたぐ貼り付け(C01 の最後 2 行から 4 行)
  await reveal(page, 417, 5);
  await page.evaluate((t) => navigator.clipboard.writeText(t), ['X1', 'X2', 'X3', 'X4'].join('\n'));
  const e = await cellBox(page, 417, 5);
  await page.mouse.click(e.x, e.y); await sleep(100);
  await page.keyboard.press('Control+v'); await sleep(500);
  for (const r of [417, 418, 420, 421]) console.log('row', r, await rowText(r, 4, 5));
  // コピー: 3x3 の範囲
  const f = await cellBox(page, 420, 5);
  console.log('before click f', f, await page.evaluate(() => ({ focus: document.activeElement?.className, active: window.__grid.current.getActiveCell(), u: window.__grid.current.canUndo() })));
  await page.mouse.click(f.x, f.y); await sleep(100);
  console.log('after click f', await page.evaluate(() => ({ focus: document.activeElement?.className, active: window.__grid.current.getActiveCell(), u: window.__grid.current.canUndo() })));
  await page.keyboard.down('Shift'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.up('Shift');
  await page.keyboard.press('Control+c'); await sleep(300);
  console.log('copied (range crosses label):', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText())));
  // undo 3 回
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Control+z'); await sleep(400); console.log('undo', i, await page.evaluate(() => ({ u: window.__grid.current.canUndo(), r: window.__grid.current.canRedo(), active: window.__grid.current.getActiveCell() }))); }
  await reveal(page, 3, 5);
  console.log('after undo x3 row3', await rowText(3, 5, 10));
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
