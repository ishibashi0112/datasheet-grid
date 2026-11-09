const { open, G, openColumnMenu, clickMenu } = require('./lib.cjs');
const log = (...a) => console.log(...a);
(async () => {
  const { browser, page, logs } = await open();
  await openColumnMenu(page, 'progress');
  await page.locator('.ssg-menu-item', { hasText: '列の固定' }).first().hover();
  await page.waitForTimeout(400);
  await page.locator('.ssg-menu-item', { hasText: '右に固定' }).click();
  await page.waitForTimeout(600);
  const m = async () => page.evaluate(() => {
    const g = document.querySelector('[aria-label="タスク一覧"]');
    const gr = g.getBoundingClientRect();
    const h = g.querySelector('[role="columnheader"][data-ssg-col-key="progress"]').getBoundingClientRect();
    const n = g.querySelector('[role="columnheader"][data-ssg-col-key="note"]')?.getBoundingClientRect();
    return { gridRight: gr.right, clientW: g.clientWidth, scrollW: g.scrollWidth, progressX: [h.left, h.right], noteX: n && [n.left, n.right] };
  });
  log('wide content', JSON.stringify(await m()));
  await page.screenshot({ path: 'shots/c-rightpin-wide.png' });
  // hide some columns to make content narrower
  for (const k of ['note', 'wbs', 'phase']) {
    await openColumnMenu(page, k === 'note' ? 'title' : 'title');
    break;
  }
  await page.keyboard.press('Escape');
  await page.evaluate(() => {});
  // Use viewport widening instead
  await page.setViewportSize({ width: 2000, height: 900 });
  await page.waitForTimeout(600);
  log('viewport 2000', JSON.stringify(await m()));
  await page.screenshot({ path: 'shots/c-rightpin-narrow.png' });
  log(logs.join('\n'));
  await browser.close();
})();
