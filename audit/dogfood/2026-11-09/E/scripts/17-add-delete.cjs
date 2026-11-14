const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  const ids = async (r0, r1) => { const o = []; for (let r = r0; r <= r1; r++) o.push((await cellBox(page, r, 4))?.text); return o; };
  const count = () => page.locator('[data-testid="product-count"]').textContent();
  const st = () => page.evaluate(() => ({ editor: !!document.querySelector('.ssg-cell-editor'), focus: document.activeElement?.className?.toString().slice(0, 40), val: document.activeElement?.value }));
  // 1) 行を追加
  const c = await cellBox(page, 5, 5);
  await page.mouse.click(c.x, c.y); await sleep(150);
  await page.click('[data-testid="add-row"]'); await sleep(500);
  console.log('after add', await count(), await ids(4, 7), await st());
  await page.keyboard.type('New product');
  await page.keyboard.press('Enter'); await sleep(300);
  console.log('typed name', (await cellBox(page, 6, 5))?.text, await st());
  await shot(page, '17-added');
  // 2) チェックボックスで 3 行選んで削除
  for (const r of [8, 9, 10]) {
    const b = await page.evaluate((r) => { for (const row of document.querySelectorAll(`[role="row"][aria-rowindex="${r}"]`)) { const cb = row.querySelector('.ssg-row-checkbox, [role="checkbox"]'); if (cb) { const b = cb.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; } } }, r);
    await page.mouse.click(b.x, b.y); await sleep(100);
  }
  const before = await ids(7, 11);
  await page.click('[data-testid="delete-rows"]'); await sleep(500);
  console.log('delete', await count(), before, '->', await ids(7, 11));
  // Ctrl+Z(フォーカスはボタン)
  await page.keyboard.press('Control+z'); await sleep(400);
  console.log('Ctrl+Z (focus on button)', await count());
  // ヘッダーの ↶ ボタン
  await page.click('[data-testid="undo"]'); await sleep(400);
  console.log('undo button', await count(), await ids(7, 11));
  console.log('row selection after undo', await page.evaluate(() => [...document.querySelectorAll('[role="row"] [role="checkbox"][aria-checked="true"]')].length));
  // 3) 右クリックで複製
  const d = await cellBox(page, 12, 5);
  await page.mouse.click(d.x, d.y, { button: 'right' }); await sleep(400);
  console.log('ctx items', await page.evaluate(() => [...document.querySelectorAll('.ssg-menu-panel .ssg-menu-item, .ssg-menu-panel [role="menuitem"], .ssg-menu-panel *')].filter(e => e.children.length === 0).map(e => e.textContent).filter(Boolean)));
  await shot(page, '17-ctx');
  const dup = await page.evaluate(() => { const e = [...document.querySelectorAll('.ssg-menu-item')].find(e => e.textContent.includes('行を複製')); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.click(dup.x, dup.y); await sleep(400);
  console.log('dup', await count(), await ids(11, 14));
  // キーボードで右クリックメニュー(Shift+F10 / ContextMenu キー)
  const e2 = await cellBox(page, 15, 5);
  await page.mouse.click(e2.x, e2.y); await sleep(100);
  await page.keyboard.press('Shift+F10'); await sleep(300);
  console.log('Shift+F10 menu', await page.evaluate(() => !!document.querySelector('.ssg-menu-panel')));
  await page.keyboard.press('Escape');
  await page.keyboard.press('ContextMenu'); await sleep(300);
  console.log('ContextMenu key menu', await page.evaluate(() => !!document.querySelector('.ssg-menu-panel')));
  await page.keyboard.press('Escape');
  // 4) Ctrl+Z after dup (grid focus)
  await page.mouse.click(e2.x, e2.y); await sleep(100);
  await page.keyboard.press('Control+z'); await sleep(400);
  console.log('undo dup', await count(), await ids(11, 14));
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
