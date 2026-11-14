const { open, askBar, barText, state } = require('./lib.cjs');
const counts = async (page) => page.evaluate(() => {
  const t = document.querySelector('.ssg-root').innerText.match(/行 (\d+) \/ (\d+)|Rows (\d+) \/ (\d+)|(\d+) of (\d+)/);
  return t ? t[0] : null;
});
const expected = async (page, fn) => page.evaluate(`window.__rows.filter(${fn}).length`);
(async () => {
  const { browser, page, logs } = await open();
  const out = (...a) => console.log(...a);
  // 1. 関東の 10 万円以上
  await askBar(page, '関東の 10 万円以上');
  await page.waitForTimeout(600);
  out('1 count', await counts(page), 'expected', await expected(page, "r => r.region==='kanto' && r.amount>=100000"));
  // 2. さらに数量 10 以上だけ (refine)
  await askBar(page, 'さらに数量 10 以上だけ');
  await page.waitForTimeout(600);
  out('2 filters', JSON.stringify((await state(page)).filters.columnFilters));
  out('2 count', await counts(page), 'expected', await expected(page, "r => r.region==='kanto' && r.amount>=100000 && r.qty>=10"));
  out('2 bar', JSON.stringify(await barText(page)));
  // 3. 先月 + 金額降順 (replace)
  await askBar(page, '先月の売上を金額の大きい順');
  await page.waitForTimeout(600);
  const st3 = await state(page);
  out('3 state', JSON.stringify(st3.filters.columnFilters), JSON.stringify(st3.sort));
  out('3 count', await counts(page), 'expected', await expected(page, "r => r.date>='2026-10-01' && r.date<='2026-10-31'"));
  const firstAmounts = await page.$$eval('.ssg-body-row', (rs) => rs.slice(0, 6).map((r) => r.innerText.replace(/\n/g, ' | ')));
  out('3 rows', firstAmounts.join('\n'));
  out('3 bar', JSON.stringify(await barText(page)));
  await page.screenshot({ path: 'shots/02-lastmonth.png' });
  // 4. 元に戻す → 2 の状態へ
  await page.getByRole('button', { name: '元に戻す' }).click();
  await page.waitForTimeout(400);
  const st4 = await state(page);
  out('4 after undo', JSON.stringify(st4.filters.columnFilters), JSON.stringify(st4.sort));
  out('4 bar', JSON.stringify(await barText(page)));
  // 5. 未入金 (select equals)
  await askBar(page, '状態が未入金のもの');
  await page.waitForTimeout(500);
  out('5 count', await counts(page), 'expected', await expected(page, "r => r.status==='unpaid'"));
  out('5 bar', JSON.stringify(await barText(page)));
  // 6. 今月 (preset)
  await askBar(page, '今月の分');
  await page.waitForTimeout(500);
  out('6 state', JSON.stringify((await state(page)).filters.columnFilters));
  out('6 count', await counts(page), 'expected', await expected(page, "r => r.date>='2026-11-01' && r.date<='2026-11-30'"));
  out('6 bar', JSON.stringify(await barText(page)));
  // 7. 検索 (JSON の文字列で返す)
  await askBar(page, 'ボールペンを検索');
  await page.waitForTimeout(500);
  out('7 global', JSON.stringify((await state(page)).filters));
  out('7 count', await counts(page));
  out('7 bar', JSON.stringify(await barText(page)));
  // 8. ノートかボールペン + 日付降順
  await askBar(page, 'ノートかボールペン');
  await page.waitForTimeout(500);
  out('8 state', JSON.stringify((await state(page)).filters), JSON.stringify((await state(page)).sort));
  out('8 count', await counts(page), 'expected', await expected(page, "r => r.product==='note'||r.product==='pen'"));
  // 9. 範囲の逆転 + 全角
  await askBar(page, '金額 5 万〜10 万');
  await page.waitForTimeout(500);
  out('9 state', JSON.stringify((await state(page)).filters.columnFilters));
  out('9 count', await counts(page), 'expected', await expected(page, "r => r.amount>=50000 && r.amount<=100000"));
  out('9 bar', JSON.stringify(await barText(page)));
  // 10. 田中 (textSet contains)
  await askBar(page, '田中さんの分');
  await page.waitForTimeout(500);
  out('10 state', JSON.stringify((await state(page)).filters.columnFilters));
  out('10 count', await counts(page), 'expected', await expected(page, "r => r.rep.includes('田中')"));
  // 11. 状態が空
  await askBar(page, '状態が空のもの');
  await page.waitForTimeout(500);
  out('11 state', JSON.stringify((await state(page)).filters.columnFilters));
  out('11 count', await counts(page), 'expected', await expected(page, "r => r.status===''"));
  out('11 bar', JSON.stringify(await barText(page)));
  // 12. 近畿と九州以外
  await askBar(page, '近畿と九州以外');
  await page.waitForTimeout(500);
  out('12 state', JSON.stringify((await state(page)).filters.columnFilters));
  out('12 count', await counts(page), 'expected', await expected(page, "r => r.region!=='kinki' && r.region!=='kyushu'"));
  out('12 bar', JSON.stringify(await barText(page)));
  out('applyLog', await page.evaluate(() => window.__applyLog.length));
  out('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
