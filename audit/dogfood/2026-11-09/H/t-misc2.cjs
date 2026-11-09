const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
(async () => {
  const { browser, page, logs } = await open();
  // find group label text when collapsed
  await page.getByRole('button', { name: 'すべて閉じる', exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator(`${G} [data-ssg-group-row] .ssg-group-label`).first().click();
  await page.keyboard.press('Control+f');
  await page.keyboard.type('佐藤');
  await page.waitForTimeout(800);
  log('find 佐藤 collapsed', (await page.locator('.ssg-find-bar').innerText()).split('\n')[0]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'すべて開く', exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator(`${G} [data-ssg-group-row] .ssg-group-label`).first().click();
  await page.keyboard.press('Control+f');
  await page.keyboard.type('佐藤');
  await page.waitForTimeout(800);
  log('find 佐藤 expanded', (await page.locator('.ssg-find-bar').innerText()).split('\n')[0]);
  await page.keyboard.press('Escape');
  // add task
  await page.getByTestId('toolbar').getByRole('button', { name: 'タスクを追加' }).click();
  await page.waitForTimeout(800);
  log('status text', await page.getByTestId('status').innerText(), 'editor open', await page.locator('.ssg-cell-editor').count());
  log('bars', JSON.stringify((await bars(page))[1]));
  await page.keyboard.type('New task');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  log('new task title', await (await cell(page, 'T-03001', 'title')).innerText().catch(() => 'n/a'));
  log('groups near', JSON.stringify((await groupRows(page)).map(g => g.label + g.count)));
  await page.screenshot({ path: 'shots/m-added.png' });
  // add task while 佐藤 group collapsed
  await page.getByRole('button', { name: 'すべて閉じる', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByTestId('toolbar').getByRole('button', { name: 'タスクを追加' }).click();
  await page.waitForTimeout(800);
  log('status text collapsed', await page.getByTestId('status').innerText());
  log(logs.join('\n'));
  await browser.close();
})();
