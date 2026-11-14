const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
const SUP = 8;
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  const state = () => page.evaluate(() => {
    const ed = document.querySelector('.ssg-cell-editor');
    const r = ed?.getBoundingClientRect();
    return {
      editor: ed ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
      dropdown: !!document.querySelector('.mantine-Combobox-dropdown'),
      active: document.activeElement?.tagName + '.' + (document.activeElement?.className || '').toString().slice(0, 40),
      activeCell: document.querySelector('[id$="-active-cell"]')?.closest('[role="row"]')?.getAttribute('aria-rowindex') + ':' + document.querySelector('[id$="-active-cell"]')?.getAttribute('aria-colindex'),
      bottom: document.querySelector('.ssg-bottom-bar')?.textContent,
    };
  });
  await reveal(page, 6, SUP);
  let b = await cellBox(page, 6, SUP);
  await page.mouse.dblclick(b.x, b.y);
  await sleep(400);
  console.log('open', await state());
  const b2 = await cellBox(page, 10, 5);
  await page.mouse.click(b2.x, b2.y);
  await sleep(400);
  console.log('after click other cell', await state());
  await shot(page, '05-after-click-other');
  await page.keyboard.press('ArrowDown');
  await sleep(200);
  console.log('after ArrowDown', await state());
  await page.keyboard.type('x');
  await sleep(300);
  console.log('after type x', await state());
  await shot(page, '05-after-type');
  await page.keyboard.press('Escape');
  await sleep(300);
  console.log('after Esc', await state());
  // grid scroll while custom editor open
  await reveal(page, 8, SUP);
  b = await cellBox(page, 8, SUP);
  await page.mouse.dblclick(b.x, b.y);
  await sleep(400);
  console.log('open2', await state());
  await page.mouse.move(400, 500);
  await page.mouse.wheel(0, 300);
  await sleep(500);
  console.log('after grid wheel', await state());
  await shot(page, '05-after-grid-wheel');
  // built-in text editor + grid wheel for comparison
  await page.keyboard.press('Escape'); await sleep(200);
  console.log(await state());
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
