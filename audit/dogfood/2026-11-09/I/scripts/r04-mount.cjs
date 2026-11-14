const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const logs = []; p.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`)); p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  await p.goto('http://localhost:5409/repro/mount.html');
  await p.waitForSelector('.ssg-ask-input');
  const ask = async (t) => { await p.click('.ssg-ask-input'); await p.keyboard.press('Control+A'); await p.keyboard.type(t); await p.keyboard.press('Enter'); };
  const bar = () => p.evaluate(() => document.querySelector('.ssg-ask')?.innerText.replace(/\n/g, ' / '));
  // 1. グリッドが無いまま聞く
  await ask('100 以上');
  await p.waitForTimeout(1800);
  console.log('1 no grid:', await bar(), 'answers', await p.evaluate(() => window.__answers));
  // 2. グリッドを出して聞き、聞いている間にグリッドを外す
  await p.click('#grid'); await p.waitForSelector('.ssg-body-cell');
  await ask('100 以上 2');
  await p.waitForTimeout(300);
  await p.click('#grid');
  await p.waitForTimeout(1600);
  console.log('2 grid removed during ask:', await bar());
  // 3. グリッドを戻して聞き、聞いている間にバーを外す
  await p.click('#grid'); await p.waitForSelector('.ssg-body-cell');
  await ask('100 以上 3');
  await p.waitForTimeout(300);
  await p.click('#bar');
  await p.waitForTimeout(1600);
  console.log('3 bar removed during ask: aborts', await p.evaluate(() => window.__aborts), 'answers', await p.evaluate(() => window.__answers), 'rows', await p.evaluate(() => document.querySelector('.ssg-root').innerText.match(/行 \d+ \/ \d+/)?.[0]));
  console.log(logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await b.close();
})();
