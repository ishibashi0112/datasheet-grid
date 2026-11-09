const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
const IG = '[aria-label="T-00001 のサブタスク"]';
const innerBars = (page) => page.evaluate((IG) => { const g = document.querySelector(IG); if (!g) return null; return [...g.closest('.ssg-root').querySelectorAll(':scope > .ssg-bar--bottom')].map(e => e.textContent.replace(/\s+/g, ' ').trim()); }, IG);
const active = (page) => page.evaluate(() => { const a = document.activeElement; return (a?.tagName + '.' + a?.className + ' ' + (a?.getAttribute('aria-label') || a?.textContent?.slice(0, 30) || '')) + ' in:' + (a?.closest('[aria-label]')?.getAttribute('aria-label') || ''); });
(async () => {
  const { browser, page, logs } = await open();
  // first, edit outer cell to create outer history
  const oc = await cell(page, 'T-00001', 'note');
  await oc.click();
  await page.keyboard.type('outer-edit');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  log('outer canUndo before', await page.evaluate(() => 0));
  await page.locator(`${G} [data-row-key="T-00001"] button.ssg-detail-toggle`).first().click();
  await page.waitForTimeout(800);
  const ic = page.locator(`${IG} [data-row-key="T-00001-1"] [data-ssg-col-key="title"]`).first();
  await ic.click();
  await page.keyboard.type('Hearing');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  log('inner title after edit', await ic.innerText());
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  log('inner title after inner undo', await ic.innerText());
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(400);
  log('inner title after inner redo', await ic.innerText());
  // now focus outer and undo: does outer note revert?
  await (await cell(page, 'T-00118', 'title')).click();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  log('outer note after outer Ctrl+Z', JSON.stringify(await oc.innerText()), 'inner title', await ic.innerText());
  // Add many subtasks to make the inner grid scroll
  for (let i = 0; i < 8; i++) { await page.locator(`${G} .ssg-detail-card`).first().getByRole('button', { name: 'サブタスクを追加' }).click(); }
  await page.waitForTimeout(500);
  log('inner rows', JSON.stringify(await innerBars(page)));
  const innerScroll = page.locator(`${IG}`).first();
  const box = await innerScroll.boundingBox();
  const outerTop0 = await page.locator(G).evaluate(e => e.scrollTop);
  await page.mouse.move(box.x + 100, box.y + box.height / 2);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(400);
  log('inner scrollTop', await innerScroll.evaluate(e => e.scrollTop), 'outer scrollTop', outerTop0, '->', await page.locator(G).evaluate(e => e.scrollTop));
  await page.screenshot({ path: 'shots/d-many.png' });
  // drag select inside inner
  const a = page.locator(`${IG} [data-row-key="T-00001-1"] [data-ssg-col-key="owner"]`).first();
  const b = page.locator(`${IG} [data-row-key="T-00001-2"] [data-ssg-col-key="hours"]`).first();
  await innerScroll.evaluate(e => e.scrollTop = 0);
  await page.waitForTimeout(200);
  const ab = await a.boundingBox(); const bb = await b.boundingBox();
  await page.mouse.move(ab.x + 10, ab.y + 10); await page.mouse.down();
  await page.mouse.move(bb.x + 10, bb.y + 10, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(200);
  log('after drag: inner', JSON.stringify(await innerBars(page)), 'outer', JSON.stringify(await bars(page)));
  // outer keyboard: click outer T-00001 title, ArrowDown should go to next row skipping card
  await (await cell(page, 'T-00001', 'title')).click();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  log('outer after ArrowDown', JSON.stringify(await bars(page)));
  // Tab from outer last column of T-00001
  await (await cell(page, 'T-00001', 'note')).click();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  log('focus after outer Tab from last col', await active(page));
  await page.keyboard.press('Tab');
  log('2nd', await active(page));
  await page.keyboard.press('Tab');
  log('3rd', await active(page));
  await page.keyboard.press('Tab');
  log('4th', await active(page));
  await page.keyboard.press('Shift+Tab');
  log('shift-tab', await active(page));
  log(logs.join('\n'));
  await browser.close();
})();
