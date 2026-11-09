const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
const IG = '[aria-label="T-00001 のサブタスク"]';
const clip = (page) => page.evaluate(() => navigator.clipboard.readText());
const active = (page) => page.evaluate(() => { const a = document.activeElement; return (a?.tagName + '.' + (a?.className || '').toString().slice(0, 40)) + ' in:' + (a?.closest('[aria-label]')?.getAttribute('aria-label') || ''); });
(async () => {
  const { browser, page, logs } = await open();
  // keyboard: go to toggle column via ArrowLeft and open with Enter
  await (await cell(page, 'T-00001', 'id')).click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  log('bars after ArrowLeft x2', JSON.stringify((await bars(page))[1]));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  log('card count after Enter', await page.locator(`${G} .ssg-detail-card`).count());
  // outer selection
  await (await cell(page, 'T-00118', 'title')).click();
  await page.keyboard.press('Shift+ArrowDown');
  // inner selection & copy
  await page.locator(`${IG} [data-row-key="T-00001-1"] [data-ssg-col-key="title"]`).first().click();
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Control+c'); await page.waitForTimeout(200);
  log('copy with inner focus', JSON.stringify(await clip(page)));
  await (await cell(page, 'T-00118', 'title')).click();
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Control+c'); await page.waitForTimeout(200);
  log('copy with outer focus', JSON.stringify(await clip(page)));
  // paste into inner
  await page.evaluate(() => navigator.clipboard.writeText('PA\t田中 美咲\t3\nPB\t鈴木 花子\t4'));
  await page.locator(`${IG} [data-row-key="T-00001-1"] [data-ssg-col-key="title"]`).first().click();
  await page.keyboard.press('Control+v'); await page.waitForTimeout(400);
  log('inner after paste', JSON.stringify(await page.locator(IG).first().evaluate(g => [...g.querySelectorAll('[data-pane="center"][data-row-key]')].map(r => r.innerText.replace(/\n/g, '|')))));
  log('outer T-00118 title after inner paste', await (await cell(page, 'T-00118', 'title')).innerText());
  // inner column menu
  await page.locator(`${IG} [role="columnheader"][data-ssg-col-key="hours"]`).first().click({ button: 'right' });
  await page.waitForTimeout(400);
  log('inner col menu items', JSON.stringify(await page.locator('.ssg-menu-item').allInnerTexts()));
  await page.locator('.ssg-menu-item', { hasText: '降順で並び替え' }).first().click();
  await page.waitForTimeout(400);
  log('outer bars after inner sort', JSON.stringify((await bars(page))[0]));
  log('inner rows after sort', JSON.stringify(await page.locator(IG).first().evaluate(g => [...g.querySelectorAll('[data-pane="center"][data-row-key]')].sort((a,b)=>a.dataset.rowIndex-b.dataset.rowIndex).map(r => r.dataset.rowKey))));
  // inner filter popover
  await page.locator(`${IG} [role="columnheader"][data-ssg-col-key="owner"]`).first().click({ button: 'right' });
  await page.waitForTimeout(300);
  log('inner owner menu', JSON.stringify(await page.locator('.ssg-menu-item').allInnerTexts()));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  log('focus after Escape inner menu', await active(page));
  // close card via button and check focus return
  await page.locator(`${G} .ssg-detail-card`).first().getByRole('button', { name: '閉じる' }).click();
  await page.waitForTimeout(500);
  log('after close: focus', await active(page), 'bars', JSON.stringify((await bars(page))[1]));
  // re-open, scroll card out and back
  await page.locator(`${G} [data-row-key="T-00001"] button.ssg-detail-toggle`).first().click();
  await page.waitForTimeout(500);
  await page.locator(`${IG} [data-row-key="T-00001-2"] [data-ssg-col-key="hours"]`).first().click();
  await page.locator(G).evaluate(e => e.scrollTop = 20000); await page.waitForTimeout(500);
  await page.locator(G).evaluate(e => e.scrollTop = 0); await page.waitForTimeout(500);
  log('inner bars after scroll out/back', JSON.stringify(await page.locator(IG).first().evaluate(g => g.closest('.ssg-root').querySelector(':scope > .ssg-bar--bottom').textContent)));
  // horizontal scroll outer with card open
  await page.locator(G).evaluate(e => e.scrollLeft = 300); await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/d-hscroll.png' });
  const cardBox = await page.locator(`${G} .ssg-detail-card`).first().boundingBox();
  log('card box after hscroll', JSON.stringify(cardBox));
  await page.locator(G).evaluate(e => e.scrollLeft = 0); await page.waitForTimeout(300);
  // delete selected row that is expanded
  await page.locator(`${G} [data-row-key="T-00001"] .ssg-row-checkbox`).first().click();
  await page.getByRole('button', { name: '選択を削除' }).click();
  await page.waitForTimeout(600);
  log('after delete expanded row: expanded btn', await page.getByRole('button', { name: /サブタスクをすべて閉じる/ }).innerText(), 'cards', await page.locator(`${G} .ssg-detail-card`).count());
  await (await cell(page, 'T-00118', 'title')).click();
  await page.keyboard.press('Control+z'); await page.waitForTimeout(600);
  log('after undo delete: T-00001 exists', await page.locator(`${G} [data-row-key="T-00001"]`).count(), 'expanded', await page.getByRole('button', { name: /サブタスクをすべて閉じる/ }).innerText());
  log(logs.join('\n'));
  await browser.close();
})();
