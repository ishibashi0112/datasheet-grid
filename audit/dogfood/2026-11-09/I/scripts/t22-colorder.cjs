const { open, askBar, barText, state } = require('./lib.cjs');
const tail = async (page) => (await barText(page)).split('\n').slice(7).join(' / ');
const cols = (page) => page.evaluate(() => window.__columns.map((c) => c.key + (c.visible === false ? '(h)' : '') + (c.pinned ? `[${c.pinned}]` : '') + (c.width !== undefined ? '' : '')).join(','));
(async () => {
  const { browser, page, logs } = await open();
  await page.click('[data-testid=toggle-colvis]');
  await askBar(page, 'メモ列を隠して');
  console.log('1 hidden:', await cols(page));
  // 手で列を固定(列メニュー → 列の固定 → 左)
  const h = page.locator('.ssg-header-cell', { hasText: '担当' }).first();
  await h.hover();
  await page.getByRole('button', { name: '担当 の列メニュー' }).click();
  await page.locator('.ssg-menu-item', { hasText: '列の固定' }).hover();
  await page.waitForTimeout(500);
  const sub = await page.$$eval('.ssg-menu-item', (ms) => ms.map((m) => m.textContent));
  console.log(' submenu', sub.slice(-5));
  await page.locator('.ssg-menu-item', { hasText: /左/ }).first().click();
  await page.waitForTimeout(500);
  // 手で列の幅を変える
  const hh = await page.locator('.ssg-header-cell', { hasText: '商品' }).first().boundingBox();
  await page.mouse.move(hh.x + hh.width - 2, hh.y + 20);
  await page.mouse.down(); await page.mouse.move(hh.x + hh.width + 60, hh.y + 20, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(1300);
  console.log('2 after pin+resize:', await cols(page), JSON.stringify((await state(page)).columnWidths), '|', await tail(page));
  await page.getByRole('button', { name: '元に戻す' }).click();
  await page.waitForTimeout(500);
  console.log('3 after undo:', await cols(page), JSON.stringify((await state(page)).columnWidths), '|', await tail(page));
  // 手で隠す(列メニューの「列の表示」or ツールパネル)→ AI のチップは古くなる?
  await askBar(page, '関東の 10 万円以上');
  await page.evaluate(() => window.__grid.applyState({ columns: window.__grid.getState().columns.map((c) => (c.key === 'customer' ? { ...c, visible: false } : c)) }));
  await page.waitForTimeout(1300);
  console.log('4 hand-hide w/ colvis:', await cols(page), '|', await tail(page));
  await page.click('[data-testid=toggle-colvis]');
  await askBar(page, '状態が未入金のもの');
  await page.evaluate(() => window.__grid.applyState({ columns: window.__grid.getState().columns.map((c) => (c.key === 'rep' ? { ...c, visible: false } : c)) }));
  await page.waitForTimeout(1300);
  console.log('5 hand-hide w/o colvis:', await cols(page), '|', await tail(page));
  await page.getByRole('button', { name: '元に戻す' }).click().catch(() => console.log(' (no undo)'));
  await page.waitForTimeout(500);
  console.log('6 undo w/o colvis:', await cols(page), '|', await tail(page));
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
