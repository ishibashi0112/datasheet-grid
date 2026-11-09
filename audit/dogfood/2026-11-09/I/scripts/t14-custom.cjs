const { open, state, counts } = require('./lib.cjs');
const sess = (page) => page.evaluate(() => {
  const s = document.querySelector('[data-testid=custom-ask]');
  return s.innerText.replace(/\n/g, ' / ');
});
const submit = async (page, text, wait = 700) => {
  await page.click('[data-testid=custom-input]');
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(wait);
};
(async () => {
  const { browser, page, logs } = await open('?ui=custom');
  await submit(page, '関東の 10 万円以上');
  console.log('1', await sess(page), await counts(page), 'input=', await page.inputValue('[data-testid=custom-input]'));
  await submit(page, 'さらに数量 10 以上だけ');
  console.log('2', await sess(page), await counts(page));
  // チップを 1 つ外す
  await page.getByRole('button', { name: 'remove 地域' }).click();
  await page.waitForTimeout(400);
  console.log('3 remove region', await sess(page), await counts(page), JSON.stringify(Object.keys((await state(page)).filters.columnFilters)));
  // 元に戻す
  await page.click('[data-testid=custom-undo]');
  await page.waitForTimeout(400);
  console.log('4 undo', await sess(page), await counts(page), JSON.stringify(Object.keys((await state(page)).filters.columnFilters)));
  // 例外 → 再送
  await submit(page, '例外');
  console.log('5 error', await sess(page));
  await page.click('[data-testid=custom-retry]');
  await page.waitForTimeout(600);
  console.log('6 retry log', await page.evaluate(() => window.__askLog.slice(-2).map((e) => e.text + ':' + e.outcome)));
  // 遅い → Esc
  await submit(page, '遅い', 300);
  console.log('7 asking', await sess(page));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('8 after Esc', await sess(page), await page.evaluate(() => window.__askLog.at(-1).outcome));
  // 遅い → ボタンのダブルクリック
  await page.click('[data-testid=custom-input]');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('遅い 2');
  const b = await page.locator('[data-testid=custom-button]').boundingBox();
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(300);
  console.log('9 dblclick', await sess(page), await page.evaluate(() => window.__askLog.slice(-2).map((e) => e.text + ':' + (e.outcome ?? 'pending'))));
  await page.click('[data-testid=custom-button]');
  await page.waitForTimeout(300);
  // 反映 → 手で変える → changed + notice
  await submit(page, '今月の分');
  await page.evaluate(() => window.__grid.applyState({ filters: { globalText: 'abc' } }));
  await page.waitForTimeout(1500);
  console.log('10 changed', await sess(page), await page.$eval('[data-testid=custom-session]', (e) => e.getAttribute('data-phase')));
  // phase changed で undo を呼んだら?(ボタンは出さないが、コードから)
  await page.click('[data-testid=custom-dismiss]');
  await page.waitForTimeout(300);
  console.log('11 dismiss', await sess(page));
  // IME: 変換中の Enter で送らない
  const cdp = await page.context().newCDPSession(page);
  await page.click('[data-testid=custom-input]');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  const before = await page.evaluate(() => window.__askLog.length);
  await cdp.send('Input.imeSetComposition', { text: 'かんとう', selectionStart: 4, selectionEnd: 4 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
  await cdp.send('Input.insertText', { text: '関東' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await page.waitForTimeout(300);
  console.log('12 IME enter sent?', (await page.evaluate(() => window.__askLog.length)) - before, 'input=', await page.inputValue('[data-testid=custom-input]'));
  await page.screenshot({ path: 'shots/14-custom.png' });
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
