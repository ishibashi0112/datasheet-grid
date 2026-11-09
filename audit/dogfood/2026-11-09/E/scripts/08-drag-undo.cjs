const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:5405/';
  const { browser, page, logs } = await open(url);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  const idText = async (r) => (await cellBox(page, r, 4))?.text;
  const handle = (r) => page.evaluate((r) => {
    for (const row of document.querySelectorAll(`[role="row"][aria-rowindex="${r}"]`)) {
      const h = row.querySelector('.ssg-row-drag-handle');
      if (h) { const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
    }
  }, r);
  const focus = () => page.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className);
  const order = async () => [await idText(5), await idText(6), await idText(7), await idText(8)];
  console.log('initial focus', await focus(), await order());
  const h = await handle(5);
  const t = await cellBox(page, 8, 4);
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(h.x, h.y + (t.y + t.h / 2 - 2 - h.y) * i / 10); await sleep(30); }
  await page.mouse.up(); await sleep(500);
  console.log('after drag focus', await focus(), await order());
  await page.keyboard.press('Control+z'); await sleep(400);
  console.log('after Ctrl+Z (no click)', await focus(), await order());
  // セルを押してから Ctrl+Z
  const c = await cellBox(page, 10, 5);
  await page.mouse.click(c.x, c.y); await sleep(200);
  await page.keyboard.press('Control+z'); await sleep(400);
  console.log('after click + Ctrl+Z', await focus(), await order());
  await page.keyboard.press('Control+y'); await sleep(400);
  console.log('after Ctrl+Y', await focus(), await order());
  // 先にセルを選んでいた場合
  await page.keyboard.press('Control+z'); await sleep(400);
  const h2 = await handle(5);
  await page.mouse.move(h2.x, h2.y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(h2.x, h2.y + (t.y + t.h / 2 - 2 - h2.y) * i / 10); await sleep(30); }
  await page.mouse.up(); await sleep(500);
  console.log('2nd drag (grid had focus before)', await focus(), await order());
  await page.keyboard.press('Control+z'); await sleep(400);
  console.log('Ctrl+Z', await focus(), await order());
  console.log(logs.filter(l => !l.includes('vite') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
