const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
const SUP = 8;
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  const txt = async (r, c) => (await cellBox(page, r, c))?.text;
  const state = () => page.evaluate(() => ({
    editor: !!document.querySelector('.ssg-cell-editor'),
    dropdown: !!document.querySelector('.mantine-Select-dropdown, [data-combobox-dropdown], .mantine-Combobox-dropdown'),
    options: document.querySelectorAll('.mantine-Select-option, [data-combobox-option]').length,
    active: document.activeElement?.tagName + '.' + (document.activeElement?.className || '').toString().slice(0, 60),
  }));
  const out = {};
  out.before = await txt(3, SUP);
  // a) ダブルクリックで開く
  await reveal(page, 3, SUP);
  let b = await cellBox(page, 3, SUP);
  await page.mouse.dblclick(b.x, b.y);
  await sleep(500);
  out.a_open = await state();
  await shot(page, '04-custom-open');
  // b) マウスで選択肢をクリック
  const opt = await page.evaluate(() => { const o = [...document.querySelectorAll('[data-combobox-option], .mantine-Select-option')][3]; if (!o) return null; o.scrollIntoView({ block: 'nearest' }); const r = o.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: o.textContent }; });
  out.b_target = opt;
  if (opt) { await page.mouse.click(opt.x, opt.y); await sleep(400); }
  out.b_after = await state();
  out.b_value = await txt(3, SUP);
  out.b_activeRow = await page.evaluate(() => document.querySelector('[id$="-active-cell"]')?.closest('[role="row"]')?.getAttribute('aria-rowindex'));
  await shot(page, '04-custom-after-click');
  // c) キーボード: F2 → 文字 → ↓ → Enter
  await reveal(page, 4, SUP);
  b = await cellBox(page, 4, SUP);
  await page.mouse.click(b.x, b.y);
  await page.keyboard.press('F2');
  await sleep(400);
  out.c_open = await state();
  await page.keyboard.insertText('大阪');
  await sleep(300);
  out.c_filtered = await state();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await sleep(400);
  out.c_after = await state();
  out.c_value = await txt(4, SUP);
  // d) Escape で取り消し
  await reveal(page, 5, SUP);
  b = await cellBox(page, 5, SUP);
  const before5 = await txt(5, SUP);
  await page.mouse.dblclick(b.x, b.y);
  await sleep(400);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await sleep(300);
  out.d_afterEsc1 = await state();
  if (out.d_afterEsc1.editor) { await page.keyboard.press('Escape'); await sleep(300); out.d_afterEsc2 = await state(); }
  out.d_value = [before5, await txt(5, SUP)];
  // e) 編集中にほかのセルをクリック
  await reveal(page, 6, SUP);
  b = await cellBox(page, 6, SUP);
  const before6 = await txt(6, SUP);
  await page.mouse.dblclick(b.x, b.y);
  await sleep(400);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const b2 = await cellBox(page, 10, 5);
  await page.mouse.click(b2.x, b2.y);
  await sleep(400);
  out.e_after = await state();
  out.e_value = [before6, await txt(6, SUP)];
  // f) Tab
  await reveal(page, 7, SUP);
  b = await cellBox(page, 7, SUP);
  await page.mouse.dblclick(b.x, b.y);
  await sleep(400);
  await page.keyboard.press('Tab');
  await sleep(300);
  out.f_afterTab = await state();
  await page.keyboard.press('Escape');
  await sleep(200);
  // g) ドロップダウンをホイールでスクロール
  await reveal(page, 8, SUP);
  b = await cellBox(page, 8, SUP);
  await page.mouse.dblclick(b.x, b.y);
  await sleep(400);
  const dd = await page.evaluate(() => { const d = document.querySelector('.mantine-Select-dropdown, .mantine-Combobox-dropdown'); if (!d) return null; const r = d.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (dd) { await page.mouse.move(dd.x, dd.y); await page.mouse.wheel(0, 300); await sleep(400); }
  out.g_afterWheel = await state();
  await shot(page, '04-custom-wheel');
  // h) 印字キーで開始(ctx.initialText)
  await page.keyboard.press('Escape'); await sleep(200); await page.keyboard.press('Escape'); await sleep(200);
  await reveal(page, 9, SUP);
  b = await cellBox(page, 9, SUP);
  await page.mouse.click(b.x, b.y);
  await page.keyboard.press('t');
  await sleep(400);
  out.h_typed = await state();
  out.h_inputValue = await page.evaluate(() => document.activeElement?.value);
  console.log(JSON.stringify(out, null, 1));
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
