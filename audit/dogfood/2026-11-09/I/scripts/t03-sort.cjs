const { open, askBar, barText, state, viewRows, counts } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  await askBar(page, '先月の売上を金額の大きい順');
  await page.waitForTimeout(800);
  const vr = await viewRows(page, 8);
  console.log(vr.map((r) => `${r.idx} ${r.row?.date} ${r.row?.amount}`).join('\n'));
  const allDesc = await page.evaluate(() => {
    const rs = window.__rows.filter((r) => r.date >= '2026-10-01' && r.date <= '2026-10-31').sort((a, b) => b.amount - a.amount);
    return rs.slice(0, 3).map((r) => `${r.date} ${r.amount}`);
  });
  console.log('expected top', allDesc);
  await page.screenshot({ path: 'shots/03-sorted.png' });
  // メモ順(filterType の無い列の並び)
  await askBar(page, 'メモ順に並べて');
  await page.waitForTimeout(800);
  console.log('memo sort', JSON.stringify((await state(page)).sort), await counts(page));
  console.log((await viewRows(page, 5)).map((r) => `${r.idx} [${r.row?.memo}]`).join('\n'));
  console.log(JSON.stringify(await barText(page)));
  // メモに至急(filterType の無い列の条件)
  await askBar(page, 'メモに至急とあるもの');
  await page.waitForTimeout(500);
  console.log('memo filter', JSON.stringify((await state(page)).filters), await counts(page));
  console.log(JSON.stringify(await barText(page)));
  // キャンセル以外(select の notIn)
  await askBar(page, 'キャンセル以外');
  await page.waitForTimeout(500);
  console.log('notIn select', JSON.stringify((await state(page)).filters), await counts(page));
  console.log(JSON.stringify(await barText(page)));
  // 売れ筋(unsupported)
  await askBar(page, '売れ筋を教えて');
  await page.waitForTimeout(500);
  console.log('unsupported', JSON.stringify(await barText(page)), await counts(page));
  // モックが知らない文
  await askBar(page, 'こんにちは');
  await page.waitForTimeout(500);
  console.log('unknown', JSON.stringify(await barText(page)), await counts(page));
  await page.screenshot({ path: 'shots/03-unsupported.png' });
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
