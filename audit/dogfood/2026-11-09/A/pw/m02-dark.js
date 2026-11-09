const { chromium } = require('playwright');
const L = require('./lib');
(async () => {
  const browser = await chromium.launch();
  for (const css of ['none', 'plain', 'layer']) {
    const page = await browser.newPage({ viewport: { width: 700, height: 500 }, deviceScaleFactor: 1 });
    const logs = []; page.on('console', (m) => logs.push(m.type() + ' ' + m.text())); page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
    await page.goto('http://localhost:5401/min/dark.html?css=' + css);
    await page.waitForSelector('.ssg-body-cell');
    const h = await page.$('[role="columnheader"][aria-colindex="2"]');
    await h.hover(); await page.waitForTimeout(150);
    await page.click('[aria-label="区分 の列メニュー"]'); await page.waitForTimeout(250);
    await page.locator('.ssg-menu-panel').getByText('フィルター…', { exact: true }).click();
    await page.waitForTimeout(500);
    await page.click('.ssg-filter-input');
    await page.keyboard.type('ABC');
    const s = await page.evaluate(() => { const i = document.querySelector('.ssg-filter-input'); const p = i.closest('.ssg-filter-popover'); return { popColor: getComputedStyle(p).color, popBg: getComputedStyle(p).backgroundColor, inputColor: getComputedStyle(i).color, inputBg: getComputedStyle(i).backgroundColor }; });
    console.log(css, JSON.stringify(s), logs.filter((l) => !l.includes('vite') && !l.includes('DevTools')).join(' '));
    const box = await (await page.$('.ssg-filter-popover')).boundingBox();
    await page.screenshot({ path: `${L.SHOTS}/m02-dark-${css}.png`, clip: { x: box.x, y: box.y, width: box.width, height: 80 } });
    await page.close();
  }
  await browser.close();
})();
