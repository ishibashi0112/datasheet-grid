const { open, askBar, barText, state, counts } = require('./lib.cjs');
const log = (page) => page.evaluate(() => window.__askLog.map((e) => `${e.text}:${e.outcome ?? 'pending'}`));
(async () => {
  const { browser, page, logs } = await open();
  await askBar(page, '関東の 10 万円以上');
  await askBar(page, '例外を投げる');
  console.log('bar', JSON.stringify(await barText(page)), await counts(page));
  console.log('input', await page.inputValue('.ssg-ask-input'), 'errors', await page.evaluate(() => window.__errorLog));
  await page.screenshot({ path: 'shots/07-error.png' });
  // 入力欄を書き換えてから「もう一度」→ 送った文(例外を投げる)で送り直すはず
  await page.click('.ssg-ask-input');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('状態が未入金のもの');
  await page.getByRole('button', { name: 'もう一度' }).click();
  await page.waitForTimeout(600);
  console.log('retry log', await log(page), 'errors', await page.evaluate(() => window.__errorLog.length));
  console.log('bar after retry', JSON.stringify(await barText(page)));
  // 閉じる
  const close = page.getByRole('button', { name: '閉じる' });
  console.log('close visible?', await close.count());
  // 正常な文を送るとエラーが消えるか
  await askBar(page, '状態が未入金のもの');
  console.log('bar after ok', JSON.stringify(await barText(page)).slice(-80), await counts(page));
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
