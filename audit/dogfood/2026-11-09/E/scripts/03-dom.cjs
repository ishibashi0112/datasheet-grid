const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  await reveal(page, 10, 16);
  const html = await page.evaluate(() => [...document.querySelectorAll('[role="row"][aria-rowindex="10"] [aria-colindex="16"]')].map(e => e.outerHTML));
  console.log(html);
  const b = await cellBox(page, 10, 16);
  await page.mouse.click(b.x, b.y);
  await page.keyboard.press('Space');
  await sleep(200);
  console.log(await page.evaluate(() => [...document.querySelectorAll('[role="row"][aria-rowindex="10"] [aria-colindex="16"]')].map(e => e.outerHTML)));
  // maker select DOM
  await reveal(page, 6, 7);
  const m = await cellBox(page, 6, 7);
  await page.mouse.dblclick(m.x, m.y);
  await sleep(300);
  console.log(await page.evaluate(() => { const lb = document.querySelector('[role="listbox"]'); return lb.parentElement.outerHTML.slice(0, 800) + '\nACTIVE=' + document.activeElement.outerHTML.slice(0, 300); }));
  await browser.close();
})();
