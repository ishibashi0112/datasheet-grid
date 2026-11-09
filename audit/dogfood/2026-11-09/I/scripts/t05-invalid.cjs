const { open, askBar, barText, state, counts } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  // 先に有効な条件を入れておく(不正な答えで表が変わらないか)
  await askBar(page, '関東の 10 万円以上');
  const base = JSON.stringify(await state(page));
  const cases = ['無い列を使う答え', '型違いの答え', '範囲外の値の答え', '空の答え', 'null の答え', '空オブジェクトの答え', 'サーバーエラーの答え', '囲みの答え', '途中で切れた答え', '長い文字の答え', '同じ列に二つの条件'];
  for (const c of cases) {
    // 毎回、前の条件に戻す
    await page.evaluate((s) => window.__grid.applyState(JSON.parse(s)), base);
    await page.waitForTimeout(200);
    await askBar(page, c);
    await page.waitForTimeout(300);
    const st = JSON.stringify(await state(page));
    const bt = (await barText(page)).split('\n').slice(7).join(' / ');
    const inputVal = await page.inputValue('.ssg-ask-input');
    console.log(`■ ${c}\n  bar: ${bt}\n  changed: ${st !== base}  ${st !== base ? JSON.stringify(JSON.parse(st).filters) + ' sort=' + JSON.stringify(JSON.parse(st).sort) : ''}\n  input: "${inputVal}" ${await counts(page)}`);
  }
  await page.screenshot({ path: 'shots/05-invalid-last.png' });
  console.log('errors', await page.evaluate(() => window.__errorLog));
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
