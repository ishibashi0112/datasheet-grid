const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}${a.hasAttribute('data-ssg-ime-input') ? '[ime]' : ''}.${(a.className || '').toString().slice(0, 40)}` : null; });
async function compose(cdp, page, steps, final) {
  for (const s of steps) {
    await cdp.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length });
    await page.waitForTimeout(60);
  }
  await cdp.send('Input.insertText', { text: final });
  await page.waitForTimeout(150);
}
(async () => {
  const { browser, page, logs } = await L.open();
  const cdp = await page.context().newCDPSession(page);
  // 摘要(text multiline)
  await L.clickCell(page, 17, '摘要');
  console.log('focus after click', await active(page));
  await cdp.send('Input.imeSetComposition', { text: 'たくしー', selectionStart: 4, selectionEnd: 4 });
  await page.waitForTimeout(150);
  await L.shot(page, '07a-ime-composing');
  const preview = await page.evaluate(() => document.querySelector('[data-ssg-ime-input]')?.value);
  console.log('composing value', preview);
  await cdp.send('Input.imeSetComposition', { text: 'タクシー', selectionStart: 4, selectionEnd: 4 });
  await page.waitForTimeout(80);
  await cdp.send('Input.insertText', { text: 'タクシー' });
  await page.waitForTimeout(250);
  console.log('after commit: editor?', !!(await page.$('.ssg-cell-editor')), 'focus', await active(page), 'editor value', await page.evaluate(() => document.querySelector('.ssg-cell-editor textarea, .ssg-cell-editor input')?.value));
  await L.shot(page, '07b-ime-committed');
  await compose(cdp, page, ['だい'], '代');
  console.log('editor value after 2nd', await page.evaluate(() => document.querySelector('.ssg-cell-editor textarea, .ssg-cell-editor input')?.value));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  let rows = await rowsOf(page);
  console.log('memo r17', JSON.stringify(rows[16].memo), 'focus', await active(page), 'active', JSON.stringify(await page.evaluate(() => window.__app.grid.getActiveCell())));

  // 金額(number): 全角 １２００ → 1200
  await L.clickCell(page, 18, '金額');
  await compose(cdp, page, ['１', '１２', '１２０', '１２００'], '１２００');
  console.log('number editor value', await page.evaluate(() => document.querySelector('.ssg-cell-editor input')?.value), 'type', await page.evaluate(() => document.querySelector('.ssg-cell-editor input')?.type));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('amount r18', rows[17].amount);
  // 金額: 「１，２００」
  await L.clickCell(page, 19, '金額');
  await compose(cdp, page, ['１，２００'], '１，２００');
  console.log('number editor value 2', await page.evaluate(() => document.querySelector('.ssg-cell-editor input')?.value));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('amount r19', rows[18].amount);
  // 金額: かな → 捨てる
  await L.clickCell(page, 20, '金額');
  const before20 = (await rowsOf(page))[19].amount;
  await compose(cdp, page, ['あ'], 'あ');
  console.log('kana in number: editor?', !!(await page.$('.ssg-cell-editor')), 'r20', before20, (await rowsOf(page))[19].amount);
  // 区分(select): 捨てる
  await L.clickCell(page, 20, '区分');
  await compose(cdp, page, ['こうつう'], '交通');
  console.log('ime in select: editor?', !!(await page.$('.ssg-cell-editor')), (await rowsOf(page))[19].category);
  // 提出済み行: 捨てる
  await L.clickCell(page, 3, '摘要');
  const before3 = (await rowsOf(page))[2].memo;
  await compose(cdp, page, ['てすと'], 'テスト');
  console.log('ime in readonly: editor?', !!(await page.$('.ssg-cell-editor')), JSON.stringify(before3), JSON.stringify((await rowsOf(page))[2].memo));
  // ASCII 直打ち
  await L.clickCell(page, 21, '摘要');
  await page.keyboard.type('hello');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  console.log('ascii r21 memo', JSON.stringify((await rowsOf(page))[20].memo));
  // Ctrl+Z works with IME receiver focused
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  console.log('after undo r21 memo', JSON.stringify((await rowsOf(page))[20].memo), 'focus', await active(page));
  // Escape during composition
  await L.clickCell(page, 22, '摘要');
  await cdp.send('Input.imeSetComposition', { text: 'あいう', selectionStart: 3, selectionEnd: 3 });
  await page.waitForTimeout(100);
  await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
  await page.waitForTimeout(150);
  console.log('cancel composition: editor?', !!(await page.$('.ssg-cell-editor')));
  // composing then click another cell
  await cdp.send('Input.imeSetComposition', { text: 'かきく', selectionStart: 3, selectionEnd: 3 });
  await page.waitForTimeout(100);
  await L.clickCell(page, 23, '摘要');
  await page.waitForTimeout(200);
  console.log('composition + click other: editor?', !!(await page.$('.ssg-cell-editor')), 'r22', JSON.stringify((await rowsOf(page))[21].memo), 'r23', JSON.stringify((await rowsOf(page))[22].memo));
  // Form input then IME there
  await page.click('input[name="memo"]');
  await compose(cdp, page, ['かいぎ'], '会議');
  console.log('form memo after IME', await page.inputValue('input[name="memo"]'), 'grid editor?', !!(await page.$('.ssg-cell-editor')));
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
