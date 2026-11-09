const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  const st = () => page.evaluate(() => {
    const a = document.querySelector('[id$="-active-cell"]');
    const bar = document.querySelector('.ssg-find-bar');
    return { active: a?.closest('[role="row"]')?.getAttribute('aria-rowindex') + ':' + a?.getAttribute('aria-colindex') + ' ' + a?.textContent, bar: bar?.textContent, marks: document.querySelectorAll('.ssg-find-mark').length, current: document.querySelector('.ssg-find-mark--current')?.textContent, focus: document.activeElement?.tagName + '.' + document.activeElement?.className };
  });
  const c = await cellBox(page, 3, 5);
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('Control+f');
  await sleep(300);
  console.log('open', await st());
  await page.keyboard.insertText('鈴木');
  await sleep(1200);
  console.log('query 鈴木', await st());
  await shot(page, '10-find-suzuki');
  await page.keyboard.press('Enter'); await sleep(300);
  console.log('Enter', await st());
  await page.keyboard.press('Shift+Enter'); await sleep(300);
  console.log('Shift+Enter', await st());
  // 状態(renderCell の Badge)の表示名で探す
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('販売停止');
  await sleep(1200);
  console.log('query 販売停止', await st());
  await page.keyboard.press('Enter'); await sleep(400);
  console.log('Enter', await st());
  await shot(page, '10-find-status');
  // 仕入先(custom エディタ + valueFormatter)
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('広島南卸 45');
  await sleep(1200);
  console.log('query 広島南卸 45', await st());
  // ラベル行の文字(C02 菓子)は対象?
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('菓子');
  await sleep(1200);
  console.log('query 菓子 (label)', await st());
  // 数値の表示(3 桁区切り)
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('4,480');
  await sleep(1200);
  console.log('query 4,480', await st());
  await page.keyboard.press('Escape'); await sleep(300);
  console.log('Esc', await st());
  // ボタンから openFind
  await page.click('[data-testid="open-find"]');
  await sleep(300);
  console.log('button openFind', await st());
  await page.keyboard.press('Escape'); await sleep(300);
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
