const { open } = require('./lib.cjs');
(async () => {
  const { browser, page } = await open();
  const h = page.locator('.ssg-header-cell', { hasText: '数量' }).first();
  await h.hover();
  await page.getByRole('button', { name: '数量 の列メニュー' }).click();
  await page.waitForTimeout(400);
  const html = await page.evaluate(() => {
    const els = [...document.body.children].filter((e) => e.id !== 'root');
    return els.map((e) => e.outerHTML.slice(0, 1500)).join('\n----\n');
  });
  console.log(html);
  await browser.close();
})();
