const { open, askBar, barText } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  for (const t of ['関東の 10 万円以上', '関東の 10 万円以上', 'メモに至急', '売れ筋', 'キャンセル以外', '範囲外の答え', '空の答え']) {
    const n0 = await page.evaluate(() => window.__applyLog.length);
    await askBar(page, t);
    const ev = await page.evaluate((n0) => window.__applyLog.slice(n0).map((e) => ({ text: e.text, dropped: e.dropped.length, unsupported: e.unsupported, filters: Object.keys(e.state.filters.columnFilters) })), n0);
    console.log(t, '→ onApply', JSON.stringify(ev), '| bar:', (await barText(page)).split('\n').slice(7, 9).join(' / '));
  }
  // チップの × / 元に戻す で onApply は?
  await askBar(page, '関東の 10 万円以上');
  const n1 = await page.evaluate(() => window.__applyLog.length);
  await page.locator('.ssg-ask-chip button').first().click();
  await page.getByRole('button', { name: '元に戻す' }).click();
  await page.waitForTimeout(300);
  console.log('chip remove + undo → onApply calls', (await page.evaluate(() => window.__applyLog.length)) - n1);
  // columnHints をインラインで渡して再描画(dark の切り替え)→ 警告は何回?
  await browser.close();
})();
