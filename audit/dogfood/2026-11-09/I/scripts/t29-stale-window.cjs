// 表を手で変えた直後(古い印が付く前)に、AI のバーの「元に戻す」やチップの × を押したら?
const { open, askBar, barText, state, counts } = require('./lib.cjs');
const tail = async (page) => (await barText(page)).split('\n').slice(7).join(' / ');
const f = async (page) => JSON.stringify((await state(page)).filters.columnFilters);
(async () => {
  const { browser, page, logs } = await open();
  // 1. 「元に戻す」: 前の状態 = 状態が未入金。AI で 関東の 10 万円以上 → 手で数量のフィルター(applyState)→ すぐ元に戻す
  await askBar(page, '状態が未入金のもの');
  await page.getByRole('button', { name: '閉じる' }).click();
  await askBar(page, '関東の 10 万円以上');
  // 手で:グリッドのチップバーの × で地域を外す
  await page.locator('.ssg-filter-chip', { hasText: '地域' }).locator('button').last().click();
  const t0 = Date.now();
  await page.getByRole('button', { name: '元に戻す' }).click({ timeout: 800 }).then(() => console.log('1 clicked undo after', Date.now() - t0, 'ms')).catch(() => console.log('1 undo button already gone'));
  await page.waitForTimeout(1300);
  console.log('1 result', await tail(page), await f(page), await counts(page));
  // 2. AI のチップの ×: AI で 関東の 10 万円以上 → 手で地域を外す → すぐ AI の「金額」チップの ×
  await page.getByRole('button', { name: '閉じる' }).click().catch(() => {});
  await askBar(page, '関東の 10 万円以上');
  await page.locator('.ssg-filter-chip', { hasText: '地域' }).locator('button').last().click();
  const t1 = Date.now();
  await page.getByRole('button', { name: /金額 100,000 以上 を外す/ }).click({ timeout: 800 }).then(() => console.log('2 clicked chip x after', Date.now() - t1, 'ms')).catch(() => console.log('2 chip already gone'));
  await page.waitForTimeout(1300);
  console.log('2 result', await tail(page), await f(page), await counts(page));
  // 3. 手でセルのフィルターを開いて数量を足してすぐ元に戻す(applyState 経由)
  await page.getByRole('button', { name: '閉じる' }).click().catch(() => {});
  await askBar(page, '関東の 10 万円以上');
  await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: { ...window.__grid.getState().filters.columnFilters, qty: { kind: 'number', raw: '5 以上', parsed: { mode: 'comparison', operator: '>=', value: 5 } } } } }));
  const t2 = Date.now();
  await page.getByRole('button', { name: '元に戻す' }).click({ timeout: 800 }).then(() => console.log('3 clicked undo after', Date.now() - t2, 'ms')).catch(() => console.log('3 undo button already gone'));
  await page.waitForTimeout(1300);
  console.log('3 result', await tail(page), await f(page), await counts(page));
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
