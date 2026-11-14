const { open, G } = require('./lib.cjs');
const log = (...a) => console.log(...a);
const headers = (page) => page.evaluate(() => [...document.querySelectorAll('[aria-label="タスク一覧"] [role="columnheader"][data-ssg-col-key]')].map(h => h.dataset.ssgColKey + '@' + h.closest('[data-pane]')?.dataset.pane).join(' '));
async function dragCol(page, key, toX, opts = {}) {
  const h = page.locator(`${G} [role="columnheader"][data-ssg-col-key="${key}"]`);
  await h.hover(); await page.waitForTimeout(200);
  const g = await h.locator('.ssg-header-grip').boundingBox();
  await page.mouse.move(g.x + 3, g.y + 5); await page.mouse.down();
  await page.mouse.move(g.x + (toX > g.x ? 20 : -20), g.y + 5, { steps: 3 });
  await page.mouse.move(toX, g.y + 5, { steps: 15 });
  await page.waitForTimeout(200);
  if (opts.shot) await page.screenshot({ path: opts.shot });
  if (opts.escape) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  await page.mouse.up(); await page.waitForTimeout(700);
}
(async () => {
  const { browser, page, logs } = await open();
  log('0', await headers(page));
  // ESC cancel
  const idb = await page.locator(`${G} [role="columnheader"][data-ssg-col-key="phase"]`).boundingBox();
  await dragCol(page, 'estimate', idb.x + 10, { escape: true });
  log('after esc', await headers(page));
  // unpin ID by dragging to center
  const tb = await page.locator(`${G} [role="columnheader"][data-ssg-col-key="title"]`).boundingBox();
  await dragCol(page, 'id', tb.x + tb.width / 2, { shot: 'shots/c-unpin-drag.png' });
  log('after unpin drag', await headers(page));
  // drag title to the far left (before group col)
  await dragCol(page, 'title', 60, { shot: 'shots/c-drag-left-edge.png' });
  log('after drag to left edge', await headers(page));
  // drag priority beyond right edge (pin right zone)
  await dragCol(page, 'priority', 1580, { shot: 'shots/c-drag-right-edge.png' });
  log('after drag to right edge', await headers(page));
  log(logs.join('\n'));
  await browser.close();
})();
