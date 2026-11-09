const { open, sleep, shot } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-body-row'); await sleep(1500);
  const h = await page.evaluate(() => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.replace(/[⋮↑↓]/g, '').trim() === '売価'); const b = h.getBoundingClientRect(); return { x: b.x + 20, y: b.y + b.height / 2 }; });
  console.log(h);
  await page.keyboard.down('Shift'); await page.mouse.click(h.x, h.y); await page.keyboard.up('Shift'); await sleep(800);
  console.log(await page.evaluate(() => [...document.querySelectorAll('.ssg-root *')].filter(e => e.childElementCount === 0 && /並び替え|範囲|列/.test(e.textContent)).map(e => e.textContent).slice(0, 8)));
  await shot(page, '30b-sort');
  await browser.close();
})();
