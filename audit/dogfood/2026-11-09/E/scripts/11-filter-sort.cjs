const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(1500);
  const header = (key) => page.evaluate((title) => {
    const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace('⋮', '').trim() === title);
    const b = h.getBoundingClientRect();
    const menuBtn = h.querySelector('button, [role="button"]');
    const mb = menuBtn?.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, menu: mb ? { x: mb.x + mb.width / 2, y: mb.y + mb.height / 2, label: menuBtn.getAttribute('aria-label') } : null };
  }, key);
  const menuItems = () => page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"], .ssg-menu-item')].map(e => e.textContent.trim()));
  const summary = () => page.evaluate(() => ({
    top: document.querySelector('.ssg-root')?.textContent.match(/行 \d+ \/ \d+|絞り込み: [^並]*|並び替え: [^\s]*/g),
    labels: [...document.querySelectorAll('.ssg-label-row')].map(e => e.textContent).slice(0, 4),
    firstIds: [...document.querySelectorAll('[role="row"]')].filter(r => Number(r.getAttribute('aria-rowindex')) > 1).slice(0, 6).map(r => r.getAttribute('aria-rowindex') + ':' + (r.querySelector('[aria-colindex="4"]')?.textContent ?? r.textContent.slice(0, 20))),
    handleDisabled: document.querySelectorAll('.ssg-row-drag-handle--disabled').length,
  }));
  // 状態の列メニュー
  let h = await header('状態');
  await page.mouse.move(h.x, h.y);
  await sleep(200);
  h = await header('状態');
  console.log('menu btn', h.menu);
  await page.mouse.click(h.menu.x, h.menu.y);
  await sleep(400);
  console.log('menu items', await menuItems());
  await shot(page, '11-colmenu');
  // フィルター…
  const fi = await page.evaluate(() => { const e = [...document.querySelectorAll('[role="menuitem"], .ssg-menu-item')].find(e => e.textContent.includes('フィルター')); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.click(fi.x, fi.y);
  await sleep(800);
  await shot(page, '11-filter-popover');
  const pop = await page.evaluate(() => { const p = document.querySelector('.ssg-filter-popover, [class*="filter-popover"], [role="dialog"]'); return p ? { cls: p.className, text: p.textContent.slice(0, 200) } : null; });
  console.log('popover', pop);
  // 「販売中」のチェックを外す
  const cb = await page.evaluate(() => { const lab = [...document.querySelectorAll('label, [role="checkbox"], [role="option"]')].find(e => e.textContent.trim() === '販売中'); if (!lab) return null; const b = lab.getBoundingClientRect(); return { x: b.x + 10, y: b.y + b.height / 2 }; });
  console.log('cb', cb);
  if (cb) { await page.mouse.click(cb.x, cb.y); await sleep(300); }
  const apply = await page.evaluate(() => { const e = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === '適用'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  if (apply) { await page.mouse.click(apply.x, apply.y); } else { await page.keyboard.press('Enter'); }
  await sleep(800);
  console.log('after filter', await summary());
  await shot(page, '11-filtered');
  // 売価で降順ソート(列メニュー)
  h = await header('売価');
  await page.mouse.move(h.x, h.y); await sleep(200); h = await header('売価');
  await page.mouse.click(h.menu.x, h.menu.y); await sleep(400);
  console.log('price menu', await menuItems());
  const desc = await page.evaluate(() => { const e = [...document.querySelectorAll('[role="menuitem"], .ssg-menu-item')].find(e => e.textContent.includes('降順')); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.click(desc.x, desc.y); await sleep(800);
  console.log('after sort', await summary());
  await shot(page, '11-sorted');
  // 列見出しをクリック(選択?ソート?)
  // グローバルフィルター
  await page.click('input[placeholder="グローバルフィルター"]');
  await page.keyboard.insertText('チョコ');
  await sleep(1000);
  console.log('global', await summary());
  await shot(page, '11-global');
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
