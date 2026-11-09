const { open, counts, expected } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  const gf = page.locator('.ssg-root input[placeholder="グローバルフィルター"]');
  for (const q of ['ボールペン', 'pen', '関東', 'kanto', '未入金', 'unpaid', '796,000', '796000']) {
    await gf.fill(q);
    await page.waitForTimeout(500);
    console.log(`global "${q}":`, await counts(page));
  }
  await gf.fill('');
  await page.waitForTimeout(300);
  // Ctrl+F(セル内検索)は表示の文字で探す?
  await page.locator('.ssg-body-cell').first().click();
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(300);
  await page.keyboard.type('ボールペン');
  await page.waitForTimeout(1500);
  const findText = await page.evaluate(() => document.querySelector('[class*="find"]')?.innerText ?? '');
  console.log('find ボールペン:', JSON.stringify(findText));
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
