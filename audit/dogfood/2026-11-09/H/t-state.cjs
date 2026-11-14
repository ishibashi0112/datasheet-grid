const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
const headers = (page) => page.evaluate(() => [...document.querySelectorAll('[aria-label="タスク一覧"] [role="columnheader"][data-ssg-col-key]')].map(h => h.dataset.ssgColKey + '@' + h.closest('[data-pane]')?.dataset.pane + ':' + Math.round(h.getBoundingClientRect().width)));
const snapshot = async (page) => ({ headers: await headers(page), bars: await bars(page), groups: (await groupRows(page)).slice(0, 4).map(g => g.label + g.count + g.expanded), badge: await page.getByTestId('grouping').innerText(), expanded: await page.locator(`${G} .ssg-detail-card`).count() });
(async () => {
  const { browser, page, logs } = await open();
  await openColumnMenu(page, 'estimate'); await clickMenu(page, '降順で並び替え');
  await openColumnMenu(page, 'priority'); await clickMenu(page, 'フィルター…');
  await page.waitForTimeout(800);
  await page.locator('label', { hasText: /^低$/ }).first().click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // pin progress right
  await openColumnMenu(page, 'progress');
  await page.locator('.ssg-menu-item', { hasText: '列の固定' }).first().hover(); await page.waitForTimeout(300);
  await page.locator('.ssg-menu-item', { hasText: '右に固定' }).click(); await page.waitForTimeout(400);
  // hide wbs via tool panel
  await openColumnMenu(page, 'wbs'); await clickMenu(page, '列の表示'); await page.waitForTimeout(800);
  await page.locator('.ssg-chooser-toggle', { has: page.locator('.ssg-chooser-label', { hasText: /^WBS$/ }) }).click();
  await page.locator('.ssg-toolpanel .ssg-popover-close').click(); await page.waitForTimeout(300);
  // resize title
  const th = page.locator(`${G} [role="columnheader"][data-ssg-col-key="title"]`);
  const hb = await th.boundingBox();
  await page.mouse.move(hb.x + hb.width - 2, hb.y + hb.height / 2); await page.mouse.down();
  await page.mouse.move(hb.x + hb.width + 60, hb.y + hb.height / 2, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(300);
  // group by phase
  await openColumnMenu(page, 'phase'); await clickMenu(page, 'この列でグループ化'); await page.waitForTimeout(600);
  // global filter
  await page.locator('.ssg-bar-input').fill('API');
  await page.waitForTimeout(800);
  // expand a detail row: first leaf
  const firstLeaf = await page.evaluate(() => [...document.querySelectorAll('[aria-label="タスク一覧"] [data-pane="left"][data-row-key]')].sort((a, b) => a.dataset.rowIndex - b.dataset.rowIndex)[0].dataset.rowKey);
  await page.locator(`${G} [data-row-key="${firstLeaf}"] button.ssg-detail-toggle`).first().click();
  await page.waitForTimeout(600);
  const before = await snapshot(page);
  log('before reload', JSON.stringify(before, null, 0));
  log('saved', await page.evaluate(() => JSON.stringify({ s: localStorage.getItem('wbs-grid-state'), g: localStorage.getItem('wbs-grid-grouping'), e: localStorage.getItem('wbs-grid-expanded') })));
  logs.length = 0;
  await page.reload();
  await page.waitForSelector('[role="grid"]'); await page.waitForTimeout(1500);
  const after = await snapshot(page);
  log('after reload', JSON.stringify(after, null, 0));
  for (const k of Object.keys(before)) log(k, JSON.stringify(before[k]) === JSON.stringify(after[k]) ? 'SAME' : 'DIFF');
  await page.screenshot({ path: 'shots/st-after-reload.png' });
  log(logs.join('\n'));
  await browser.close();
})();
