const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  const idText = async (r) => (await cellBox(page, r, 4))?.text;
  const handle = (r) => page.evaluate((r) => {
    for (const row of document.querySelectorAll(`[role="row"][aria-rowindex="${r}"]`)) {
      const h = row.querySelector('.ssg-row-drag-handle');
      if (h) { const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, cls: h.className }; }
    }
    return null;
  }, r);
  const drag = async (fromR, toY, steps = 12) => {
    const h = await handle(fromR);
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) { await page.mouse.move(h.x, h.y + ((toY - h.y) * i) / steps); await sleep(30); }
    return h;
  };
  const out = {};
  // 1) カテゴリ内: P-00003 (aria 5) を P-00006 の下へ
  out.before = [await idText(5), await idText(6), await idText(7), await idText(8)];
  const target = await cellBox(page, 8, 4);
  await drag(5, target.y + target.h / 2 - 2);
  await shot(page, '07-drag-within-mid');
  await page.mouse.up();
  await sleep(600);
  out.after = [await idText(5), await idText(6), await idText(7), await idText(8)];
  out.log1 = await page.locator('[data-testid="move-log"]').textContent();
  // 2) Ctrl+Z で戻る
  await page.keyboard.press('Control+z');
  await sleep(400);
  out.afterUndo = [await idText(5), await idText(6), await idText(7), await idText(8)];
  // 3) カテゴリ境界へスクロール(C02 のラベルは aria 419)
  await reveal(page, 421, 4); await page.mouse.wheel(0, 120);
  await sleep(500);
  const lb = await page.evaluate(() => { const r = document.querySelector('[role="row"][aria-rowindex="419"]'); const b = r.getBoundingClientRect(); return { y: b.y, h: b.height, text: r.textContent }; });
  out.label419 = lb;
  await shot(page, '07-boundary');
  // P-00416 (aria 418) を C02 の最初の行(aria 420)の下へ
  const t420 = await cellBox(page, 420, 4);
  out.cross_before = [await idText(417), await idText(418), await idText(420), await idText(421)];
  await drag(418, t420.y + t420.h / 2 + 4);
  await shot(page, '07-drag-cross-mid');
  await page.mouse.up();
  await sleep(800);
  out.cross_after = [await idText(417), await idText(418), await idText(420), await idText(421)];
  out.msg = await page.locator('[data-testid="message"]').textContent().catch(() => null);
  out.log2 = await page.locator('[data-testid="move-log"]').textContent();
  out.canRedo = await page.evaluate(() => null);
  await shot(page, '07-after-cross');
  // 4) Esc でキャンセル
  const t5 = await cellBox(page, 417, 4);
  const beforeEsc = [await idText(415), await idText(416), await idText(417)];
  await drag(415, t5.y + 10);
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.mouse.up();
  await sleep(500);
  out.esc = [beforeEsc, [await idText(415), await idText(416), await idText(417)]];
  // 5) Ctrl+Y (redo) after the cross-category undo — does it re-apply the forbidden move?
  await page.keyboard.press('Control+y');
  await sleep(500);
  out.afterRedo = [await idText(417), await idText(418), await idText(420), await idText(421)];
  console.log(JSON.stringify(out, null, 1));
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
