const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}${a.getAttribute('name') ? '[name=' + a.getAttribute('name') + ']' : ''}.${(a.className || '').toString().slice(0, 40)}` : null; });
(async () => {
  const { browser, page, logs } = await L.open();
  // 1. グリッドのセルを選んでからフォームの金額欄をクリックして入力・Enter
  await L.clickCell(page, 15, '金額');
  await page.click('input[name="amount"]');
  console.log('focus after click form', await active(page));
  await page.keyboard.type('2500');
  await page.keyboard.press('Tab');
  console.log('after Tab from amount', await active(page));
  await page.keyboard.press('ArrowDown'); // select 税区分 change
  console.log('after ArrowDown in select', await active(page));
  await page.keyboard.press('Tab');
  console.log('after Tab', await active(page));
  await page.keyboard.type('テスト 追加');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  let rows = await rowsOf(page);
  console.log('rows', rows.length, JSON.stringify(rows[rows.length - 1]));
  console.log('focus after Enter submit', await active(page), 'message', await page.textContent('[data-testid="message"]'));
  console.log('grid active cell', JSON.stringify(await page.evaluate(() => window.__app.grid.getActiveCell())));
  console.log('header', await L.headerTotal(page), 'total row', await L.totalRowText(page));
  // undo add (applyRows → undoable)
  await page.click('[data-testid="undo-btn"]');
  await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('after undo button rows', rows.length, 'focus', await active(page));
  await page.click('[data-testid="redo-btn"]');
  await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('after redo button rows', rows.length);

  // 2. 編集中にフォームの摘要欄を押す → 確定 + フォーカスはフォーム
  await L.clickCell(page, 17, '摘要');
  await page.keyboard.type('編集中の値');
  console.log('editing?', !!(await page.$('.ssg-cell-editor')));
  await page.click('input[name="memo"]');
  await page.waitForTimeout(400);
  rows = await rowsOf(page);
  console.log('after click form: editor?', !!(await page.$('.ssg-cell-editor')), 'memo r17', JSON.stringify(rows[16].memo), 'focus', await active(page));
  await page.keyboard.type('X');
  console.log('form memo value', await page.inputValue('input[name="memo"]'));
  // 3. reject 列を編集中にフォームを押す(不正値)
  await L.clickCell(page, 17, '金額');
  await page.keyboard.type('999999');
  await page.click('input[name="amount"]');
  await page.waitForTimeout(400);
  rows = await rowsOf(page);
  console.log('reject + click form: editor?', !!(await page.$('.ssg-cell-editor')), 'amount r17', rows[16].amount, 'focus', await active(page));
  // 4. 編集中に「経費を追加」ボタンを押す(フォームの金額は 2500X? )
  await page.fill('input[name="amount"]', '777');
  await L.clickCell(page, 18, '金額');
  await page.keyboard.type('4321');
  await page.click('[data-testid="add-btn"]');
  await page.waitForTimeout(400);
  rows = await rowsOf(page);
  console.log('commit via add button: amount r18', rows[17].amount, 'rows', rows.length, 'last', rows[rows.length - 1].amount, 'focus', await active(page));
  // undo twice → removes add, then reverts edit?
  await page.keyboard.press('Control+z'); // focus is on button: does Ctrl+Z reach grid? (should not)
  await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('Ctrl+Z with focus on button → rows', rows.length, 'r18', rows[17].amount);
  // 5. Enter in form with focus while grid had active cell → grid unaffected
  await L.clickCell(page, 19, '金額');
  const before = (await rowsOf(page))[18].amount;
  await page.click('input[name="memo"]');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);
  console.log('Delete in form → r19 amount unchanged?', before, (await rowsOf(page))[18].amount);
  // global filter input: Ctrl+A / Ctrl+C inside
  await page.click('.ssg-root input[type="search"], .ssg-root input[placeholder="グローバルフィルター"]');
  await page.keyboard.type('交通');
  await page.waitForTimeout(400);
  console.log('global filter → total row', await L.totalRowText(page), 'header', await L.headerTotal(page));
  const exp = await page.evaluate(() => window.__app.grid.getExportData({ includeTotalRow: true }));
  const sum = exp.rows.filter((r, i) => exp.rowKinds?.[i] !== 'total').reduce((s, r) => s + (Number(r[2].value) || 0), 0);
  console.log('visible sum via export', sum, 'kinds', exp.rowKinds?.slice(-2), 'last row', JSON.stringify(exp.rows[exp.rows.length - 1].map((c) => c.text)));
  await L.shot(page, '06-global-filter');
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
