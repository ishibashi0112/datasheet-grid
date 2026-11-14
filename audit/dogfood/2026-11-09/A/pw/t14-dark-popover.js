const L = require('./lib');
(async () => {
  const { browser, page, logs } = await L.open();
  const hb = await page.evaluate((t) => { const h = [...document.querySelectorAll('[role="columnheader"]')].find((e) => e.textContent.trim().startsWith(t)); const r = h.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, '区分');
  await page.mouse.move(hb.cx, hb.cy); await page.waitForTimeout(150);
  await page.click(`[aria-label="区分 の列メニュー"]`); await page.waitForTimeout(250);
  await page.locator('.ssg-menu-panel').getByText('フィルター…', { exact: true }).click();
  await page.waitForTimeout(600);
  const pop = await page.$('.ssg-filter-popover');
  const box = await pop.boundingBox();
  const clip = { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 };
  await page.screenshot({ path: L.SHOTS + '/14a-filter-light.png', clip });
  // toggle dark while open
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: L.SHOTS + '/14b-filter-dark-toggled-open.png', clip });
  const styles = await page.evaluate(() => {
    const p = document.querySelector('.ssg-filter-popover');
    const i = p.querySelector('.ssg-filter-input');
    const cs = getComputedStyle(p); const ci = getComputedStyle(i); const ph = getComputedStyle(i, '::placeholder');
    return { bg: cs.backgroundColor, color: cs.color, inputBg: ci.backgroundColor, inputColor: ci.color, placeholder: ph.color, border: ci.borderColor };
  });
  console.log('dark popover styles', styles);
  await page.keyboard.press('Escape');
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
