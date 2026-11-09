const { open, shot, sleep } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(1500);
  const h = await page.evaluate(() => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.includes('JAN')); const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.move(h.x, h.y); await sleep(250);
  const mb = await page.evaluate(() => { const h = [...document.querySelectorAll('[role="columnheader"]')].find(e => e.textContent.includes('JAN')); const b = h.querySelector('button').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.click(mb.x, mb.y); await sleep(500);
  const html = await page.evaluate(() => { const m = document.querySelector('[role="menu"]') || document.querySelector('.ssg-menu-panel'); return m ? m.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').slice(0, 4000) : 'none'; });
  console.log(html);
  await browser.close();
})();
