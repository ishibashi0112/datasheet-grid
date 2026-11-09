const { open, shot, sleep, cellBox } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open((process.argv[2] || 'http://127.0.0.1:5405') + '/repro/custom-outside.html');
  await page.waitForSelector('.ssg-root');
  await sleep(600);
  const st = () => page.evaluate(() => ({
    editor: !!document.querySelector('.ssg-cell-editor'),
    focus: document.activeElement?.tagName + '.' + document.activeElement?.className,
    active: document.querySelector('[id$="-active-cell"]')?.closest('[role="row"]')?.getAttribute('aria-rowindex') + ':' + document.querySelector('[id$="-active-cell"]')?.getAttribute('aria-colindex'),
    bar: document.querySelector('.ssg-bottom-bar')?.textContent,
  }));
  const c = await cellBox(page, 3, 3);
  await page.mouse.dblclick(c.x, c.y);
  await sleep(300);
  console.log('1 editing color row2:', await st());
  const o = await cellBox(page, 6, 2);
  await page.mouse.click(o.x, o.y);
  await sleep(300);
  console.log('2 clicked name row5:', await st());
  await page.keyboard.press('ArrowDown'); await sleep(200);
  console.log('3 ArrowDown:', await st());
  await page.keyboard.type('abc'); await sleep(200);
  console.log('4 typed abc:', await st());
  await page.keyboard.press('Escape'); await sleep(200);
  console.log('5 Escape:', await st());
  await shot(page, 'r1-custom-outside');
  const o2 = await cellBox(page, 8, 2);
  await page.mouse.dblclick(o2.x, o2.y);
  await sleep(300);
  console.log('6 dblclick name row7:', await st());
  console.log(logs.filter(l => !l.includes('vite') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
