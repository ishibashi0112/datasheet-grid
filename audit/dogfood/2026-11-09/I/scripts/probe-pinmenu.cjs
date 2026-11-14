const { open } = require('./lib.cjs');
(async () => {
  const { browser, page } = await open();
  const h = page.locator('.ssg-header-cell', { hasText: '担当' }).first();
  await h.hover();
  await page.getByRole('button', { name: '担当 の列メニュー' }).click();
  await page.locator('.ssg-menu-item', { hasText: '列の固定' }).hover();
  await page.waitForTimeout(500);
  console.log(await page.evaluate(() => document.querySelector('.ssg-menu-submenu-anchor').outerHTML));
  await page.screenshot({ path: 'shots/probe-pinmenu.png', clip: { x: 200, y: 150, width: 700, height: 400 } });
  await browser.close();
})();
