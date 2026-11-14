const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
const menuItems = (page) => page.evaluate(() => [...document.querySelectorAll('.ssg-menu-item')].map(e => e.textContent.trim()));
(async () => {
  const { browser, page, logs } = await open();
  // group by phase additionally
  await openColumnMenu(page, 'phase');
  log('phase menu', JSON.stringify(await menuItems(page)));
  await clickMenu(page, 'この列でグループ化');
  await page.waitForTimeout(800);
  log('badge', await page.getByTestId('grouping').innerText());
  let gr = await groupRows(page);
  log('3 levels', JSON.stringify(gr.slice(0, 4).map(g => g.indent + ' ' + g.label + g.count)));
  log('header', await page.locator(`${G} [role="columnheader"][data-ssg-col-key="__ssg_group__"]`).innerText());
  // menu on estimate (aggFunc) should not have group item
  await openColumnMenu(page, 'estimate');
  log('estimate menu', JSON.stringify(await menuItems(page)));
  await page.keyboard.press('Escape');
  // group by title (non rowGroup column: rowGroup undefined)
  await openColumnMenu(page, 'title');
  log('title menu', JSON.stringify(await menuItems(page)));
  await page.keyboard.press('Escape');
  // ungroup
  await openColumnMenu(page, 'priority');
  await clickMenu(page, 'グループ化を外す');
  await page.waitForTimeout(800);
  log('badge after ungroup', await page.getByTestId('grouping').innerText());
  log('headers', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[aria-label="タスク一覧"] [role="columnheader"][data-ssg-col-key]')].map(h => h.dataset.ssgColKey))));
  log('bars', JSON.stringify(await bars(page)));
  await page.screenshot({ path: 'shots/g-ungrouped.png' });
  // regroup by status then assignee (order)
  await openColumnMenu(page, 'status');
  await clickMenu(page, 'この列でグループ化');
  await page.waitForTimeout(500);
  await openColumnMenu(page, 'assignee');
  log('assignee menu', JSON.stringify(await menuItems(page)));
  await clickMenu(page, 'この列でグループ化');
  await page.waitForTimeout(800);
  log('badge after regroup', await page.getByTestId('grouping').innerText());
  gr = await groupRows(page);
  log('regroup', JSON.stringify(gr.slice(0, 3).map(g => g.indent + ' ' + g.label + g.count)));
  log(logs.join('\n'));
  await browser.close();
})();
