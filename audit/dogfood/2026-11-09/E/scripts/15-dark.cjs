const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  const tokens = () => page.evaluate(() => {
    const r = document.querySelector('.ssg-root');
    const cs = getComputedStyle(r);
    const cell = document.querySelector('.ssg-body-cell');
    return { cls: r.className, scheme: document.documentElement.getAttribute('data-mantine-color-scheme'), cellBg: getComputedStyle(cell).backgroundColor, cellColor: getComputedStyle(cell).color, accent: cs.getPropertyValue('--ssg-accent'), border: cs.getPropertyValue('--ssg-border') || cs.getPropertyValue('--ssg-grid-line'), bodyBg: getComputedStyle(document.body).backgroundColor };
  });
  console.log('light', await tokens());
  // ダークへ
  await page.click('[data-testid="scheme"] label:has-text("ダーク")');
  await sleep(600);
  console.log('dark', await tokens());
  const c = await cellBox(page, 4, 5);
  await page.mouse.click(c.x, c.y);
  await page.keyboard.down('Shift'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift');
  await sleep(300);
  await shot(page, '15-dark-grid');
  // 列メニュー
  const h = await page.evaluate(() => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.includes('メーカー')); const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.move(h.x, h.y); await sleep(250);
  const mb = await page.evaluate(() => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.includes('メーカー')); const b = h.querySelector('button').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.click(mb.x, mb.y); await sleep(400);
  await shot(page, '15-dark-colmenu');
  const fi = await page.evaluate(() => { const e = [...document.querySelectorAll('.ssg-menu-item')].find(e => e.textContent.includes('フィルター…')); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.click(fi.x, fi.y); await sleep(900);
  await shot(page, '15-dark-filter-maker');
  console.log('filter options', await page.evaluate(() => document.querySelectorAll('.ssg-filter-popover .ssg-filter-option').length));
  await page.keyboard.press('Escape'); await sleep(300);
  // 右クリック
  const c2 = await cellBox(page, 6, 5);
  await page.mouse.click(c2.x, c2.y, { button: 'right' }); await sleep(400);
  await shot(page, '15-dark-ctx');
  await page.keyboard.press('Escape'); await sleep(300);
  // select editor
  const m = await cellBox(page, 7, 7);
  await page.mouse.dblclick(m.x, m.y); await sleep(400);
  await shot(page, '15-dark-select');
  await page.keyboard.press('Escape'); await sleep(300);
  // custom editor
  const s = await cellBox(page, 8, 8);
  await page.mouse.dblclick(s.x, s.y); await sleep(500);
  await shot(page, '15-dark-custom');
  await page.keyboard.press('Escape'); await sleep(300);
  // invalid + tooltip hover (JAN を壊す)
  const j = await cellBox(page, 9, 6);
  await page.mouse.click(j.x, j.y); await page.keyboard.type('12'); await page.keyboard.press('Enter'); await sleep(300);
  await page.mouse.move(j.x, j.y); await sleep(1200);
  await shot(page, '15-dark-invalid-tooltip');
  // 自動(システムがライト)に戻す
  await page.click('[data-testid="scheme"] label:has-text("自動")');
  await sleep(500);
  console.log('auto(light os)', await tokens());
  await page.emulateMedia({ colorScheme: 'dark' });
  await sleep(500);
  console.log('auto(dark os)', await tokens());
  await shot(page, '15-auto-dark');
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
