const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(1500);
  const hdrInfo = (title) => page.evaluate((title) => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace(/[⋮↑↓]/g, '').trim() === title); if (!h) return null; const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, l: b.x, r: b.right, w: b.width, pinnedPane: h.closest('[data-pane]')?.getAttribute('data-pane') }; }, title);
  const openMenu = async (title) => {
    const h = await hdrInfo(title);
    await page.mouse.move(h.x, h.y); await sleep(250);
    const mb = await page.evaluate((title) => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace(/[⋮↑↓]/g, '').trim() === title); const b = h.querySelector('button').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, title);
    await page.mouse.click(mb.x, mb.y); await sleep(400);
  };
  const clickItem = async (text) => { const p = await page.evaluate((t) => { const e = [...document.querySelectorAll('.ssg-menu-item, [role="menuitem"], [role="menuitemradio"]')].find(e => e.textContent.trim().includes(t)); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, text); if (p) { await page.mouse.click(p.x, p.y); await sleep(400); } return !!p; };
  // 1) 列の固定(onColumnsChange なし)
  await openMenu('JAN');
  await clickItem('列の固定');
  console.log('pin submenu', await page.evaluate(() => [...document.querySelectorAll('.ssg-menu-item, [role="menuitemradio"]')].map(e => e.textContent.trim() + (e.getAttribute('aria-disabled') ? '(disabled)' : ''))));
  await shot(page, '23-pin-submenu');
  const pinned = await clickItem('左');
  await sleep(300);
  console.log('clicked 左', pinned, 'JAN pane after:', (await hdrInfo('JAN'))?.pinnedPane, (await hdrInfo('JAN'))?.l);
  await page.keyboard.press('Escape'); await sleep(200);
  // 2) 列の表示 → ツールパネル
  await openMenu('JAN');
  await clickItem('列の表示');
  await sleep(800);
  await shot(page, '23-toolpanel');
  const panel = await page.evaluate(() => { const p = document.querySelector('.ssg-tool-panel, [class*="tool-panel"]'); return p ? p.textContent.slice(0, 200) : null; });
  console.log('panel', panel);
  // 「備考」を非表示に
  const cb = await page.evaluate(() => { const p = document.querySelector('.ssg-tool-panel, [class*="tool-panel"]'); const l = [...p.querySelectorAll('label, [role="checkbox"]')].find(e => e.textContent.includes('備考')); if (!l) return null; const b = l.getBoundingClientRect(); return { x: b.x + 10, y: b.y + b.height / 2 }; });
  if (cb) { await page.mouse.click(cb.x, cb.y); await sleep(400); }
  console.log('備考 header after hide', await hdrInfo('備考'));
  await page.keyboard.press('Escape'); await sleep(300);
  // 3) 列幅のドラッグ(商品名)
  const nm = await hdrInfo('商品名');
  await page.mouse.move(nm.r - 2, nm.y); await sleep(200);
  await page.mouse.down(); await page.mouse.move(nm.r + 80, nm.y, { steps: 8 }); await page.mouse.up(); await sleep(300);
  console.log('商品名 width after drag', (await hdrInfo('商品名')).w, 'before', nm.w);
  // 境界ダブルクリックで自動調整
  const nm2 = await hdrInfo('商品名');
  await page.mouse.move(nm2.r - 2, nm2.y); await sleep(150);
  await page.mouse.dblclick(nm2.r - 2, nm2.y); await sleep(800);
  console.log('商品名 width after autosize', (await hdrInfo('商品名')).w);
  // 画像列(suppressAutoSize / resizable:false)
  const im = await hdrInfo('画像');
  await page.mouse.dblclick(im.r - 2, im.y); await sleep(500);
  console.log('画像 width after dblclick', (await hdrInfo('画像')).w);
  // すべての列の幅を自動調整
  await openMenu('JAN');
  await clickItem('すべての列の幅を自動調整'); await sleep(1500);
  console.log('widths after all autosize', await page.evaluate(() => [...document.querySelectorAll('[role="columnheader"]')].map(h => h.textContent.replace(/[⋮↑↓]/g, '').trim() + ':' + Math.round(h.getBoundingClientRect().width))));
  await shot(page, '23-autosized');
  // 4) Alt+↓ で列メニュー
  const c = await cellBox(page, 4, 7);
  await page.mouse.click(c.x, c.y); await sleep(100);
  await page.keyboard.press('Alt+ArrowDown'); await sleep(400);
  console.log('Alt+Down menu', await page.evaluate(() => ({ open: !!document.querySelector('.ssg-menu-panel'), focus: document.activeElement?.textContent?.trim().slice(0, 20) })));
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await sleep(600);
  console.log('after menu Enter', await page.evaluate(() => document.querySelector('.ssg-root').textContent.match(/並び替え: [^\s画]*/)?.[0]));
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
