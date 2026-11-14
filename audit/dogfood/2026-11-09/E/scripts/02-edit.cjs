const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
const COL = { image: 3, id: 4, name: 5, jan: 6, maker: 7, supplier: 8, price: 9, cost: 10, margin: 11, stock: 12, status: 13, release: 14, tax: 15, disc: 16, note: 17 };
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  const txt = async (r, c) => (await cellBox(page, r, c))?.text;
  const click = async (r, c, o = {}) => { await reveal(page, r, c); const b = await cellBox(page, r, c); await page.mouse.click(b.x, b.y, o); };
  const dbl = async (r, c) => { await reveal(page, r, c); const b = await cellBox(page, r, c); await page.mouse.dblclick(b.x, b.y); };
  const out = {};
  // 1. 商品名を打ち替える(印字キーで開始)
  await click(3, COL.name);
  await page.keyboard.type('Test item A');
  await page.keyboard.press('Enter');
  await sleep(200);
  out.name = await txt(3, COL.name);
  out.activeAfterEnter = await page.evaluate(() => document.querySelector('.ssg-bottom-bar, [class*="bottom"]')?.textContent);
  // 2. 商品名を空で確定 → reject
  await click(4, COL.name);
  await page.keyboard.press('F2');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await sleep(300);
  out.rejectBubble = await page.evaluate(() => [...document.querySelectorAll('[class*="invalid"], [class*="error"], [role="alert"]')].map(e => e.className + ':' + e.textContent).slice(0, 5));
  await shot(page, '02-reject');
  await page.keyboard.press('Escape');
  await sleep(200);
  out.nameAfterEsc = await txt(4, COL.name);
  // 3. 売価に全角数字
  await click(3, COL.price);
  await page.keyboard.press('F2');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('１，２００');
  await page.keyboard.press('Enter');
  await sleep(200);
  out.priceFull = await txt(3, COL.price);
  // 4. 原価を売価より大きく → mark
  await click(3, COL.cost);
  await page.keyboard.type('5000');
  await page.keyboard.press('Enter');
  await sleep(200);
  out.cost = await txt(3, COL.cost);
  out.margin = await txt(3, COL.margin);
  out.costInvalid = await page.evaluate(() => [...document.querySelectorAll('[role="row"][aria-rowindex="3"] [aria-colindex="10"]')].map(e => e.className + '|' + e.getAttribute('aria-invalid')));
  // 5. JAN を間違えて mark
  await click(5, COL.jan);
  await page.keyboard.type('123');
  await page.keyboard.press('Enter');
  await sleep(200);
  out.janInvalid = await page.evaluate(() => [...document.querySelectorAll('[role="row"][aria-rowindex="5"] [aria-colindex="6"]')].map(e => e.className + '|' + e.getAttribute('aria-invalid')));
  // 6. メーカー(300 件の select)を開く
  await dbl(6, COL.maker);
  await sleep(300);
  const sel = await page.evaluate(() => {
    const lb = document.querySelector('[role="listbox"]');
    if (!lb) return null;
    const b = lb.getBoundingClientRect();
    return { n: lb.querySelectorAll('[role="option"]').length, rect: [b.x, b.y, b.width, b.height], selected: lb.querySelector('[aria-selected="true"]')?.textContent, parent: lb.parentElement?.className };
  });
  out.makerListbox = sel;
  await shot(page, '02-maker-select');
  await page.keyboard.type('鈴木');
  await sleep(200);
  out.makerTypeahead = await page.evaluate(() => document.querySelector('[role="listbox"] [aria-selected="true"], [role="listbox"] [data-highlighted], [role="listbox"] .ssg-select-option--active')?.textContent);
  await page.keyboard.press('Enter');
  await sleep(200);
  out.maker = await txt(6, COL.maker);
  // 7. 状態 select(renderCell の Badge)
  await click(7, COL.status);
  await page.keyboard.press('Enter');
  await sleep(200);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await sleep(200);
  out.status = await txt(7, COL.status);
  // 8. 税率 select(値は数値、option は文字列)
  await click(8, COL.tax);
  await page.keyboard.press('F2');
  await sleep(200);
  out.taxListbox = await page.evaluate(() => { const lb = document.querySelector('[role="listbox"]'); return lb ? { sel: lb.querySelector('[aria-selected="true"]')?.textContent, opts: [...lb.querySelectorAll('[role="option"]')].map(o => o.textContent + ':' + o.getAttribute('aria-selected')) } : null; });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await sleep(200);
  out.tax = await txt(8, COL.tax);
  // 9. 発売日 date
  await click(9, COL.release);
  await page.keyboard.press('F2');
  await sleep(200);
  out.dateInput = await page.evaluate(() => { const i = document.activeElement; return i ? i.tagName + ':' + i.type + ':' + i.value : null; });
  await page.keyboard.type('20250102');
  await page.keyboard.press('Enter');
  await sleep(200);
  out.date = await txt(9, COL.release);
  // 10. checkbox 廃番 Space
  await click(10, COL.disc);
  await page.keyboard.press('Space');
  await sleep(200);
  out.disc = await page.evaluate(() => [...document.querySelectorAll('[role="row"][aria-rowindex="10"] [aria-colindex="16"] input')].map(i => i.checked));
  // 11. 粗利率(計算列 editable false)に打鍵
  await click(11, COL.margin);
  await page.keyboard.type('9');
  await sleep(200);
  out.marginEditor = await page.evaluate(() => document.activeElement?.tagName + ':' + document.activeElement?.className);
  // 12. undo 連打
  await page.keyboard.press('Escape');
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Control+z'); await sleep(150); }
  out.afterUndo = { disc: await page.evaluate(() => [...document.querySelectorAll('[role="row"][aria-rowindex="10"] [aria-colindex="16"] input')].map(i => i.checked)), date: await txt(9, COL.release), tax: await txt(8, COL.tax) };
  await page.keyboard.press('Control+y');
  await sleep(150);
  out.afterRedo = { tax: await txt(8, COL.tax) };
  await shot(page, '02-after');
  console.log(JSON.stringify(out, null, 1));
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
