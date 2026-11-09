const { open, askBar, barText, state, counts } = require('./lib.cjs');
const tail = async (page) => (await barText(page)).split('\n').slice(7).join(' / ');
(async () => {
  const { browser, page, logs } = await open();
  // (e) セルの編集 → 古くならないはず
  await askBar(page, '関東の 10 万円以上');
  const cell = page.locator('.ssg-body-row[data-pane="center"][data-row-index="0"] .ssg-body-cell').nth(7); // 顧客
  await cell.dblclick();
  await page.keyboard.type('X');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1300);
  console.log('(e) after cell edit:', await tail(page));
  // (f) 列幅の変更(ドラッグ)→ 古くならないはず
  const hdr = await page.locator('.ssg-header-cell', { hasText: '担当' }).first().boundingBox();
  await page.mouse.move(hdr.x + hdr.width - 2, hdr.y + hdr.height / 2);
  await page.mouse.down();
  await page.mouse.move(hdr.x + hdr.width + 40, hdr.y + hdr.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(1300);
  console.log('(f) after resize:', await tail(page), JSON.stringify((await state(page)).columnWidths));
  // (a) グリッドのチップバーの × で地域を外す
  await page.locator('.ssg-filter-chip', { hasText: '地域' }).locator('button').last().click().catch(async (e) => console.log('chip click failed', e.message));
  await page.waitForTimeout(300);
  console.log('(a) right after grid chip ×:', await tail(page));
  await page.waitForTimeout(1200);
  console.log('(a) 1.2s later:', await tail(page), await counts(page));
  await page.screenshot({ path: 'shots/08-stale.png' });
  // 古い状態で「元に戻す」が押せないこと(ボタンが無い)
  console.log('(a) undo buttons', await page.getByRole('button', { name: '元に戻す' }).count());
  // (b) グローバルフィルター
  await askBar(page, '関東の 10 万円以上');
  await page.click('.ssg-root input[placeholder="グローバルフィルター"]');
  await page.keyboard.type('田中');
  await page.waitForTimeout(1300);
  console.log('(b) after global filter typing:', await tail(page));
  // (c) 見出しを押して並べ替え
  await askBar(page, '関東の 10 万円以上');
  await page.keyboard.down('Shift');
  await page.locator('.ssg-header-cell', { hasText: '数量' }).first().click();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(1300);
  console.log('(c) after header click:', await tail(page), JSON.stringify((await state(page)).sort));
  // (d) applyState(コードから)→ 1 秒ごとの確認で古くなるはず
  await askBar(page, '今月の分');
  await page.evaluate(() => window.__grid.applyState({ sort: [{ columnKey: 'date', direction: 'asc' }] }));
  await page.waitForTimeout(1500);
  console.log('(d) after applyState:', await tail(page));
  // (h) 反映 → 手で変える → 手で元へ戻す(同じ見え方)→ チップは戻る?
  await askBar(page, '状態が未入金のもの');
  const st = await state(page);
  await page.evaluate(() => window.__grid.applyState({ filters: { globalText: 'abc' } }));
  await page.waitForTimeout(1300);
  console.log('(h1) changed:', await tail(page));
  await page.evaluate((s) => window.__grid.applyState({ filters: s.filters }), st);
  await page.waitForTimeout(1300);
  console.log('(h2) back to same view:', await tail(page));
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
