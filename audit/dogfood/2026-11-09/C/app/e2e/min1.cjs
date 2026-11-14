const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 500 }, deviceScaleFactor: 1 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5403' });
  const page = await ctx.newPage();
  const logs = []; page.on('console', (m) => logs.push(m.type() + ' ' + m.text())); page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  await page.goto('http://127.0.0.1:5403/min1.html'); await page.waitForSelector('.ssg-root'); await page.waitForTimeout(400);
  const cell = async (rk, ck) => page.evaluate(([rk, ck]) => { const r = document.querySelector(`.ssg-body-row[data-row-key="${rk}"] [data-ssg-col-key="${ck}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, [rk, ck]);
  const st = () => page.evaluate(() => { const g = window.__g.current; return JSON.stringify({ a: g.getActiveCell(), s: g.getSelection().range, bar: [...document.querySelectorAll('.ssg-root > *')].pop().innerText.replace(/\n/g, ' ') }); });
  // ケース 1: E 列(index 4)を選んでから列を 3 つに
  let p = await cell(1, 'd'); await page.mouse.click(p.x, p.y);
  p = await cell(2, 'e'); await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Shift');
  console.log('5 cols:', await st());
  await page.click('#cols3'); await page.waitForTimeout(300);
  console.log('3 cols:', await st());
  await page.screenshot({ path: '../shots/min1-after-shrink.png' });
  // ケース 2: 列 5 つで、最終列から 3 列分を貼り付け
  await page.click('#cols5'); await page.waitForTimeout(300);
  p = await cell(0, 'e'); await page.mouse.click(p.x, p.y);
  await page.evaluate(() => navigator.clipboard.writeText('x\ty\tz'));
  await page.keyboard.press('Control+v'); await page.waitForTimeout(200);
  console.log('paste at last col:', await st());
  console.log(logs.filter((l) => !/vite|DevTools/.test(l)));
  await browser.close();
})();
