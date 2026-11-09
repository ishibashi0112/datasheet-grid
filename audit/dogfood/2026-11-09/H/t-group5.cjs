const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
const clip = (page) => page.evaluate(() => navigator.clipboard.readText());
(async () => {
  const { browser, page, logs } = await open();
  // view: 加藤 陽菜 > レビュー中 (49 rows), then 完了 subgroup. Find the last leaf of レビュー中: row index 50 (0:grp,1:grp,2..50 leaves), 51: 完了 group
  const keyAt = (i) => page.evaluate((i) => document.querySelector(`[aria-label="タスク一覧"] [data-pane="left"][data-row-index="${i}"]`)?.dataset.rowKey ?? 'GROUP', i);
  // scroll to show row 50
  await page.locator(G).evaluate(e => e.scrollTop = 36 * 40);
  await page.waitForTimeout(400);
  const k49 = await keyAt(49), k50 = await keyAt(50), k51 = await keyAt(51), k52 = await keyAt(52), k53 = await keyAt(53);
  log('keys', k49, k50, k51, k52, k53);
  // range select title from row 49 to 53 (crossing group row 51), copy
  const a = await cell(page, k49, 'title');
  await a.click();
  await page.keyboard.down('Shift');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Shift');
  await page.waitForTimeout(200);
  log('bars', JSON.stringify(await bars(page)));
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(300);
  log('copied', JSON.stringify(await clip(page)));
  // paste 4 lines starting at row 49 title
  await page.evaluate(() => navigator.clipboard.writeText('P1\nP2\nP3\nP4'));
  await a.click();
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(500);
  const t = async (k) => k === 'GROUP' ? 'GROUP' : (await (await cell(page, k, 'title')).innerText());
  log('after paste titles', await t(k49), await t(k50), await t(k52), await t(k53), 'next', await t(await keyAt(54)));
  log('group label row51', JSON.stringify((await groupRows(page)).filter(g => g.i === 51)));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  // Delete over range crossing group row
  await a.click();
  await page.keyboard.down('Shift'); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown'); await page.keyboard.up('Shift');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(400);
  log('after delete', await t(k49), await t(k50), await t(k52), JSON.stringify((await groupRows(page)).filter(g => g.i === 51).map(g => g.label + g.count)));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  // keyboard: ArrowDown from row 50 lands on group row 51?
  await (await cell(page, k50, 'title')).click();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  log('ArrowDown from last leaf -> bars', JSON.stringify((await bars(page))[1]));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  log('Enter on group row -> group 51', JSON.stringify((await groupRows(page)).filter(g => g.i === 51).map(g => g.label + g.expanded)));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  // F2 on group row
  await page.keyboard.press('F2');
  await page.waitForTimeout(200);
  log('F2 on group row editor?', await page.locator('.ssg-cell-editor').count());
  // typing on group row
  await page.keyboard.type('x');
  await page.waitForTimeout(200);
  log('typing on group row editor?', await page.locator('.ssg-cell-editor').count());
  await page.keyboard.press('Escape');
  // Edit status of a leaf via select -> moves group
  await (await cell(page, k50, 'title')).click();
  log('row50 key', k50);
  // status column is hidden (grouped) -> cannot edit; edit priority instead via select editor and check Enter move
  await (await cell(page, k49, 'priority')).dblclick();
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  log('after select commit bars', JSON.stringify((await bars(page))[1]));
  // Ctrl+End, Ctrl+Home
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(400);
  log('Ctrl+End', JSON.stringify((await bars(page))[1]));
  await page.keyboard.press('Control+Home');
  await page.waitForTimeout(400);
  log('Ctrl+Home', JSON.stringify((await bars(page))[1]));
  // Ctrl+A then Ctrl+C - count lines
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(800);
  const all = await clip(page);
  log('ctrl+a copy lines', all.split('\n').length, JSON.stringify(all.split('\n').slice(0, 3)));
  // right click on group row
  await page.keyboard.press('Escape');
  await page.locator(G).evaluate(e => e.scrollTop = 0);
  await page.waitForTimeout(300);
  const grp = page.locator(`${G} [data-ssg-group-row][data-row-index="0"] [data-ssg-col-key="estimate"]`).first();
  await grp.click({ button: 'right' });
  await page.waitForTimeout(300);
  log('context menu on group row', await page.locator('.ssg-menu-panel .ssg-menu-item').allInnerTexts());
  await page.keyboard.press('Escape');
  log(logs.join('\n'));
  await browser.close();
})();
