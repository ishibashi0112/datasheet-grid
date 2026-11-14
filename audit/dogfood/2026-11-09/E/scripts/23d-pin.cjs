const { open, shot, sleep } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(1500);
  const hdr = (t) => page.evaluate((t) => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace(/[⋮↑↓]/g, '').trim() === t); if (!h) return null; const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, l: b.x, r: b.right, w: b.width, pane: h.closest('[data-pane]')?.getAttribute('data-pane') }; }, t);
  const openMenu = async (t) => {
    const h = await hdr(t);
    await page.mouse.move(h.x, h.y); await sleep(250);
    const mb = await page.evaluate((t) => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace(/[⋮↑↓]/g, '').trim() === t); const b = h.querySelector('button').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, t);
    await page.mouse.click(mb.x, mb.y); await sleep(400);
  };
  const itemPos = (t) => page.evaluate((t) => { const e = [...document.querySelectorAll('.ssg-menu-item')].find(e => e.querySelector('.ssg-menu-label')?.textContent.trim() === t); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, dis: e.getAttribute('aria-disabled'), tip: e.getAttribute('data-ssg-tooltip') }; }, t);
  const labels = () => page.evaluate(() => [...document.querySelectorAll('.ssg-menu-item')].map(e => e.querySelector('.ssg-menu-label')?.textContent.trim() + (e.getAttribute('aria-disabled') ? '(disabled:' + e.getAttribute('data-ssg-tooltip') + ')' : '')));
  console.log('JAN before', await hdr('JAN'));
  await openMenu('JAN');
  const p = await itemPos('列の固定');
  await page.mouse.move(p.x, p.y, { steps: 3 }); await sleep(700);
  console.log('after hover', await labels());
  await shot(page, '23d-pin-hover');
  const l = await itemPos('左に固定') || await itemPos('左');
  console.log('left', l);
  if (!l) {
    // キーボードで開く
    await page.keyboard.press('ArrowRight'); await sleep(500);
    console.log('after ArrowRight', await labels());
  }
  const l2 = await page.evaluate(() => { const e = [...document.querySelectorAll('.ssg-menu-item')].find(e => /左/.test(e.textContent)); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, t: e.textContent }; });
  console.log('l2', l2);
  if (l2) { await page.mouse.move(l2.x, l2.y, { steps: 4 }); await sleep(200); await page.mouse.click(l2.x, l2.y); await sleep(600); }
  console.log('JAN after', await hdr('JAN'));
  await shot(page, '23d-after-pin');
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
