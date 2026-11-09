const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
const IG = '[aria-label="T-00001 のサブタスク"]';
const innerBars = (page) => page.evaluate((IG) => { const g = document.querySelector(IG); if (!g) return null; return [...g.closest('.ssg-root').querySelectorAll(':scope > .ssg-bar--bottom')].map(e => e.textContent.replace(/\s+/g, ' ').trim()); }, IG);
const active = (page) => page.evaluate(() => ({ el: document.activeElement?.className + ' ' + (document.activeElement?.getAttribute('aria-label') || ''), }));
(async () => {
  const { browser, page, logs } = await open();
  await page.locator(`${G} [data-row-key="T-00001"] button.ssg-detail-toggle`).first().click();
  await page.waitForTimeout(800);
  log('expanded', await page.getByRole('button', { name: /サブタスクをすべて閉じる/ }).innerText());
  await page.screenshot({ path: 'shots/d-open.png' });
  log('inner exists', await page.locator(IG).count());
  log('outer bars', JSON.stringify(await bars(page)));
  // click inner cell
  const ic = page.locator(`${IG} [data-row-key="T-00001-1"] [data-ssg-col-key="title"]`).first();
  log('inner row1 title', await ic.innerText());
  await ic.click();
  await page.waitForTimeout(200);
  log('after inner click: outer bars', JSON.stringify(await bars(page)), 'inner', JSON.stringify(await innerBars(page)));
  log('focus', JSON.stringify(await active(page)));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);
  log('after arrows: outer', JSON.stringify(await bars(page)), 'inner', JSON.stringify(await innerBars(page)));
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(300);
  log('clipboard', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText())));
  // Ctrl+A in inner
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(200);
  log('after ctrl+a: outer', JSON.stringify(await bars(page)), 'inner', JSON.stringify(await innerBars(page)));
  await page.keyboard.press('Control+a');
  // edit inner title
  await ic.click();
  await page.keyboard.type('仕様のヒアリング');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  log('inner title after edit', await ic.innerText());
  log('card header', await page.locator(`${G} .ssg-detail-card`).first().locator('p, .mantine-Text-root').first().innerText());
  // inner undo
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  log('inner title after undo', await ic.innerText());
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(400);
  log('inner title after redo', await ic.innerText());
  // Ctrl+F inside inner
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(300);
  log('find bar open?', await page.locator('.ssg-find-bar').count(), await page.locator('.ssg-find-bar').evaluateAll(e => e.map(x => x.closest('[aria-label]')?.getAttribute('aria-label') || x.parentElement.className)));
  await page.keyboard.press('Escape');
  // checkbox toggle inner via space
  const done = page.locator(`${IG} [data-row-key="T-00001-1"] [data-ssg-col-key="done"]`).first();
  const doneBefore = await done.innerHTML();
  await done.click();
  await page.waitForTimeout(300);
  log('done toggled?', doneBefore !== await done.innerHTML(), 'card header', await page.locator(`${G} .ssg-detail-card`).first().locator('.mantine-Text-root').first().innerText());
  // select editor inner (owner)
  const own = page.locator(`${IG} [data-row-key="T-00001-2"] [data-ssg-col-key="owner"]`).first();
  await own.dblclick();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/d-inner-select.png' });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  log('owner after select', await own.innerText(), 'inner bars', JSON.stringify(await innerBars(page)));
  log('outer bars', JSON.stringify(await bars(page)));
  // Delete in inner
  const hrs = page.locator(`${IG} [data-row-key="T-00001-1"] [data-ssg-col-key="hours"]`).first();
  await hrs.click();
  const hb = await hrs.innerText();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  log('hours before/after delete', hb, '/', await hrs.innerText());
  log('outer T-00001 title', await (await cell(page, 'T-00001', 'title')).innerText());
  // Tab out from last inner column
  const lastc = page.locator(`${IG} [data-row-key="T-00001-1"] [data-ssg-col-key="done"]`).first();
  await lastc.click();
  await page.waitForTimeout(100);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  log('focus after Tab from inner last col', JSON.stringify(await active(page)));
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  log('focus after 2nd Tab', JSON.stringify(await active(page)));
  log(logs.join('\n'));
  await browser.close();
})();
