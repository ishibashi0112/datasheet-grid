const { open, shot, center, cellHandle } = require('./lib.cjs');
const run = process.argv[2] ?? '1';
const mode = process.argv[3] ?? 'replace';
const base = process.argv[4] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=${mode}&run=${run}`);
  const p = await center(page, await cellHandle(page, 3, 'name'));
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(200);
  const t0 = Date.now();
  await page.keyboard.type('Iron Union');
  const snap = () => page.evaluate(() => `bar="${document.querySelector('.ssg-find-bar')?.innerText.replace(/\s+/g, ' ')}" label="${document.querySelector('.find-label')?.textContent}" act=${JSON.stringify(window.__app.grid().getActiveCell())} cur=${document.querySelector('.ssg-find-mark--current')?.closest('[role=row]')?.getAttribute('data-row-key')} marks=${document.querySelectorAll('.ssg-find-mark').length}`);
  for (let i = 0; i < 10; i++) { await page.waitForTimeout(300); console.log(`${Date.now() - t0}ms`, await snap()); }
  await page.keyboard.press('Control+a');
  await page.keyboard.type('.5');
  const t1 = Date.now();
  for (let i = 0; i < 10; i++) { await page.waitForTimeout(300); console.log(`.5 ${Date.now() - t1}ms`, await snap()); }
  console.log('LOGS', logs);
  await browser.close();
})();
