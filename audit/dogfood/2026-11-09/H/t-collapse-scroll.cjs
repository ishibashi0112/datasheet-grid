const { open, G, groupRows } = require('./lib.cjs');
const log = (...a) => console.log(...a);
(async () => {
  const { browser, page, logs } = await open();
  await page.locator(G).evaluate(e => e.scrollTop = 36 * 1500);
  await page.waitForTimeout(500);
  const gr = await groupRows(page);
  const target = gr.find(g => g.indent === '16px');
  log('target', JSON.stringify(target));
  const btn = page.locator(`${G} [data-ssg-group-row][data-row-index="${target.i}"] .ssg-group-toggle`).first();
  const b0 = await btn.boundingBox();
  const st0 = await page.locator(G).evaluate(e => e.scrollTop);
  await btn.click();
  await page.waitForTimeout(700);
  const b1 = await page.locator(`${G} [data-ssg-group-row][data-row-index="${target.i}"] .ssg-group-toggle`).first().boundingBox();
  const st1 = await page.locator(G).evaluate(e => e.scrollTop);
  log('toggle y before/after', b0.y, b1 && b1.y, 'scrollTop', st0, st1);
  await page.screenshot({ path: 'shots/g-collapse-deep.png' });
  // collapse all while scrolled deep
  await page.getByRole('button', { name: 'すべて閉じる', exact: true }).click();
  await page.waitForTimeout(700);
  log('after collapseAll scrollTop', await page.locator(G).evaluate(e => e.scrollTop), 'groups visible', (await groupRows(page)).length);
  await page.getByRole('button', { name: 'すべて開く', exact: true }).click();
  await page.waitForTimeout(700);
  log('after expandAll scrollTop', await page.locator(G).evaluate(e => e.scrollTop), 'first visible', JSON.stringify((await groupRows(page)).slice(0, 2).map(g => g.label)));
  log(logs.filter(l => !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
