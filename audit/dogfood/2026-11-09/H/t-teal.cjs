const { chromium } = require('playwright');
const G = '[aria-label="タスク一覧"]';
(async () => {
  const browser = await chromium.launch();
  for (const q of ['', '?teal']) {
    const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
    await page.goto('http://localhost:5408/' + q); await page.waitForSelector('[role="grid"]'); await page.waitForTimeout(800);
    const r = await page.locator(G).evaluate(e => { const s = getComputedStyle(e.closest('.ssg-root')); return { accent: s.getPropertyValue('--ssg-accent'), radius: s.getPropertyValue('--ssg-radius') || s.borderRadius }; });
    await page.locator(`${G} [data-row-key="T-00118"] [data-ssg-col-key="estimate"]`).first().click();
    await page.keyboard.press('Shift+ArrowDown');
    await page.screenshot({ path: `shots/teal${q ? '-on' : '-off'}.png`, clip: { x: 0, y: 0, width: 1600, height: 400 } });
    console.log(q || '(default)', JSON.stringify(r));
  }
  await browser.close();
})();
