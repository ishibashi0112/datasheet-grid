const { open, shot, sleep, cellBox } = require('./lib.cjs');
const R = '[data-testid="modal-grid-wrap"]';
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  const n = () => page.evaluate(() => ({ wraps: document.querySelectorAll('[data-testid="modal-grid-wrap"]').length, roots: document.querySelectorAll('.ssg-root').length, modalContent: document.querySelectorAll('.mantine-Modal-content').length }));
  for (let i = 0; i < 3; i++) {
    await page.click('[data-testid="open-modal"]');
    await sleep(800);
    console.log('opened', i, await n());
    const c = await cellBox(page, 4, 5, R);
    await page.mouse.click(c.x, c.y); await sleep(200);
    await page.keyboard.press('Escape');
    await sleep(800);
    console.log('after esc', i, await n());
  }
  await browser.close();
})();
