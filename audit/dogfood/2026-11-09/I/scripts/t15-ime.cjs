const { open, barText, state, counts } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  const cdp = await page.context().newCDPSession(page);
  await page.click('.ssg-ask-input');
  const n0 = await page.evaluate(() => window.__askLog.length);
  // 「関東の」を変換して確定(Enter)
  await cdp.send('Input.imeSetComposition', { text: 'かんとうの', selectionStart: 5, selectionEnd: 5 });
  await page.waitForTimeout(50);
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
  await cdp.send('Input.insertText', { text: '関東の' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await page.waitForTimeout(300);
  console.log('after IME confirm Enter: sent', (await page.evaluate(() => window.__askLog.length)) - n0, 'input=', await page.inputValue('.ssg-ask-input'));
  // 続けて打つ
  await page.keyboard.type(' 10 万円以上');
  // 変換中の Esc は止めない(聞いていないので、ここでは Esc で入力欄が消えないことだけ)
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  console.log('after real Enter: sent', (await page.evaluate(() => window.__askLog.length)) - n0, await counts(page), 'input=', await page.inputValue('.ssg-ask-input'));
  // 聞いている間の変換中の Esc では止めない
  await page.click('.ssg-ask-input');
  await page.keyboard.type('遅い');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await cdp.send('Input.imeSetComposition', { text: 'あ', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 229 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await page.waitForTimeout(300);
  console.log('Esc during composition while asking -> still asking?', /考えています/.test(await barText(page)), await page.evaluate(() => window.__askLog.at(-1).outcome ?? 'pending'));
  await cdp.send('Input.imeCommitComposition', {}).catch(() => cdp.send('Input.insertText', { text: '' }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('Esc after composition -> ', await page.evaluate(() => window.__askLog.at(-1).outcome ?? 'pending'), 'input=', await page.inputValue('.ssg-ask-input'));
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
