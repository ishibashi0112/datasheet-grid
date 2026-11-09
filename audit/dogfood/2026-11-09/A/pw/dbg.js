const L = require('./lib');
(async () => {
  const { browser, page } = await L.open();
  const hb = await page.evaluate((t) => { const h = [...document.querySelectorAll('[role="columnheader"]')].find((e) => e.textContent.trim().startsWith(t)); const r = h.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, '区分');
  await page.mouse.move(hb.cx, hb.cy); await page.waitForTimeout(150);
  await page.click(`[aria-label="区分 の列メニュー"]`); await page.waitForTimeout(250);
  await page.locator('.ssg-menu-panel').getByText('フィルター…', { exact: true }).click();
  await page.waitForTimeout(800);
  console.log(await page.evaluate(() => [...document.body.children].map((e) => e.tagName + '.' + e.className).join('\n')));
  const html = await page.evaluate(() => { const el = [...document.querySelectorAll('body *')].find((e) => e.textContent.startsWith('列フィルター')); return el ? el.closest('[class*="filter"]')?.outerHTML.slice(0, 1500) : null; });
  console.log(html);
  await browser.close();
})();
