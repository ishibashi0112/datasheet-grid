const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
const viewSum = (page) => page.evaluate(() => { const d = window.__app.grid.getExportData(); return { n: d.rows.length, sum: d.rows.reduce((s, r) => s + (Number(r[2].value) || 0), 0) }; });
async function openMenu(page, title) {
  const hb = await page.evaluate((t) => { const h = [...document.querySelectorAll('[role="columnheader"]')].find((e) => e.textContent.trim().startsWith(t)); const r = h.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, title);
  await page.mouse.move(hb.cx, hb.cy); await page.waitForTimeout(150);
  await page.click(`[aria-label="${title} の列メニュー"]`); await page.waitForTimeout(250);
}
(async () => {
  const { browser, page, logs } = await L.open();
  await openMenu(page, '金額');
  await page.locator('.ssg-menu-panel').getByText('降順で並び替え').click();
  await page.waitForTimeout(500);
  console.log('sorted top 3', await L.cellText(page, 1, '金額'), await L.cellText(page, 2, '金額'), await L.cellText(page, 3, '金額'));
  // filter 区分 = 交通費 only
  await openMenu(page, '区分');
  await page.locator('.ssg-menu-panel').getByText('フィルター…', { exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator('.ssg-filter-popover, .ssg-popover').getByText('（すべて選択）').click();
  await page.waitForTimeout(100);
  await page.locator('.ssg-filter-popover, .ssg-popover').getByText('交通費', { exact: true }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  const vs = await viewSum(page);
  console.log('filtered view', vs, 'total row', await L.totalRowText(page), 'header', await L.headerTotal(page));
  console.log('top bar', await page.evaluate(() => document.querySelector('.ssg-root').innerText.split('\n').slice(0, 6).join(' | ')));
  await L.shot(page, '11a-sorted-filtered');
  // edit amount of the first visible (draft?) row
  let r1 = await L.cellText(page, 1, '状態');
  console.log('first row status', r1);
  // find first draft row in view
  const exp = await page.evaluate(() => window.__app.grid.getExportData());
  const idx = exp.rows.findIndex((r) => r[6].value === 'draft');
  console.log('first draft view index', idx);
  await L.clickCell(page, idx + 1, '金額');
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  console.log('after edit view', await viewSum(page), 'total row', await L.totalRowText(page));
  console.log('active after edit', JSON.stringify(await page.evaluate(() => window.__app.grid.getActiveCell())));
  await L.shot(page, '11b-after-edit-sorted');
  // undo with Ctrl+Z
  await page.keyboard.press('Control+z'); await page.waitForTimeout(400);
  console.log('after undo view', await viewSum(page), 'total row', await L.totalRowText(page));
  // add via form while filtered/sorted (category 会議費 → hidden by filter)
  await page.fill('input[name="amount"]', '1000');
  await page.selectOption('select[name="category"]', 'meal');
  await page.click('[data-testid="add-btn"]'); await page.waitForTimeout(400);
  console.log('after add (filtered out)', await viewSum(page), 'rows', (await rowsOf(page)).length, 'header', await L.headerTotal(page));
  await page.fill('input[name="amount"]', '2000');
  await page.selectOption('select[name="category"]', 'transport');
  await page.click('[data-testid="add-btn"]'); await page.waitForTimeout(400);
  const exp2 = await page.evaluate(() => window.__app.grid.getExportData());
  console.log('after add 交通費 2000', await viewSum(page), 'position in view', exp2.rows.findIndex((r) => r[2].value === 2000), 'total row', await L.totalRowText(page));
  // getViewRowIndex for new row
  const rows = await rowsOf(page);
  const last = rows[rows.length - 1];
  console.log('getViewRowIndex(new)', await page.evaluate((k) => window.__app.grid.getViewRowIndex(k), last.id), 'getRowNumber', await page.evaluate((k) => window.__app.grid.getRowNumber(k), last.id));
  // clear filter via top bar chips / filter management: use applyState
  console.log('state', JSON.stringify(await page.evaluate(() => window.__app.grid.getState())).slice(0, 300));
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
