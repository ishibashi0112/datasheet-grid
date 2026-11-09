const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
(async () => {
  const { browser, page, logs } = await open();
  // find with collapsed groups
  await page.getByRole('button', { name: 'すべて閉じる', exact: true }).click();
  await page.waitForTimeout(500);
  await (await page.locator(`${G} [data-ssg-group-row] .ssg-group-label`).first()).click();
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(300);
  log('find bar', await page.locator('.ssg-find-bar').count());
  await page.keyboard.type('T-01500');
  await page.waitForTimeout(800);
  log('find bar text', await page.locator('.ssg-find-bar').innerText());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  log('bars after find enter', JSON.stringify((await bars(page))[1]));
  log('groups', JSON.stringify((await groupRows(page)).slice(0, 6).map(g => g.label + g.expanded)));
  await page.screenshot({ path: 'shots/m-find-collapsed.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'すべて開く', exact: true }).click();
  await page.waitForTimeout(500);
  // find with expanded
  await (await cell(page, 'T-00001', 'title')).click();
  await page.keyboard.press('Control+f');
  await page.keyboard.type('T-01500');
  await page.waitForTimeout(800);
  log('find bar text expanded', await page.locator('.ssg-find-bar').innerText());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  log('bars after find (expanded)', JSON.stringify((await bars(page))[1]), 'T-01500 visible', await page.locator(`${G} [data-row-key="T-01500"]`).count());
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // detail open + group collapse/expand
  await page.locator(G).evaluate(e => e.scrollTop = 0); await page.waitForTimeout(300);
  await page.locator(`${G} [data-row-key="T-00118"] button.ssg-detail-toggle`).first().click();
  await page.waitForTimeout(500);
  log('cards', await page.locator(`${G} .ssg-detail-card`).count());
  await page.locator(`${G} button[aria-label="レビュー中 を折りたたみ"]`).first().click();
  await page.waitForTimeout(600);
  log('cards after collapse group', await page.locator(`${G} .ssg-detail-card`).count());
  await page.screenshot({ path: 'shots/m-detail-collapsed-group.png', clip: { x: 0, y: 130, width: 1600, height: 500 } });
  await page.locator(`${G} button[aria-label="レビュー中 を展開"]`).first().click().catch(e => log('expand btn', e.message.slice(0, 80)));
  await page.waitForTimeout(600);
  log('cards after expand group', await page.locator(`${G} .ssg-detail-card`).count());
  await page.screenshot({ path: 'shots/m-detail-reexpanded.png', clip: { x: 0, y: 130, width: 1600, height: 600 } });
  // sort by estimate while detail open
  await openColumnMenu(page, 'title'); await clickMenu(page, '昇順で並び替え');
  await page.waitForTimeout(800);
  const cardRow = await page.evaluate(() => { const c = document.querySelector('[aria-label="タスク一覧"] .ssg-detail-card'); return c ? c.textContent.slice(0, 40) : null; });
  log('card after sort', cardRow);
  // add task
  await page.getByRole('button', { name: 'タスクを追加' }).click();
  await page.waitForTimeout(800);
  log('status text', await page.getByTestId('status').innerText(), 'editor open', await page.locator('.ssg-cell-editor').count());
  log('bars', JSON.stringify((await bars(page))[1]));
  await page.keyboard.type('New task');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  log('new task title', await (await cell(page, 'T-03001', 'title')).innerText().catch(() => 'n/a'));
  await page.screenshot({ path: 'shots/m-added.png' });
  log(logs.join('\n'));
  await browser.close();
})();
