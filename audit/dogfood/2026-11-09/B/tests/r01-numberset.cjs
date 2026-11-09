const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if (['warning', 'error'].includes(m.type())) logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push(e.message));
  await page.goto('http://127.0.0.1:5402/repro-numberset.html');
  await page.waitForSelector('.ssg-body-cell');
  for (const col of ['v', 's']) {
    const cell = page.locator(`.ssg-body-cell[data-ssg-col-key="${col}"]`).first();
    const b = await cell.boundingBox();
    await page.mouse.click(b.x + 10, b.y + b.height / 2);
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForSelector('.ssg-menu-panel');
    const fi = page.locator('.ssg-menu-item', { hasText: 'Filter' }).first();
    const fb = await fi.boundingBox();
    await page.mouse.click(fb.x + 10, fb.y + fb.height / 2);
    await page.waitForTimeout(500);
    const labels = await page.evaluate(() => [...document.querySelectorAll('.ssg-filter-list label')].map((l) => l.innerText.trim()));
    console.log(col, 'list:', labels.join(' , '));
    await page.screenshot({ path: `out/r01-${col}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  // sort ascending by v for comparison
  console.log('LOGS', logs);
  await browser.close();
})();
