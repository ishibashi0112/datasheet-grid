const { open } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  await page.locator('.ssg-body-row[data-pane="center"] .ssg-body-cell').first().click();
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(500);
  const html = await page.evaluate(() => [...document.querySelectorAll('[class*="ssg-find"]')].map((e) => e.className).slice(0, 10));
  console.log(html);
  for (const q of ['ボールペン', 'pen', '796,000']) {
    await page.keyboard.press('Control+a');
    await page.keyboard.type(q);
    await page.waitForTimeout(1500);
    const t = await page.evaluate(() => document.querySelector('.ssg-find-bar, [class*="ssg-find"]')?.innerText);
    const marks = await page.$$eval('mark.ssg-find-mark', (ms) => ms.length);
    console.log(q, JSON.stringify(t), 'marks', marks);
  }
  await browser.close();
})();
