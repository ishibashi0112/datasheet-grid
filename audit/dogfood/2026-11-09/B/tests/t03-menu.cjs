const { open, shot, center, cellHandle, scanJapanese } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open('http://127.0.0.1:5402/?run=0');
  const c = await cellHandle(page, 3, 'changePct');
  const p = await center(page, c);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForTimeout(400);
  await shot(page, '03-colmenu');
  const menu = await page.evaluate(() => {
    const m = document.querySelector('.ssg-menu-panel');
    return m ? m.innerText : null;
  });
  console.log(menu);
  console.log((await scanJapanese(page, 'colmenu')).join('\n'));
  console.log('LOGS', logs);
  await browser.close();
})();
