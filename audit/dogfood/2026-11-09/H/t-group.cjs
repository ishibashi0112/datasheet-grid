const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
(async () => {
  const { browser, page, logs } = await open();
  let gr = await groupRows(page);
  log('initial groups', JSON.stringify(gr.slice(0, 3)));
  log('total', JSON.stringify(await totalRow(page)));
  // 1. collapse sub-group via chevron
  await page.locator(`${G} button[aria-label="レビュー中 を折りたたみ"]`).first().click();
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'shots/g-collapse-mid.png', clip: { x: 0, y: 130, width: 1600, height: 400 } });
  await page.waitForTimeout(500);
  gr = await groupRows(page);
  log('after collapse', JSON.stringify(gr.slice(0, 4)));
  // 2. click on group cell and Enter to toggle
  const sub = page.locator(`${G} [data-ssg-group-row][data-row-index="1"] [data-ssg-col-key="__ssg_group__"] .ssg-group-label`).first();
  await sub.click();
  await page.waitForTimeout(150);
  log('bars after click group', JSON.stringify(await bars(page)));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  gr = await groupRows(page);
  log('after Enter', JSON.stringify(gr.slice(0, 3).map(g => [g.label, g.expanded])));
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  gr = await groupRows(page);
  log('after Space', JSON.stringify(gr.slice(0, 3).map(g => [g.label, g.expanded])));
  // dblclick
  await sub.dblclick();
  await page.waitForTimeout(500);
  gr = await groupRows(page);
  log('after dblclick', JSON.stringify(gr.slice(0, 3).map(g => [g.label, g.expanded])));
  // 3. collapse all / expand all
  await page.getByRole('button', { name: 'すべて閉じる', exact: true }).click();
  await page.waitForTimeout(600);
  gr = await groupRows(page);
  log('collapseAll groups visible', gr.length, gr.map(g => g.label + g.count).join(','));
  log('aria-rowcount', await page.locator(G).getAttribute('aria-rowcount'));
  await page.screenshot({ path: 'shots/g-collapsed-all.png' });
  await page.getByRole('button', { name: 'すべて開く', exact: true }).click();
  await page.waitForTimeout(600);
  log('aria-rowcount after expandAll', await page.locator(G).getAttribute('aria-rowcount'));
  // 4. edit estimate of T-00001 and check aggregates
  const before = await groupRows(page);
  log('before edit agg', JSON.stringify(before.slice(0, 2).map(g => g.vals)));
  const tot0 = await totalRow(page);
  const est = await cell(page, 'T-00001', 'estimate');
  await est.click();
  await page.keyboard.type('130.5');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const after = await groupRows(page);
  log('after edit agg', JSON.stringify(after.slice(0, 2).map(g => g.vals)));
  log('total before/after', JSON.stringify(tot0), JSON.stringify(await totalRow(page)));
  // undo
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  log('after undo agg', JSON.stringify((await groupRows(page)).slice(0, 2).map(g => g.vals)), 'cell', await (await cell(page, 'T-00001', 'estimate')).innerText());
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(400);
  log('after redo cell', await (await cell(page, 'T-00001', 'estimate')).innerText());
  // 5. edit progress of a leaf
  const pr = await cell(page, 'T-00118', 'progress');
  await pr.click();
  await page.keyboard.type('0');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  log('after progress edit', JSON.stringify((await groupRows(page)).slice(0, 2).map(g => g.vals.progress)));
  log(logs.join('\n'));
  await browser.close();
})();
