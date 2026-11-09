const { open, barText, state, counts } = require('./lib.cjs');
const startAsk = async (page, text) => {
  await page.click('.ssg-ask-input');
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
};
const log = (page) => page.evaluate(() => window.__askLog.map((e) => `${e.text}:${e.outcome ?? 'pending'}`));
(async () => {
  const { browser, page, logs } = await open();
  // A. 止めるボタン
  await startAsk(page, '遅い答え');
  console.log('A thinking bar:', JSON.stringify(await barText(page)));
  const ariaDisabled = await page.$$eval('.ssg-ask-example', (bs) => bs.map((b) => b.getAttribute('aria-disabled')));
  console.log('A examples aria-disabled', ariaDisabled);
  // 考えている間に例を押す → 受け付けない
  const ex = await page.locator('.ssg-ask-example').first().boundingBox();
  await page.mouse.click(ex.x + ex.width / 2, ex.y + ex.height / 2);
  await page.waitForTimeout(200);
  console.log('A after example click log', await log(page));
  // 考えている間に Enter をもう一度
  await page.click('.ssg-ask-input');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  console.log('A after 2nd Enter log', await log(page));
  await page.screenshot({ path: 'shots/06-thinking.png' });
  const t0 = Date.now();
  await page.getByRole('button', { name: '止める' }).click();
  console.log('A stop click took', Date.now() - t0, 'ms');
  await page.waitForTimeout(300);
  console.log('A after stop bar:', JSON.stringify(await barText(page)), 'log', await log(page), 'input', await page.inputValue('.ssg-ask-input'));
  await page.waitForTimeout(5200);
  console.log('A 5s later state filters', JSON.stringify((await state(page)).filters.columnFilters), await counts(page));
  // B. Esc(フォーカスがバーの中)
  await startAsk(page, '遅い答え B');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('B after Esc in bar:', JSON.stringify(await barText(page)).slice(0, 120), 'log', (await log(page)).slice(-1));
  // C. Esc(フォーカスが表の中)→ 止まらないはず
  await startAsk(page, '遅い答え C');
  await page.click('.ssg-body-row[data-pane="center"][data-row-index="2"] .ssg-body-cell >> nth=1');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('C after Esc in grid:', (await log(page)).slice(-1), 'thinking?', /考えています/.test(await barText(page)));
  // D. Esc(どこにもフォーカスが無い = body)
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  console.log('D active', await page.evaluate(() => document.activeElement?.tagName));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('D after Esc on body:', (await log(page)).slice(-1), 'thinking?', /考えています/.test(await barText(page)));
  // E. 考えている間に入力欄を書き換え → 答えが来ても残す
  await startAsk(page, '遅い答え E');
  await page.click('.ssg-ask-input');
  await page.keyboard.press('End');
  await page.keyboard.type(' 追記');
  await page.waitForTimeout(5300);
  console.log('E input after answer:', await page.inputValue('.ssg-ask-input'), 'log', (await log(page)).slice(-1), await counts(page));
  // F. 止めるボタンのダブルクリック
  await startAsk(page, '遅い答え F');
  const sb = await page.locator('.ssg-ask-button').boundingBox();
  await page.mouse.dblclick(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.waitForTimeout(400);
  console.log('F after dblclick stop', await log(page), 'thinking?', /考えています/.test(await barText(page)));
  // G. 聞くボタンのダブルクリック(2 回目で止めない)
  await page.click('.ssg-ask-input');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('遅い答え G');
  const ab = await page.locator('.ssg-ask-button').boundingBox();
  await page.mouse.dblclick(ab.x + ab.width / 2, ab.y + ab.height / 2);
  await page.waitForTimeout(400);
  console.log('G after dblclick ask', (await log(page)).slice(-2), 'thinking?', /考えています/.test(await barText(page)));
  await page.getByRole('button', { name: '止める' }).click();
  console.log('abortCount', await page.evaluate(() => window.__askAbortCount), 'errors', await page.evaluate(() => window.__errorLog));
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
