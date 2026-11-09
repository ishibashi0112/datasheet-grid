const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const base = process.argv[2] || 'http://127.0.0.1:5405';
  const { browser, page, logs } = await open(base + '/mixed.html');
  const reqs = [];
  page.on('request', (r) => { if (r.url().includes('.js')) reqs.push(r.url().replace(base, '')); });
  await page.waitForSelector('[data-testid="full"] .ssg-root');
  await sleep(2500);
  await shot(page, '22-mixed');
  const out = {};
  for (const side of ['lite', 'full']) {
    const R = `[data-testid="${side}"]`;
    const res = {};
    // 列メニュー → フィルター
    await reveal(page, 4, 5, R);
    const hdr = await page.evaluate((R) => { const h = [...document.querySelector(R).querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace('⋮', '').trim() === '商品名'); const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, R);
    await page.mouse.move(hdr.x, hdr.y); await sleep(250);
    const mb = await page.evaluate((R) => { const h = [...document.querySelector(R).querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace('⋮', '').trim() === '商品名'); const b = h.querySelector('button').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, R);
    await page.mouse.click(mb.x, mb.y); await sleep(400);
    res.menu = await page.evaluate(() => [...document.querySelectorAll('.ssg-menu-item')].map(e => e.textContent.trim()));
    const fi = await page.evaluate(() => { const e = [...document.querySelectorAll('.ssg-menu-item')].find(e => e.textContent.includes('フィルター…')); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    await page.mouse.click(fi.x, fi.y); await sleep(800);
    res.popover = await page.evaluate(() => document.querySelector('.ssg-filter-popover')?.textContent.slice(0, 60));
    await page.keyboard.insertText('緑茶'); await page.keyboard.press('Enter'); await sleep(600);
    res.rows = await page.evaluate((R) => document.querySelector(R).textContent.match(/行 \d+ \/ \d+/)?.[0], R);
    await page.keyboard.press('Escape'); await sleep(300);
    // find
    const c = await cellBox(page, 4, 5, R);
    await page.mouse.click(c.x, c.y);
    await page.keyboard.press('Control+f'); await sleep(200);
    await page.keyboard.insertText('徳用'); await sleep(800);
    res.find = await page.evaluate((R) => document.querySelector(R + ' .ssg-find-bar')?.textContent, R);
    await page.keyboard.press('Escape'); await sleep(200);
    out[side] = res;
  }
  // 片方の編集がもう片方へ(同じ rows)
  const c = await cellBox(page, 3, 5, '[data-testid="lite"]');
  await page.mouse.click(c.x, c.y); await page.keyboard.type('Shared edit'); await page.keyboard.press('Enter'); await sleep(400);
  out.sharedEdit = await page.evaluate(() => [...document.querySelectorAll('[data-testid="full"] [role="row"]')].map(r => r.textContent).find(t => t.includes('Shared edit')) ? 'synced' : 'not found (filtered?)');
  await shot(page, '22-mixed-after');
  console.log(JSON.stringify(out, null, 1));
  console.log('JS requests:', reqs.filter(u => /ColumnFilter|toolPanel|lazy|chunk/.test(u)));
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
