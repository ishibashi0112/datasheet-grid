const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  const col = async (r0, r1, c) => { const o = []; for (let r = r0; r <= r1; r++) o.push((await cellBox(page, r, c))?.text); return o; };
  const fillHandle = () => page.evaluate(() => { const h = document.querySelector('.ssg-fill-handle, [class*="fill-handle"]'); if (!h) return null; const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, cls: h.className }; });
  // 1) 在庫(12)の P-00001 を 4 行下へ(コピー)
  const c = await cellBox(page, 3, 12);
  await page.mouse.click(c.x, c.y);
  await sleep(200);
  let fh = await fillHandle();
  console.log('handle', fh);
  const t = await cellBox(page, 7, 12);
  await page.mouse.move(fh.x, fh.y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(fh.x, fh.y + (t.y - fh.y) * i / 10); await sleep(30); }
  await shot(page, '12-fill-drag');
  await page.mouse.up(); await sleep(400);
  console.log('stock copy', await col(3, 7, 12));
  // 2) 商品コードは編集不可、商品名 2 行 + 備考
  // 3) 発売日 1 つを下へ(連続)
  const d = await cellBox(page, 3, 14);
  await reveal(page, 3, 14);
  const d2 = await cellBox(page, 3, 14);
  await page.mouse.click(d2.x, d2.y); await sleep(200);
  fh = await fillHandle();
  const t2 = await cellBox(page, 6, 14);
  await page.mouse.move(fh.x, fh.y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(fh.x, fh.y + (t2.y - fh.y) * i / 10); await sleep(30); }
  await page.mouse.up(); await sleep(400);
  console.log('date series', await col(3, 6, 14));
  await page.keyboard.press('Control+z'); await sleep(300);
  console.log('after undo', await col(3, 6, 14));
  // 4) カテゴリ境界をまたいで埋める(在庫、aria 416..418 → 422)
  await reveal(page, 417, 12);
  await sleep(200);
  const e = await cellBox(page, 417, 12);
  await page.mouse.click(e.x, e.y); await sleep(200);
  fh = await fillHandle();
  const t3 = await cellBox(page, 422, 12);
  await page.mouse.move(fh.x, fh.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(fh.x, fh.y + (t3.y - fh.y) * i / 12); await sleep(30); }
  await shot(page, '12-fill-cross-label');
  await page.mouse.up(); await sleep(400);
  console.log('cross label', await col(416, 423, 12));
  // 5) select 列(状態)のコピー、メーカー
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
