const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 700, height: 500 }, deviceScaleFactor: 1 });
  await page.goto('http://localhost:5401/min/dark.html?css=plain');
  await page.waitForSelector('.ssg-body-cell');
  await page.addStyleTag({ content: '.ssg-filter-popover { color: var(--ssg-panel-text-strong); }' });
  const h = await page.$('[role="columnheader"][aria-colindex="2"]');
  await h.hover(); await page.waitForTimeout(150);
  await page.click('[aria-label="区分 の列メニュー"]'); await page.waitForTimeout(250);
  await page.locator('.ssg-menu-panel').getByText('フィルター…', { exact: true }).click();
  await page.waitForTimeout(500);
  await page.click('.ssg-filter-input'); await page.keyboard.type('ABC');
  console.log(await page.evaluate(() => getComputedStyle(document.querySelector('.ssg-filter-input')).color));
  await browser.close();
})();
