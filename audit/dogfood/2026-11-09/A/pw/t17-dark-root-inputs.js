const L = require('./lib');
(async () => {
  const { browser, page, logs } = await L.open();
  await page.click('[data-testid="dark-toggle"]'); await page.waitForTimeout(300);
  await page.fill('input[placeholder="グローバルフィルター"]', 'abc');
  console.log('bar input', await page.evaluate(() => { const i = document.querySelector('.ssg-bar-input'); return getComputedStyle(i).color + ' / ' + getComputedStyle(i).backgroundColor; }));
  await page.fill('input[placeholder="グローバルフィルター"]', '');
  await page.waitForTimeout(300);
  await L.clickCell(page, 14, '摘要'); await page.keyboard.type('xyz');
  console.log('cell editor', await page.evaluate(() => { const i = document.querySelector('.ssg-cell-editor-input'); return getComputedStyle(i).color + ' / ' + getComputedStyle(i).backgroundColor; }));
  await page.keyboard.press('Escape');
  await L.clickCell(page, 14, '金額'); await page.keyboard.type('12');
  console.log('number editor', await page.evaluate(() => { const i = document.querySelector('.ssg-cell-editor-input'); return getComputedStyle(i).color + ' / ' + getComputedStyle(i).backgroundColor; }));
  await page.keyboard.press('Escape');
  // fill menu in dark
  await L.clickCell(page, 14, '金額');
  const b = await L.cellBox(page, 16, '金額');
  const h = await page.evaluate(() => { const e = document.querySelector('.ssg-fill-handle'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x, h.y + 8, { steps: 2 }); await page.mouse.move(b.cx, b.cy, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(300);
  await page.click('.ssg-fill-options'); await page.waitForTimeout(250);
  await L.shot(page, '17-dark-fillmenu');
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
