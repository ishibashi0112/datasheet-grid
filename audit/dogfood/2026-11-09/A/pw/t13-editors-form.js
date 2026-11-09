const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}[${a.getAttribute('name') || ''}].${(a.className || '').toString().split(' ')[0]}` : null; });
(async () => {
  const { browser, page, logs } = await L.open();
  // date editor: F2, change via keyboard, click form
  await L.clickCell(page, 14, '日付');
  await page.keyboard.press('F2'); await page.waitForTimeout(200);
  console.log('date editor value', await page.evaluate(() => document.querySelector('.ssg-cell-editor input')?.value));
  await page.keyboard.press('ArrowUp'); // month +1? (segment focused first)
  await page.waitForTimeout(100);
  console.log('date editor after ArrowUp', await page.evaluate(() => document.querySelector('.ssg-cell-editor input')?.value));
  await page.click('input[name="amount"]'); await page.waitForTimeout(300);
  let rows = await rowsOf(page);
  console.log('date commit by form click', rows[13].date, 'editor?', !!(await page.$('.ssg-cell-editor')), 'focus', await active(page));
  // select editor open, click form → cancel
  await L.clickCell(page, 14, '税区分');
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
  await page.click('input[name="memo"]'); await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('select + form click', rows[13].taxType, 'editor?', !!(await page.$('.ssg-cell-editor')), 'popover?', !!(await page.$('.ssg-select-editor-popover')), 'focus', await active(page));
  // multiline memo editing, click the add button (form submit) while editing
  await page.fill('input[name="amount"]', '');
  await L.clickCell(page, 14, '摘要');
  await page.keyboard.press('F2');
  await page.keyboard.press('End');
  await page.keyboard.type(' +追記');
  await page.click('[data-testid="add-btn"]'); await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('memo commit by add button', JSON.stringify(rows[13].memo), 'msg', await page.textContent('[data-testid="message"]'), 'focus', await active(page));
  // edit, then click global filter input
  await L.clickCell(page, 15, '金額'); await page.keyboard.type('1234');
  await page.click('input[placeholder="グローバルフィルター"]'); await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('commit by global filter click', rows[14].amount, 'focus', await active(page));
  // edit, then click the dark toggle (button) → commit; focus?
  await L.clickCell(page, 15, '金額'); await page.keyboard.type('4321');
  await page.click('[data-testid="dark-toggle"]'); await page.waitForTimeout(400);
  rows = await rowsOf(page);
  console.log('commit by dark toggle', rows[14].amount, 'focus', await active(page), 'html.dark', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  // edit, then click on page background (non focusable)
  await L.clickCell(page, 15, '金額'); await page.keyboard.type('55');
  await page.mouse.click(700, 30); await page.waitForTimeout(400);
  rows = await rowsOf(page);
  console.log('commit by bg click', rows[14].amount, 'focus', await active(page));
  // undo state buttons
  console.log('undo btn enabled', await page.isEnabled('[data-testid="undo-btn"]'), 'redo', await page.isEnabled('[data-testid="redo-btn"]'));
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
