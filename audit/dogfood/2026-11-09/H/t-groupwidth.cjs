const { open, G } = require('./lib.cjs');
const log = (...a) => console.log(...a);
(async () => {
  const { browser, page, logs } = await open();
  const th = page.locator(`${G} [role="columnheader"][data-ssg-col-key="__ssg_group__"]`);
  const hb = await th.boundingBox();
  await page.mouse.move(hb.x + hb.width - 2, hb.y + hb.height / 2); await page.mouse.down();
  await page.mouse.move(hb.x + hb.width - 90, hb.y + hb.height / 2, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(400);
  log('width', Math.round((await th.boundingBox()).width), 'state', await page.evaluate(() => localStorage.getItem('wbs-grid-state')));
  await page.reload(); await page.waitForSelector('[role="grid"]'); await page.waitForTimeout(800);
  log('after reload width', Math.round((await page.locator(`${G} [role="columnheader"][data-ssg-col-key="__ssg_group__"]`).boundingBox()).width));
  log(logs.filter(l => !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
