const { open, askBar, barText, state, counts } = require('./lib.cjs');
const tail = async (page) => (await barText(page)).split('\n').slice(7).join(' / ');
(async () => {
  const { browser, page, logs } = await open();
  await askBar(page, '関東の 10 万円以上');
  await page.click('[data-testid=toggle-group]');
  await page.waitForTimeout(1500);
  console.log('after toggling group:', await tail(page));
  await page.click('[data-testid=toggle-group]');
  await page.waitForTimeout(1500);
  console.log('after untoggling group:', await tail(page));
  // 列メニューから手でグループ化(onColumnsChange)
  // 遅い答えの間に allowFilter を切る → 答えは変わった後の設定で読む
  await page.click('.ssg-ask-input');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('遅い答え');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.click('[data-testid=toggle-filter]');
  await page.waitForTimeout(5300);
  console.log('allowFilter turned off during ask:', await tail(page), JSON.stringify((await state(page)).filters.columnFilters));
  await page.click('[data-testid=toggle-filter]');
  await page.waitForTimeout(300);
  // 遅い答えの間にグループ化を入れる
  await page.click('.ssg-ask-input');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('遅い答え 2');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.click('[data-testid=toggle-group]');
  await page.waitForTimeout(5300);
  console.log('group toggled during ask:', await tail(page), JSON.stringify((await state(page)).filters.columnFilters), await counts(page));
  // 遅い答えの間に手で並べ替え → 答えは届いた時点の状態で読む
  await page.click('.ssg-ask-input');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('遅い答え 3');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__grid.applyState({ sort: [{ columnKey: 'date', direction: 'desc' }], filters: { globalText: '田中' } }));
  await page.waitForTimeout(5300);
  console.log('hand change during ask:', await tail(page), JSON.stringify(await state(page).then((s) => ({ f: s.filters, s: s.sort }))));
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
