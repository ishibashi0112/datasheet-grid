const { open, askBar, barText, state, counts } = require('./lib.cjs');
const tail = async (page) => (await barText(page)).split('\n').slice(7).join(' / ');
(async () => {
  const { browser, page, logs } = await open();
  // allowFilter = false(グリッドの enableColumnFilter も false)
  await page.click('[data-testid=toggle-filter]');
  await page.waitForTimeout(300);
  await askBar(page, '関東の 10 万円以上');
  console.log('allowFilter=false:', await tail(page), await counts(page));
  const last = await page.evaluate(() => window.__askLog.at(-1).prompt.split('\n').filter((l) => /^(Filters|Sort|Search|Hide)/.test(l)).join(' | '));
  console.log(' prompt flags:', last);
  console.log(' prompt cols:', await page.evaluate(() => window.__askLog.at(-1).prompt.split('\n').filter((l) => l.startsWith('- ')).slice(0, 3).join(' | ')));
  await askBar(page, '先月の売上を金額の大きい順');
  console.log(' sort-only answer w/ filter:', await tail(page), JSON.stringify((await state(page)).sort), JSON.stringify((await state(page)).filters.columnFilters));
  await page.click('[data-testid=toggle-filter]');
  await page.waitForTimeout(300);
  // allowColumnVisibility
  await page.click('[data-testid=toggle-colvis]');
  await page.waitForTimeout(300);
  await askBar(page, 'メモ列を隠して');
  const visible = await page.evaluate(() => window.__columns.map((c) => `${c.key}:${c.visible === false ? 'hidden' : 'shown'}`).join(','));
  console.log('hide memo:', await tail(page), visible);
  const memoHeader = await page.locator('.ssg-header-cell', { hasText: 'メモ' }).count();
  console.log(' memo header count', memoHeader);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await page.waitForTimeout(300);
  console.log(' after undo:', await page.evaluate(() => window.__columns.map((c) => `${c.key}:${c.visible === false ? 'hidden' : 'shown'}`).join(',')));
  await askBar(page, '全部隠して');
  console.log('hide all:', await tail(page), await page.evaluate(() => window.__columns.filter((c) => c.visible === false).length));
  await page.click('[data-testid=toggle-colvis]');
  await page.waitForTimeout(300);
  // allowColumnVisibility = false のとき hide の答え
  await askBar(page, 'メモ列を隠して');
  console.log('hide w/o permission:', await tail(page));
  // columnHints false(?hideMemo=1)
  await page.goto(require('./lib.cjs').BASE + '?hideMemo=1');
  await page.waitForSelector('.ssg-body-cell');
  await askBar(page, 'メモ順に並べて');
  console.log('hideMemo prompt has memo?', await page.evaluate(() => /memo/.test(window.__askLog.at(-1).prompt)), 'schema has memo?', await page.evaluate(() => JSON.stringify(window.__askLog.at(-1).schema).includes('memo')));
  console.log(' sort by hidden-from-AI col:', await tail(page), JSON.stringify((await state(page)).sort));
  // 手で memo に並び → AI に replace で別の並び → memo の並びは残る?
  await page.evaluate(() => window.__grid.applyState({ sort: [{ columnKey: 'memo', direction: 'desc' }] }));
  await page.waitForTimeout(300);
  await askBar(page, '先月の売上を金額の大きい順');
  console.log(' after replace, sort:', JSON.stringify((await state(page)).sort));
  console.log(' prompt current view:', await page.evaluate(() => window.__askLog.at(-1).prompt.split('\n').find((l) => l.startsWith('Current view'))));
  // columnHints の打ち間違い(?hintTypo=1)の開発時の警告
  const logs2 = [];
  page.on('console', (m) => logs2.push(`[${m.type()}] ${m.text()}`));
  await page.goto(require('./lib.cjs').BASE + '?hintTypo=1');
  await page.waitForSelector('.ssg-body-cell');
  await page.waitForTimeout(500);
  console.log('hintTypo warnings:', logs2.filter((l) => /warn|error/.test(l)).join('\n'));
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
