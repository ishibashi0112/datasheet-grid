const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
const R = '[data-testid="modal-grid-wrap"]';
// モーダルのグリッドは行選択・行ドラッグなし → データ列は 2 から
const C = { image: 2, id: 3, name: 4, jan: 5, maker: 6, supplier: 7, price: 8, status: 12, release: 13, note: 16 };
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  const st = () => page.evaluate(() => ({
    modal: !!document.querySelector('.mantine-Modal-content'),
    focus: (document.activeElement?.getAttribute('data-testid') || document.activeElement?.className || document.activeElement?.tagName || '').toString().slice(0, 40),
    editor: !!document.querySelector('.ssg-cell-editor'),
    menu: !!document.querySelector('.ssg-menu-panel'),
    popover: !!document.querySelector('.ssg-filter-popover'),
    listbox: !!document.querySelector('.ssg-root ~ * [role="listbox"], body > [role="listbox"], [role="listbox"]'),
    combobox: !!document.querySelector('[data-combobox-option]'),
    find: !!document.querySelector('.ssg-find-bar'),
  }));
  const fresh = async () => {
    for (let i = 0; i < 10 && (await page.evaluate(() => !!document.querySelector('.mantine-Modal-content'))); i++) await sleep(100);
    if (await page.evaluate(() => !!document.querySelector('.mantine-Modal-content'))) {
      await page.evaluate(() => document.querySelector('[data-testid="modal-close"]')?.click());
      for (let i = 0; i < 20 && (await page.evaluate(() => !!document.querySelector('.mantine-Modal-content'))); i++) await sleep(100);
    }
    await page.click('[data-testid="open-modal"]');
    await page.waitForSelector('[data-testid="modal-grid-wrap"] .ssg-root');
    await sleep(600);
  };
  const topAt = (p) => p && page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return (e?.className?.toString() || e?.tagName).slice(0, 40) + ' / ' + e?.textContent?.slice(0, 20); }, p);
  const center = (sel, pred) => page.evaluate(({ sel, pred }) => { const e = [...document.querySelectorAll(sel)].find((e) => !pred || e.textContent.includes(pred)); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, { sel, pred });
  const res = [];
  const scenario = async (name, fn) => {
    await fresh();
    const before = await st();
    let detail;
    try { detail = await fn(); } catch (e) { detail = 'ERR ' + e.message.split('\n')[0]; }
    const mid = await st();
    await page.keyboard.press('Escape');
    await sleep(900);
    const after = await st();
    res.push({ name, detail, beforeEsc: mid, afterEsc: after });
  };
  const clickCell = async (r, c) => { await reveal(page, r, c, R); const b = await cellBox(page, r, c, R); await page.mouse.click(b.x, b.y); await sleep(150); return b; };
  const openColMenu = async (title, col) => {
    await reveal(page, 4, col, R);
    const hdr = await page.evaluate(({ R, title }) => { const h = [...document.querySelector(R).querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace('⋮', '').trim() === title); const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, { R, title });
    await page.mouse.move(hdr.x, hdr.y); await sleep(250);
    const mb = await page.evaluate(({ R, title }) => { const h = [...document.querySelector(R).querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace('⋮', '').trim() === title); const b = h.querySelector('button').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, { R, title });
    await page.mouse.click(mb.x, mb.y); await sleep(400);
  };

  await scenario('Esc: セルを編集中', async () => { await clickCell(3, C.name); await page.keyboard.type('abc'); await sleep(200); });
  await scenario('Esc: セルを選択しているだけ', async () => { await clickCell(4, C.name); });
  await scenario('Esc: 列メニューを開いた', async () => { await openColMenu('状態', C.status); const p = await center('.ssg-menu-item', 'フィルター…'); return { topmost: await topAt(p) }; });
  await scenario('Esc: 列フィルターの検索欄', async () => {
    await openColMenu('状態', C.status);
    const p = await center('.ssg-menu-item', 'フィルター…'); await page.mouse.click(p.x, p.y); await sleep(800);
    const si = await center('.ssg-filter-popover input.ssg-filter-input');
    const top = await topAt(si);
    await page.mouse.click(si.x, si.y); await page.keyboard.type('販'); await sleep(200);
    const val = await page.evaluate(() => document.querySelector('.ssg-filter-popover input.ssg-filter-input')?.value);
    // 「販売中」のチェックを外せるか
    const cb = await center('.ssg-filter-popover label', '販売停止');
    const cbTop = await topAt(cb);
    if (cb) { await page.mouse.click(cb.x, cb.y); await sleep(300); }
    await shot(page, '14-modal-filter');
    const rows = await page.evaluate((R) => document.querySelector(R).textContent.match(/行 \d+ \/ \d+/)?.[0], R);
    return { top, val, cbTop, rows };
  });
  await scenario('Esc: 右クリックメニュー', async () => {
    const b = await clickCell(5, C.name);
    await page.mouse.click(b.x, b.y, { button: 'right' }); await sleep(400);
    const p = await center('.ssg-menu-item', '行を複製');
    await shot(page, '14-modal-ctxmenu');
    return { topmost: await topAt(p) };
  });
  await scenario('右クリックメニューの項目を押す', async () => {
    const before = await page.evaluate((R) => document.querySelector(R).textContent.match(/行 \d+ \/ \d+/)?.[0], R);
    const b = await clickCell(5, C.name);
    await page.mouse.click(b.x, b.y, { button: 'right' }); await sleep(400);
    const p = await center('.ssg-menu-item', '行を複製');
    await page.mouse.click(p.x, p.y); await sleep(400);
    const after = await page.evaluate((R) => document.querySelector(R).textContent.match(/行 \d+ \/ \d+/)?.[0], R);
    return { before, after };
  });
  await scenario('Esc: select エディタ(メーカー)', async () => {
    await reveal(page, 6, C.maker, R);
    const b = await cellBox(page, 6, C.maker, R);
    await page.mouse.dblclick(b.x, b.y); await sleep(400);
    const o = await center('[role="listbox"] [role="option"]', null);
    await shot(page, '14-modal-select');
    return { topmost: await topAt(o) };
  });
  await scenario('select の選択肢をクリック', async () => {
    await reveal(page, 6, C.maker, R);
    const b = await cellBox(page, 6, C.maker, R);
    await page.mouse.dblclick(b.x, b.y); await sleep(400);
    const o = await page.evaluate(() => { const e = document.querySelectorAll('[role="listbox"] [role="option"]')[2]; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: e.textContent }; });
    await page.mouse.click(o.x, o.y); await sleep(400);
    return { picked: o.t, cell: (await cellBox(page, 6, C.maker, R))?.text };
  });
  await scenario('Esc: custom(Mantine Select)', async () => {
    await reveal(page, 7, C.supplier, R);
    const b = await cellBox(page, 7, C.supplier, R);
    await page.mouse.dblclick(b.x, b.y); await sleep(500);
    const o = await center('[data-combobox-option]', null);
    await shot(page, '14-modal-custom');
    return { topmost: await topAt(o) };
  });
  await scenario('custom の選択肢をクリック', async () => {
    await reveal(page, 7, C.supplier, R);
    const b = await cellBox(page, 7, C.supplier, R);
    await page.mouse.dblclick(b.x, b.y); await sleep(500);
    const o = await page.evaluate(() => { const e = document.querySelectorAll('[data-combobox-option]')[1]; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: e.textContent }; });
    await page.mouse.click(o.x, o.y); await sleep(400);
    return { picked: o.t, cell: (await cellBox(page, 7, C.supplier, R))?.text };
  });
  await scenario('Esc: date エディタ', async () => {
    await reveal(page, 8, C.release, R);
    const b = await cellBox(page, 8, C.release, R);
    await page.mouse.dblclick(b.x, b.y); await sleep(400);
    return await page.evaluate(() => document.activeElement?.type);
  });
  await scenario('Esc: 検索バー (Ctrl+F)', async () => { await clickCell(4, C.name); await page.keyboard.press('Control+f'); await sleep(300); });
  await scenario('Tab: 最終列から', async () => {
    await clickCell(4, C.name);
    await page.keyboard.press('End'); await sleep(150);
    await page.keyboard.press('Tab'); await sleep(200);
    const a = await st();
    await page.keyboard.press('Shift+Tab'); await sleep(200);
    const b = await st();
    return { afterTab: a.focus, afterShiftTab: b.focus };
  });
  for (const r of res) console.log(JSON.stringify(r));
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
