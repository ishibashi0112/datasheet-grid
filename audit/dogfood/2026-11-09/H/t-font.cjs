const { open, G, cell } = require('./lib.cjs');
const log = (...a) => console.log(...a);
(async () => {
  const { browser, page, logs } = await open();
  await page.locator(`${G} [data-row-key="T-00001"] button.ssg-detail-toggle`).first().click();
  await page.waitForTimeout(600);
  const IG = '[aria-label="T-00001 のサブタスク"]';
  const fs = (sel) => page.locator(sel).first().evaluate(e => { const s = getComputedStyle(e); return s.fontSize + ' ' + s.fontFamily.slice(0, 30); });
  log('outer cell', await fs(`${G} [data-row-key="T-00001"] [data-ssg-col-key="title"] span`));
  log('inner cell', await fs(`${IG} [data-row-key="T-00001-1"] [data-ssg-col-key="title"] span`));
  log('inner root', await page.locator(IG).first().evaluate(e => getComputedStyle(e.closest('.ssg-root')).fontSize));
  log('outer root', await page.locator(G).first().evaluate(e => getComputedStyle(e.closest('.ssg-root')).fontSize));
  // open text editor in inner
  await page.locator(`${IG} [data-row-key="T-00001-1"] [data-ssg-col-key="title"]`).first().dblclick();
  await page.waitForTimeout(300);
  log('inner text editor', await fs('.ssg-cell-editor input, .ssg-cell-editor textarea'));
  await page.keyboard.press('Escape');
  await page.locator(`${IG} [data-row-key="T-00001-1"] [data-ssg-col-key="owner"]`).first().dblclick();
  await page.waitForTimeout(300);
  log('inner select editor', await page.evaluate(() => [...document.querySelectorAll('.ssg-cell-editor *')].map(e => e.tagName + ':' + getComputedStyle(e).fontSize).slice(0, 4).join(' ')));
  await page.keyboard.press('Escape');
  await (await cell(page, 'T-00001', 'title')).dblclick();
  await page.waitForTimeout(300);
  log('outer text editor', await fs('.ssg-cell-editor input, .ssg-cell-editor textarea'));
  await page.keyboard.press('Escape');
  await browser.close();
})();
