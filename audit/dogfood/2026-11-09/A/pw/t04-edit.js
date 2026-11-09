const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
const active = (page) => page.evaluate(() => document.activeElement ? `${document.activeElement.tagName}.${document.activeElement.className}[name=${document.activeElement.getAttribute('name')}]` : null);
const editorInfo = (page) => page.evaluate(() => { const e = document.querySelector('.ssg-cell-editor'); return e ? { html: e.innerHTML.slice(0, 200), err: document.querySelector('[class*="error"],[class*="invalid-bubble"],.ssg-editor-error')?.textContent } : null; });
(async () => {
  const { browser, page, logs } = await L.open();
  // 1. 金額をダブルクリックで編集 → 1200 → Enter
  await L.clickCell(page, 13, '金額', { dbl: true });
  console.log('editor open', !!(await page.$('.ssg-cell-editor')), await active(page));
  await page.keyboard.press('Control+a');
  await page.keyboard.type('1200');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  let rows = await rowsOf(page);
  console.log('amount r13', rows[12].amount, 'header', await L.headerTotal(page), 'total', await L.totalRowText(page));
  // 2. reject: 600000 → Enter → 拒否・編集継続
  await L.clickCell(page, 14, '金額');
  await page.keyboard.type('600000');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('after reject: editor?', !!(await page.$('.ssg-cell-editor')), 'active', await active(page));
  await L.shot(page, '04a-reject-bubble');
  const bubble = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /50 万円/.test(e.textContent || '')).map((e) => e.className + ':' + e.textContent));
  console.log('bubble', bubble);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  rows = await rowsOf(page);
  console.log('amount r14 after escape', rows[13].amount);
  // 2b. negative → builtin reject (min 0)
  await L.clickCell(page, 14, '金額');
  await page.keyboard.type('-5');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('neg: editor?', !!(await page.$('.ssg-cell-editor')));
  const bubble2 = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /以上で入力/.test(e.textContent || '')).map((e) => e.textContent));
  console.log('bubble2', bubble2);
  await page.keyboard.press('Escape');
  // 2c. decimal 12.5
  await L.clickCell(page, 14, '金額');
  await page.keyboard.type('12.5');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  const bubble3 = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /整数/.test(e.textContent || '')).map((e) => e.textContent));
  console.log('decimal: editor?', !!(await page.$('.ssg-cell-editor')), bubble3);
  // blur (click elsewhere) on reject → cancel
  const other = await L.cellBox(page, 16, '日付');
  await page.mouse.click(other.cx, other.cy);
  await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('after blur reject: editor?', !!(await page.$('.ssg-cell-editor')), 'amount r14', rows[13].amount);

  // 3. mark: 区分を交際費に(16 行目の摘要は空)→ 摘要にマーク
  rows = await rowsOf(page);
  console.log('r16', JSON.stringify(rows[15]));
  await L.clickCell(page, 16, '区分');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const opts = await page.$$eval('.ssg-select-editor-popover [role="option"]', (els) => els.map((e) => e.textContent));
  console.log('select options', opts);
  await L.shot(page, '04b-select-open');
  // type-ahead 交 → 交通費 / 交際費
  await page.keyboard.type('交際');
  await page.waitForTimeout(100);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('r16 category', rows[15].category);
  const memoCls = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('[role="gridcell"][aria-invalid], .ssg-body-cell--invalid')];
    return cells.length;
  });
  console.log('invalid cells in DOM', memoCls);
  const inv = await page.evaluate(() => window.__app.grid.getInvalidCells().filter((c) => c.rowKey === 'seed-16'));
  console.log('invalid r16', JSON.stringify(inv));
  // hover memo cell to see tooltip
  const memo16 = await L.cellBox(page, 16, '摘要');
  await page.mouse.move(memo16.cx, memo16.cy);
  await page.waitForTimeout(800);
  console.log('tooltip', await page.evaluate(() => document.querySelector('.ssg-tooltip')?.textContent));
  await L.shot(page, '04c-mark-tooltip');

  // 4. 複数行の摘要: F2 → Alt+Enter で改行 → Enter で確定
  await L.clickCell(page, 16, '摘要');
  await page.keyboard.press('F2');
  await page.waitForTimeout(150);
  await page.keyboard.type('B社 佐藤様');
  await page.keyboard.press('Alt+Enter');
  await page.keyboard.type('計3名');
  await L.shot(page, '04d-multiline-editing');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('memo r16', JSON.stringify(rows[15].memo), 'active', await page.evaluate(() => window.__app.grid.getActiveCell()));
  await L.shot(page, '04e-multiline-done');

  // 5. 提出済みの行は編集できない
  await L.clickCell(page, 2, '金額', { dbl: true });
  console.log('submitted dbl → editor?', !!(await page.$('.ssg-cell-editor')));
  await page.keyboard.type('9');
  await page.waitForTimeout(150);
  console.log('submitted type → editor?', !!(await page.$('.ssg-cell-editor')));
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  rows = await rowsOf(page);
  console.log('submitted r2 amount', rows[1].amount);
  // checkbox in submitted row
  await L.clickCell(page, 2, '領収書');
  rows = await rowsOf(page);
  console.log('submitted r2 receipt', rows[1].receipt);
  // checkbox in draft row
  await L.clickCell(page, 15, '領収書');
  await page.waitForTimeout(200);
  rows = await rowsOf(page);
  console.log('draft r15 receipt', rows[14].receipt);
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  rows = await rowsOf(page);
  console.log('draft r15 receipt after space', rows[14].receipt);

  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
