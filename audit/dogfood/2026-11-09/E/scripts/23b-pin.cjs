const { open, shot, sleep, cellBox } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(1500);
  const openMenu = async (title) => {
    const h = await page.evaluate((title) => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace(/[⋮↑↓]/g, '').trim() === title); const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, title);
    await page.mouse.move(h.x, h.y); await sleep(250);
    const mb = await page.evaluate((title) => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace(/[⋮↑↓]/g, '').trim() === title); const b = h.querySelector('button').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, title);
    await page.mouse.click(mb.x, mb.y); await sleep(400);
  };
  await openMenu('JAN');
  const pin = await page.evaluate(() => { const e = [...document.querySelectorAll('.ssg-menu-panel *')].find(e => e.textContent.trim().startsWith('列の固定') && e.children.length <= 2 && (e.tagName === 'BUTTON' || e.getAttribute('role'))); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, html: e.outerHTML.slice(0, 300) }; });
  console.log(pin.html);
  await page.mouse.move(pin.x, pin.y); await sleep(600);
  console.log('hover items', await page.evaluate(() => [...document.querySelectorAll('.ssg-menu-panel button, .ssg-menu-panel [role^="menuitem"]')].map(e => e.textContent.trim() + (e.disabled || e.getAttribute('aria-disabled') === 'true' ? '(disabled)' : ''))));
  await page.mouse.click(pin.x, pin.y); await sleep(600);
  console.log('click items', await page.evaluate(() => [...document.querySelectorAll('.ssg-menu-panel button, .ssg-menu-panel [role^="menuitem"]')].map(e => e.textContent.trim() + (e.disabled || e.getAttribute('aria-disabled') === 'true' ? '(disabled)' : ''))));
  await shot(page, '23b-pin');
  const left = await page.evaluate(() => { const e = [...document.querySelectorAll('.ssg-menu-panel button, .ssg-menu-panel [role^="menuitem"]')].find(e => /左/.test(e.textContent)); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, t: e.textContent }; });
  console.log('left item', left);
  if (left) { await page.mouse.click(left.x, left.y); await sleep(600); }
  console.log('JAN pane', await page.evaluate(() => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.includes('JAN')); return h.closest('[data-pane]')?.getAttribute('data-pane'); }));
  // 列の表示
  await openMenu('JAN');
  const vis = await page.evaluate(() => { const e = [...document.querySelectorAll('.ssg-menu-panel button, .ssg-menu-panel [role^="menuitem"]')].find(e => e.textContent.trim() === '列の表示'); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.click(vis.x, vis.y); await sleep(1000);
  await shot(page, '23b-toolpanel');
  console.log('panel?', await page.evaluate(() => [...document.querySelectorAll('[class*="panel"]')].map(e => e.className).slice(0, 10)));
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
