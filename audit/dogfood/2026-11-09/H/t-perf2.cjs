const { chromium } = require('playwright');
const G = '[aria-label="タスク一覧"]';
(async () => {
  const browser = await chromium.launch();
  for (const q of ['', '?nogroup', '?nogroup&nocf', '?noanim', '']) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto('http://localhost:5408/' + q); await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.waitForSelector('[role="grid"]'); await page.waitForTimeout(1500);
    const r = await page.evaluate(async (G) => {
      const el = document.querySelector(G);
      const frames = [];
      let last = performance.now();
      for (let i = 0; i < 60; i++) {
        el.scrollTop += 300;
        await new Promise(r => requestAnimationFrame(r));
        const now = performance.now(); frames.push(now - last); last = now;
      }
      frames.sort((a, b) => a - b);
      return { median: Math.round(frames[30]), p90: Math.round(frames[54]), max: Math.round(frames[59]) };
    }, G);
    // edit timing
    const c = page.locator(`${G} [data-pane="center"][data-row-key] [data-ssg-col-key="estimate"]`).first();
    await c.click();
    const t = await page.evaluate(async () => { return 0; });
    const t0 = Date.now();
    await page.keyboard.type('12'); await page.keyboard.press('Enter');
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const editMs = Date.now() - t0;
    console.log(q || '(default)', 'scroll frame ms', JSON.stringify(r), 'edit', editMs + 'ms');
    await ctx.close();
  }
  await browser.close();
})();
