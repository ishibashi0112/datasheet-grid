const { open, askBar, barText, state, counts } = require('./lib.cjs');
const tail = async (page) => (await barText(page)).split('\n').slice(7).join(' / ');
const groupRows = (page) => page.$$eval('.ssg-body-row[data-pane="left"], .ssg-body-row[data-pane="center"]', (rs) => [...new Set(rs.filter((r) => r.className.includes('group')).map((r) => r.innerText.replace(/\n/g, ' ').slice(0, 80)))].slice(0, 10));
(async () => {
  const { browser, page, logs } = await open();
  await page.click('[data-testid=toggle-group]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/10-group-initial.png' });
  console.log('grouped rows:', await groupRows(page));
  console.log('prompt region present?');
  await askBar(page, '関東の 10 万円以上');
  await page.waitForTimeout(600);
  console.log('after ask:', await tail(page), await counts(page));
  console.log(' prompt region line:', await page.evaluate(() => window.__askLog.at(-1).prompt.split('\n').find((l) => l.startsWith('- region'))));
  console.log(' group rows:', await groupRows(page));
  await askBar(page, '先月の売上を金額の大きい順');
  await page.waitForTimeout(800);
  console.log('lastmonth:', await tail(page), await counts(page));
  console.log(' group rows:', await groupRows(page));
  await page.screenshot({ path: 'shots/10-group-sorted.png' });
  await askBar(page, '近畿と九州以外');
  await page.waitForTimeout(600);
  console.log('notIn:', await tail(page), await counts(page));
  console.log(' group rows:', await groupRows(page));
  // 元に戻す → グループ化はそのまま?
  await page.getByRole('button', { name: '元に戻す' }).click();
  await page.waitForTimeout(500);
  console.log('undo; still grouped?', await page.evaluate(() => window.__columns.find((c) => c.key === 'region').rowGroup), await counts(page));
  // allowColumnVisibility + 隠す → グループ化は残る?
  await page.click('[data-testid=toggle-colvis]');
  await page.waitForTimeout(300);
  await askBar(page, 'メモ列を隠して');
  await page.waitForTimeout(500);
  console.log('hide memo while grouped:', await tail(page), 'rowGroup', await page.evaluate(() => window.__columns.find((c) => c.key === 'region').rowGroup), await page.evaluate(() => window.__columns.map((c) => c.key + (c.visible === false ? '(h)' : '')).join(',')));
  await page.getByRole('button', { name: '元に戻す' }).click();
  await page.waitForTimeout(500);
  console.log(' undo: rowGroup', await page.evaluate(() => window.__columns.find((c) => c.key === 'region').rowGroup), await page.evaluate(() => window.__columns.map((c) => c.key + (c.visible === false ? '(h)' : '')).join(',')));
  // 「地域」を AI に隠させる(グループ元の列)
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
