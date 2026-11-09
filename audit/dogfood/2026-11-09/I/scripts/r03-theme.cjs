const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [q, scheme, cls] of [['?theme=auto', 'dark', null], ['?theme=class', 'light', 'dark'], ['?theme=class', 'light', null]]) {
    const ctx = await b.newContext({ colorScheme: scheme, viewport: { width: 700, height: 300 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto('http://localhost:5409/repro/theme.html' + q);
    if (cls) await p.evaluate((c) => document.documentElement.classList.add(c), cls);
    await p.waitForSelector('.ssg-body-cell');
    await p.click('.ssg-ask-example');
    await p.waitForTimeout(500);
    const colors = await p.evaluate(() => ({
      ask: getComputedStyle(document.querySelector('.ssg-ask-input')).backgroundColor,
      askText: getComputedStyle(document.querySelector('.ssg-ask-input')).color,
      chip: getComputedStyle(document.querySelector('.ssg-ask-chip')).backgroundColor,
      grid: getComputedStyle(document.querySelector('.ssg-body-cell')).backgroundColor,
    }));
    console.log(q, scheme, cls, JSON.stringify(colors));
    await p.screenshot({ path: `shots/r03-theme-${q.slice(7)}-${scheme}-${cls}.png` });
    await ctx.close();
  }
  await b.close();
})();
