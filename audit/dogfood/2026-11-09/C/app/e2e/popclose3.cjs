const { open, shot, cellRect, ensureVisible, dumpLogs } = require('./lib.cjs');
const st = (page) => page.evaluate(() => ({ pop: !!document.querySelector('.ssg-filter-popover'), menu: !!document.querySelector('.ssg-menu-panel'), active: document.activeElement?.className?.toString().slice(0, 40) || document.activeElement?.tagName }));
async function openFilter(page, key) {
  const hb = await page.locator(`[role="columnheader"][data-ssg-col-key="${key}"]`).boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.waitForTimeout(200);
  const b = await page.locator(`[role="columnheader"][data-ssg-col-key="${key}"] button[aria-label*="列メニュー"]`).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(250);
  await page.getByText('フィルター…').click(); await page.waitForTimeout(500);
}
(async () => {
  const { browser, page, logs } = await open();
  await ensureVisible(page, 'S001', 'd20');
  // A: 開いてすぐセルを押す
  await openFilter(page, 'd20');
  console.log('A open', JSON.stringify(await st(page)));
  let r = await cellRect(page, 'S003', 'd21');
  console.log('cell rect', JSON.stringify(r));
  await page.mouse.click(r.cx, r.cy); await page.waitForTimeout(400);
  console.log('A after cell click', JSON.stringify(await st(page)));
  await shot(page, '57-filter-after-cellclick');
  // B: 開いて、チェックを変えてからセルを押す
  if ((await st(page)).pop) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await openFilter(page, 'd20');
  await page.locator('.ssg-filter-popover label', { hasText: /^夜/ }).first().click(); await page.waitForTimeout(200);
  console.log('B after check', JSON.stringify(await st(page)));
  const firstKey = await page.evaluate(() => [...document.querySelectorAll('.ssg-body-row[data-row-key^="S"]')].map(e=>e.getAttribute('data-row-key'))[2]);
  console.log('first visible staff', firstKey);
  r = await cellRect(page, firstKey, 'd21');
  await page.mouse.click(r.cx, r.cy); await page.waitForTimeout(400);
  console.log('B after cell click', JSON.stringify(await st(page)));
  // C: ページの外 (ツールバーの余白) を押す
  if (!(await st(page)).pop) await openFilter(page, 'd20');
  await page.mouse.click(700, 20); await page.waitForTimeout(400);
  console.log('C after toolbar click', JSON.stringify(await st(page)));
  // D: 別の列見出しのテキストを押す
  if (!(await st(page)).pop) await openFilter(page, 'd20');
  const hb = await page.locator(`[role="columnheader"][data-ssg-col-key="name"]`).boundingBox();
  await page.mouse.click(hb.x + 20, hb.y + hb.height / 2); await page.waitForTimeout(400);
  console.log('D after header click', JSON.stringify(await st(page)));
  dumpLogs(logs);
  await browser.close();
})();
