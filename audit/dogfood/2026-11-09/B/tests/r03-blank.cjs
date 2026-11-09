const { chromium } = require('playwright');
const { scanJapanese } = require('./lib.cjs');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 500 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if (['warning', 'error'].includes(m.type())) logs.push(m.text()); });
  for (const group of ['0', '1']) {
    await page.goto(`http://127.0.0.1:5402/repro-blank.html?group=${group}`);
    await page.waitForSelector('.ssg-body-cell');
    await page.waitForTimeout(300);
    console.log(`group=${group} body:`, await page.evaluate(() => [...document.querySelectorAll('[role="row"][data-pane="center"], [role="row"][data-pane="left"]')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' / ')));
    console.log((await scanJapanese(page, `group=${group}`)).join('\n'));
    // open filters
    for (const key of ['price', 'listed', ...(group === '0' ? ['sector'] : [])]) {
      const cell = page.locator(`.ssg-body-cell[data-ssg-col-key="${key}"]`).first();
      if (!(await cell.count())) continue;
      const b = await cell.boundingBox();
      await page.mouse.click(b.x + 10, b.y + b.height / 2);
      await page.keyboard.press('Alt+ArrowDown');
      await page.waitForSelector('.ssg-menu-panel');
      const fi = page.locator('.ssg-menu-item', { hasText: 'Filter' }).first();
      const fb = await fi.boundingBox();
      await page.mouse.click(fb.x + 10, fb.y + fb.height / 2);
      await page.waitForTimeout(500);
      console.log(key, 'filter list:', await page.evaluate(() => [...document.querySelectorAll('.ssg-filter-list label, .ssg-filter-list [role="treeitem"]')].map((l) => l.innerText.trim()).join(' | ')));
      console.log((await scanJapanese(page, `${key}-filter`)).join('\n'));
      await page.screenshot({ path: `out/r03-${group}-${key}.png` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
  }
  console.log('LOGS', logs);
  await browser.close();
})();
