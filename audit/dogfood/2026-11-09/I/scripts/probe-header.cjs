const { open } = require('./lib.cjs');
(async () => {
  const { browser, page } = await open();
  const h = page.locator('.ssg-header-cell', { hasText: '数量' }).first();
  await h.hover();
  await page.waitForTimeout(200);
  console.log(await h.evaluate((e) => e.outerHTML.slice(0, 2500)));
  await browser.close();
})();
