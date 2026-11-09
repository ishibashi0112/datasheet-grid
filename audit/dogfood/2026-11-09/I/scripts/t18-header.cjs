const { open, askBar } = require('./lib.cjs');
(async () => {
  const { browser, page } = await open();
  await askBar(page, '先月の売上を金額の大きい順');
  await page.waitForTimeout(800);
  const h = await page.locator('.ssg-header-cell', { hasText: '金額' }).first().boundingBox();
  const q = await page.locator('.ssg-header-cell', { hasText: '数量' }).first().boundingBox();
  console.log('qty header', q, 'amount header', h);
  await page.screenshot({ path: 'shots/18-header.png', clip: { x: q.x - 10, y: q.y - 4, width: q.width + h.width + 140, height: q.height + 50 } });
  const icons = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('.ssg-header-cell')].find((c) => c.textContent.includes('金額'));
    return [...cell.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => `${e.tagName}.${e.className.baseVal ?? e.className} x=${Math.round(e.getBoundingClientRect().x)} w=${Math.round(e.getBoundingClientRect().width)}`).slice(0, 12);
  });
  console.log(icons.join('\n'));
  await browser.close();
})();
