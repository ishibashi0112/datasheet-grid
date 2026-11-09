const { open, shot, center, cellHandle } = require('./lib.cjs');
const run = process.argv[2] ?? '1';
const base = process.argv[3] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=replace&run=${run}`);
  const p = await center(page, await cellHandle(page, 3, 'name'));
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(200);
  await page.keyboard.type('Granite');
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(async () => {
    let searching = 0, n = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 3000) {
      await new Promise((r) => setTimeout(r, 30));
      n++;
      if (document.querySelector('.ssg-find-bar')?.innerText.includes('Searching')) searching++;
    }
    return { searching, n, act: window.__app.grid().getActiveCell() };
  });
  console.log(`run=${run} searching ${stats.searching}/${stats.n} samples, active=${JSON.stringify(stats.act)}`);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    console.log('Enter ->', await page.evaluate(() => `${document.querySelector('.find-label').textContent} act=${JSON.stringify(window.__app.grid().getActiveCell())} cur=${document.querySelector('.ssg-find-mark--current')?.closest('[role=row]')?.getAttribute('data-row-key')}`));
  }
  await shot(page, `18-find-${run}`);
  console.log('LOGS', logs);
  await browser.close();
})();
