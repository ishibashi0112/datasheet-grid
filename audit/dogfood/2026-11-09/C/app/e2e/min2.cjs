const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 700, height: 500 }, deviceScaleFactor: 1 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5403' });
  const page = await ctx.newPage();
  const logs = []; page.on('console', (m) => logs.push(m.type() + ' ' + m.text())); page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  await page.goto(process.env.URL || 'http://127.0.0.1:5403/min2.html'); await page.waitForSelector('.ssg-root'); await page.waitForTimeout(400);
  const cell = async (rk, ck) => page.evaluate(([rk, ck]) => { const r = document.querySelector(`.ssg-body-row[data-row-key="${rk}"] [data-ssg-col-key="${ck}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, [rk, ck]);
  const head = async (ck) => page.evaluate((ck) => { const r = document.querySelector(`[role="columnheader"][data-ssg-col-key="${ck}"]`).getBoundingClientRect(); return { x: r.x + 15, y: r.y + r.height / 2 }; }, ck);
  const st = () => page.evaluate(() => { const g = window.__g.current; return JSON.stringify({ a: g.getActiveCell(), s: g.getSelection() }); });
  // 5 行目のセルを押してから、A 列の見出し → コピー → B 列の見出し → 貼り付け
  let p = await cell(4, 'c'); await page.mouse.click(p.x, p.y);
  p = await head('a'); await page.mouse.click(p.x, p.y); await page.waitForTimeout(100);
  console.log('after header A click:', await st());
  await page.keyboard.press('Control+c'); await page.waitForTimeout(100);
  console.log('clipboard:', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText())));
  p = await head('b'); await page.mouse.click(p.x, p.y); await page.waitForTimeout(100);
  console.log('after header B click:', await st());
  await page.keyboard.press('Control+v'); await page.waitForTimeout(200);
  console.log('after paste:', await st());
  console.log('column b now:', JSON.stringify(await page.evaluate(() => window.__rows.map((r) => r.b))));
  await page.screenshot({ path: '../shots/min2-after-paste.png' });
  console.log(logs.filter((l) => !/vite|DevTools/.test(l)));
  await browser.close();
})();
