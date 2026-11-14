const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
const headers = (page) => page.evaluate(() => [...document.querySelectorAll('[aria-label="タスク一覧"] [role="columnheader"][data-ssg-col-key]')].map(h => h.dataset.ssgColKey + '@' + h.closest('[data-pane]')?.dataset.pane + ':' + Math.round(h.getBoundingClientRect().width)));
(async () => {
  const { browser, page, logs } = await open();
  log('headers0', JSON.stringify(await headers(page)));
  // open tool panel via column menu 列の表示
  await openColumnMenu(page, 'wbs');
  await clickMenu(page, '列の表示');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'shots/c-toolpanel.png' });
  const panelText = await page.evaluate(() => { const p = [...document.querySelectorAll('body > *')].find(e => e.textContent.includes('フィルター') && e.textContent.includes('並び替え') && e.querySelector('input[type=checkbox]')); return p ? p.innerText.slice(0, 600) : 'no panel'; });
  log('panel', JSON.stringify(panelText));
  // uncheck WBS and メモ
  for (const name of ['WBS', 'メモ']) {
    const lab = page.locator('.ssg-chooser-toggle', { has: page.locator('.ssg-chooser-label', { hasText: new RegExp('^' + name + '$') }) }).first();
    await lab.scrollIntoViewIfNeeded();
    log(name, 'label count', await lab.count());
    await lab.click().catch(e => log('click fail', e.message.slice(0, 100)));
    await page.waitForTimeout(300);
  }
  log('headers after hide', JSON.stringify(await headers(page)));
  // try toggling grouped column in panel
  const grpLab = page.locator('.ssg-chooser-toggle', { hasText: '担当者' }).first();
  log('grouped label', await grpLab.count(), await grpLab.innerText().catch(() => ''), 'disabled', await grpLab.isDisabled().catch(() => '?'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  log('panel open after Escape?', await page.locator('.ssg-toolpanel').count());
  await page.locator('.ssg-toolpanel .ssg-popover-close').click().catch(() => {});
  await page.waitForTimeout(300);
  // pin progress to right via column menu
  await openColumnMenu(page, 'progress');
  await page.locator('.ssg-menu-item', { hasText: '列の固定' }).first().hover();
  await page.waitForTimeout(500);
  const pinItems = await page.evaluate(() => [...document.querySelectorAll('.ssg-menu-item')].map(e => e.textContent.trim()));
  log('pin submenu', JSON.stringify(pinItems));
  await page.locator('.ssg-menu-item', { hasText: '右' }).last().click();
  await page.waitForTimeout(500);
  log('headers after pin right', JSON.stringify(await headers(page)));
  // resize title column by dragging its resize handle
  const th = page.locator(`${G} [role="columnheader"][data-ssg-col-key="title"]`);
  const hb = await th.boundingBox();
  await page.mouse.move(hb.x + hb.width - 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width + 60, hb.y + hb.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  log('headers after resize', JSON.stringify(await headers(page)));
  // drag reorder (live) : move start column before title
  const sh = page.locator(`${G} [role="columnheader"][data-ssg-col-key="start"]`);
  await sh.hover();
  await page.waitForTimeout(200);
  const grip = sh.locator('.ssg-header-grip');
  const gb = await grip.boundingBox();
  const tb = await th.boundingBox();
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(gb.x - 50, gb.y + 5, { steps: 5 });
  await page.mouse.move(tb.x + 20, gb.y + 5, { steps: 15 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'shots/c-drag-live.png' });
  await page.mouse.up();
  await page.waitForTimeout(600);
  log('headers after drag', JSON.stringify(await headers(page)));
  // drag a column into left pinned pane (pin by drag)
  const ph = page.locator(`${G} [role="columnheader"][data-ssg-col-key="priority"]`);
  await ph.hover(); await page.waitForTimeout(200);
  const pg = await ph.locator('.ssg-header-grip').boundingBox();
  const idb = await page.locator(`${G} [role="columnheader"][data-ssg-col-key="id"]`).boundingBox();
  await page.mouse.move(pg.x + 3, pg.y + 5); await page.mouse.down();
  await page.mouse.move(pg.x - 100, pg.y + 5, { steps: 5 });
  await page.mouse.move(idb.x + idb.width - 10, pg.y + 5, { steps: 20 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/c-drag-pin.png' });
  await page.mouse.up();
  await page.waitForTimeout(800);
  log('headers after drag-pin', JSON.stringify(await headers(page)));
  const st = await page.evaluate(() => localStorage.getItem('wbs-grid-state'));
  log('saved state', st);
  log(logs.join('\n'));
  await browser.close();
})();
