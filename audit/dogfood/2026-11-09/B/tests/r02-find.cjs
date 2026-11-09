const { chromium } = require('playwright');
const live = process.argv[2] ?? '1';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if (['warning', 'error'].includes(m.type())) logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push(e.message));
  await page.goto(`http://127.0.0.1:5402/repro-find.html?live=${live}`);
  await page.waitForSelector('.ssg-body-cell');
  const cell = page.locator('.ssg-body-cell[data-ssg-col-key="name"]').first();
  const b = await cell.boundingBox();
  await page.mouse.click(b.x + 10, b.y + b.height / 2);
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(200);
  await page.keyboard.type('target');
  let searching = 0, n = 0, lastBar = '';
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    await page.waitForTimeout(50);
    lastBar = await page.evaluate(() => document.querySelector('.ssg-find-bar')?.innerText.replace(/\s+/g, ' '));
    n++; if (lastBar.includes('検索中')) searching++;
  }
  const active = await page.evaluate(() => document.querySelector('.ssg-bar--bottom')?.innerText.replace(/\s+/g, ' '));
  const cur = await page.evaluate(() => document.querySelector('.ssg-find-mark--current')?.closest('[role=gridcell]')?.textContent);
  console.log(`live=${live}: "検索中…" shown in ${searching}/${n} samples; bar now "${lastBar}"; current hit cell "${cur}"; bottom bar: ${active}`);
  await page.screenshot({ path: `out/r02-find-live${live}.png` });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('after Enter:', await page.evaluate(() => `${document.querySelector('.ssg-find-bar')?.innerText.replace(/\s+/g, ' ')} | ${document.querySelector('.ssg-bar--bottom')?.innerText.replace(/\s+/g, ' ')}`));
  console.log('LOGS', logs);
  await browser.close();
})();
