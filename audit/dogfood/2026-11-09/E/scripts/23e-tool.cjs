const { open, shot, sleep, cellBox } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(1500);
  const hdr = (t) => page.evaluate((t) => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace(/[⋮↑↓]/g, '').trim() === t); if (!h) return null; const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, l: b.x, r: b.right, w: Math.round(b.width), pane: h.closest('[data-pane]')?.getAttribute('data-pane') }; }, t);
  const openMenu = async (t) => {
    const h = await hdr(t);
    await page.mouse.move(h.x, h.y); await sleep(250);
    const mb = await page.evaluate((t) => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace(/[⋮↑↓]/g, '').trim() === t); const b = h.querySelector('button').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, t);
    await page.mouse.click(mb.x, mb.y); await sleep(400);
  };
  const clickItem = async (t) => { const p = await page.evaluate((t) => { const e = [...document.querySelectorAll('.ssg-menu-item')].find(e => e.querySelector('.ssg-menu-label')?.textContent.trim() === t); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, t); if (p) { await page.mouse.click(p.x, p.y); await sleep(500); } return !!p; };
  const before = await page.evaluate(() => document.body.querySelectorAll('*').length);
  await openMenu('JAN');
  await clickItem('列の表示'); await sleep(1000);
  await shot(page, '23e-toolpanel');
  const info = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); const cands = [...document.querySelectorAll('[class*="ssg-"]')].filter(e => /tool|panel|drawer|sidebar/.test(e.className) && !/menu-panel/.test(e.className)).map(e => e.className).slice(0, 15); return { dialog: d ? (d.className + ' ' + d.getAttribute('aria-label')) : null, cands, focus: document.activeElement?.outerHTML.slice(0, 150) }; });
  console.log(info);
  // 「備考」を非表示に
  const cb = await page.evaluate(() => { const root = document.querySelector('[role="dialog"]') || document; const l = [...root.querySelectorAll('label, [role="checkbox"], input[type="checkbox"]')].find(e => (e.closest('label') || e).textContent.includes('備考')); if (!l) return null; const t = l.closest('label') || l; const b = t.getBoundingClientRect(); return { x: b.x + 8, y: b.y + b.height / 2, html: t.outerHTML.slice(0, 200) }; });
  console.log('cb', cb);
  if (cb) { await page.mouse.click(cb.x, cb.y); await sleep(500); }
  console.log('備考 header after hide', await hdr('備考'));
  await shot(page, '23e-after-hide');
  await page.keyboard.press('Escape'); await sleep(400);
  console.log('panel after Esc', await page.evaluate(() => !!document.querySelector('[role="dialog"]')));
  // 3) 列幅のドラッグ(商品名)
  const nm = await hdr('商品名');
  await page.mouse.move(nm.r - 2, nm.y); await sleep(200);
  await page.mouse.down(); await page.mouse.move(nm.r + 80, nm.y, { steps: 8 }); await page.mouse.up(); await sleep(300);
  console.log('商品名 width after drag', (await hdr('商品名')).w, 'before', nm.w);
  const nm2 = await hdr('商品名');
  await page.mouse.move(nm2.r - 2, nm2.y); await sleep(150);
  await page.mouse.dblclick(nm2.r - 2, nm2.y); await sleep(800);
  console.log('商品名 width after autosize dblclick', (await hdr('商品名')).w);
  const im = await hdr('画像');
  await page.mouse.move(im.r - 2, im.y); await sleep(150);
  console.log('画像 cursor', await page.evaluate(({ x, y }) => getComputedStyle(document.elementFromPoint(x, y)).cursor, { x: im.r - 2, y: im.y }));
  await page.mouse.dblclick(im.r - 2, im.y); await sleep(500);
  await page.mouse.down(); await page.mouse.move(im.r + 60, im.y, { steps: 6 }); await page.mouse.up(); await sleep(300);
  console.log('画像 width after dblclick/drag', (await hdr('画像')).w, 'before', im.w);
  await openMenu('JAN');
  await clickItem('すべての列の幅を自動調整'); await sleep(1500);
  console.log('widths after all autosize', await page.evaluate(() => [...document.querySelectorAll('[role="columnheader"]')].map(h => h.textContent.replace(/[⋮↑↓]/g, '').trim() + ':' + Math.round(h.getBoundingClientRect().width)).join(' ')));
  await shot(page, '23e-autosized');
  // 4) Alt+↓ で列メニュー
  const c = await cellBox(page, 4, 7);
  await page.mouse.click(c.x, c.y); await sleep(150);
  await page.keyboard.press('Alt+ArrowDown'); await sleep(500);
  console.log('Alt+Down menu', await page.evaluate(() => ({ open: !!document.querySelector('.ssg-menu-panel'), title: document.querySelector('.ssg-menu-title')?.textContent, focus: document.activeElement?.textContent?.trim().slice(0, 20) })));
  await page.keyboard.press('ArrowDown'); await sleep(100);
  console.log('focus after ArrowDown', await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 20)));
  await page.keyboard.press('ArrowDown'); await sleep(100);
  console.log('focus after ArrowDown2', await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 20)));
  await page.keyboard.press('Enter'); await sleep(600);
  console.log('after Enter: status', await page.evaluate(() => [...document.querySelectorAll('.ssg-root *')].map(e => e.childElementCount === 0 ? e.textContent : '').filter(t => /並び替え/.test(t)).slice(0, 3)), 'focus', await page.evaluate(() => document.activeElement?.className));
  await shot(page, '23e-altdown');
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
