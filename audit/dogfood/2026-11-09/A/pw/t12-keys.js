const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
const active = (page) => page.evaluate(() => { const a = document.activeElement; if (!a) return null; const t = a.getAttribute('data-testid') || a.getAttribute('name') || a.getAttribute('placeholder') || a.getAttribute('aria-label') || ''; return `${a.tagName}[${t}]${a.hasAttribute('data-ssg-ime-input') ? '(ime)' : ''}.${(a.className || '').toString().split(' ')[0]}`; });
(async () => {
  const { browser, page, logs } = await L.open();
  // 1. グリッドで編集 → フォームで Ctrl+Z
  await L.clickCell(page, 13, '金額'); await page.keyboard.type('777'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  console.log('r13 amount', (await rowsOf(page))[12].amount);
  await page.click('input[name="memo"]');
  await page.keyboard.type('abc');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  console.log('Ctrl+Z in form: input', JSON.stringify(await page.inputValue('input[name="memo"]')), 'r13 amount', (await rowsOf(page))[12].amount);
  // 2. Tab order: from memo input → add button → undo → ... → grid
  const seq = [];
  for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(60); seq.push(await active(page)); }
  console.log('tab sequence\n  ' + seq.join('\n  '));
  console.log('grid active cell', JSON.stringify(await page.evaluate(() => window.__app.grid.getActiveCell())));
  // 3. In grid: arrow keys / Ctrl+End / Home
  await L.clickCell(page, 13, '日付');
  await page.keyboard.press('Control+End'); await page.waitForTimeout(200);
  console.log('Ctrl+End', JSON.stringify(await page.evaluate(() => window.__app.grid.getActiveCell())));
  await L.shot(page, '12a-ctrl-end');
  await page.keyboard.press('Control+Home'); await page.waitForTimeout(200);
  console.log('Ctrl+Home', JSON.stringify(await page.evaluate(() => window.__app.grid.getActiveCell())));
  await page.keyboard.press('PageDown'); await page.waitForTimeout(200);
  console.log('PageDown', JSON.stringify(await page.evaluate(() => window.__app.grid.getActiveCell())));
  // 4. Enter on submitted row (readonly) → no edit, move?
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  console.log('Enter on readonly: editor?', !!(await page.$('.ssg-cell-editor')), JSON.stringify(await page.evaluate(() => window.__app.grid.getActiveCell())));
  // 5. Tab out of grid from the last column
  await L.clickCell(page, 14, '状態');
  await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  console.log('Tab from last col →', await active(page));
  await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(150);
  console.log('Shift+Tab back →', await active(page), JSON.stringify(await page.evaluate(() => window.__app.grid.getActiveCell())));
  // 6. Enter on the add button while grid cell active → form submit
  // 7. Ctrl+A in grid and delete → readonly skipped
  await L.clickCell(page, 14, '摘要');
  await page.keyboard.press('Control+a'); await page.waitForTimeout(150);
  console.log('Ctrl+A bottom', await page.evaluate(() => document.querySelector('.ssg-root').innerText.split('\n').slice(-6).join(' | ')));
  await L.shot(page, '12b-select-all');
  await page.keyboard.press('Control+c'); await page.waitForTimeout(150);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  console.log('Ctrl+A copy lines', clip.split('\n').length, 'first', JSON.stringify(clip.split('\n')[0]));
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
