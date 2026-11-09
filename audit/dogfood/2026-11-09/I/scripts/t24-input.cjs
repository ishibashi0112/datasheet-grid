const { open, barText, counts } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  const n = () => page.evaluate(() => window.__askLog.length);
  // 例を押す
  await page.locator('.ssg-ask-example').nth(2).click();
  await page.waitForTimeout(100);
  console.log('example click: input during asking =', JSON.stringify(await page.inputValue('.ssg-ask-input')), 'asks', await n());
  await page.waitForTimeout(700);
  console.log(' after answer input =', JSON.stringify(await page.inputValue('.ssg-ask-input')), await counts(page));
  // 空白だけ
  await page.click('.ssg-ask-input');
  await page.keyboard.type('   ');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('spaces: asks', await n(), 'button disabled', await page.locator('.ssg-ask-button').isDisabled());
  // 前後の空白
  await page.keyboard.press('Control+A');
  await page.keyboard.type('  今月の分  ');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  console.log('trim: sent text =', JSON.stringify(await page.evaluate(() => window.__askLog.at(-1).text)));
  // とても長い文
  const long = 'あ'.repeat(5000);
  await page.click('.ssg-ask-input');
  await page.evaluate((v) => {
    const i = document.querySelector('.ssg-ask-input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(i, v);
    i.dispatchEvent(new Event('input', { bubbles: true }));
  }, long);
  console.log('maxLength attr', await page.getAttribute('.ssg-ask-input', 'maxlength'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  console.log('long: sent len =', await page.evaluate(() => window.__askLog.at(-1).text.length), 'bytes', await page.evaluate(() => window.__askLog.at(-1).bodyBytes));
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
