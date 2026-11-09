const { open, shot, cellRect, clickCell, gridState, ensureVisible, dumpLogs } = require('./lib.cjs');
const clickMonth = async (page, key) => { await page.locator(`button[data-month="${key}"]`).click(); await page.waitForTimeout(500); };
const counts = (page) => page.evaluate(() => {
  const g = window.__grid.current; const st = g.getState();
  return { filters: JSON.stringify(st.filters.columnFilters), sort: JSON.stringify(st.sort), bar: [...document.querySelectorAll('.ssg-root > *')][0].innerText.replace(/\n/g, ' '), visibleStaff: document.querySelectorAll('.ssg-body-row[data-row-key][data-pane="left"]').length, labels: [...document.querySelectorAll('.ssg-label-row[data-pane="left"]')].map((e) => e.getAttribute('aria-label')).join(',') };
});
(async () => {
  const { browser, page, logs } = await open();
  // d31 の列メニュー → フィルター → set で 夜 だけ
  await ensureVisible(page, 'S001', 'd31');
  const hb = await page.locator('[role="columnheader"][data-ssg-col-key="d31"]').boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.waitForTimeout(200);
  await page.locator('[role="columnheader"][data-ssg-col-key="d31"] button[aria-label*="列メニュー"]').click();
  await page.waitForTimeout(200);
  await page.getByText('フィルター…').click();
  await page.waitForTimeout(600);
  await shot(page, '27-set-filter-popover');
  const pop = await page.evaluate(() => document.querySelector('.ssg-filter-popover')?.innerText.replace(/\n/g, '|'));
  console.log('popover:', pop);
  // 「すべて」を外して 夜 だけ
  const labels = await page.locator('.ssg-filter-popover label').allInnerTexts();
  console.log('labels', labels);
  await page.locator('.ssg-filter-popover label', { hasText: /すべて/ }).first().click();
  await page.locator('.ssg-filter-popover label', { hasText: /^夜/ }).first().click();
  await page.waitForTimeout(200);
  const applyBtn = page.locator('.ssg-filter-popover button', { hasText: /適用|OK/ });
  if (await applyBtn.count()) await applyBtn.first().click();
  else await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  console.log('Dec filtered', JSON.stringify(await counts(page)));
  await shot(page, '28-dec-filtered-d31');
  // 夜勤回数で降順
  const hn = await page.locator('[role="columnheader"][data-ssg-col-key="nightCount"]').boundingBox();
  await page.mouse.move(hn.x + hn.width / 2, hn.y + hn.height / 2); await page.waitForTimeout(200);
  await page.locator('[role="columnheader"][data-ssg-col-key="nightCount"] button[aria-label*="列メニュー"]').click();
  await page.waitForTimeout(200);
  await page.getByText('降順で並び替え').click();
  await page.waitForTimeout(500);
  console.log('Dec filtered+sorted', JSON.stringify(await counts(page)));
  await shot(page, '29-dec-sorted');
  await clickMonth(page, '2027-02');
  console.log('Feb (d31 gone)', JSON.stringify(await counts(page)));
  await shot(page, '30-feb-with-d31-filter');
  await clickMonth(page, '2026-12');
  console.log('Dec again', JSON.stringify(await counts(page)));
  dumpLogs(logs);
  await browser.close();
})();
