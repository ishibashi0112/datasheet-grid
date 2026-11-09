const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 700, height: 400 }, deviceScaleFactor: 1 });
  const logs = []; p.on('console', (m) => logs.push(m.text())); p.on('pageerror', (e) => logs.push(e.message));
  await p.goto('http://localhost:5409/repro/group-label.html');
  await p.waitForSelector('.ssg-body-cell');
  await p.waitForTimeout(500);
  console.log(await p.$$eval('.ssg-body-row[data-pane="center"]', (rs) => rs.map((r) => r.innerText.replace(/\n/g, ' | '))));
  const gf = p.locator('.ssg-root input').first();
  await gf.fill('入金済'); await p.waitForTimeout(400);
  console.log('global 入金済:', await p.evaluate(() => document.querySelector('.ssg-root').innerText.match(/行 \d+ \/ \d+/)?.[0]));
  await gf.fill('paid'); await p.waitForTimeout(400);
  console.log('global paid:', await p.evaluate(() => document.querySelector('.ssg-root').innerText.match(/行 \d+ \/ \d+/)?.[0]));
  await gf.fill(''); await p.waitForTimeout(300);
  await p.screenshot({ path: 'shots/r01-group-label.png' });
  console.log(logs.filter((l) => !/vite|DevTools/.test(l)));
  await b.close();
})();
