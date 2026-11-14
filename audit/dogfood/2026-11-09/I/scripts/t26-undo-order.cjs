// AI の「元に戻す」の後、利用側の columns の並びが変わるか(固定した列を解除したときの戻り先)
const { open, askBar, barText } = require('./lib.cjs');
const cols = (page) => page.evaluate(() => window.__columns.map((c) => c.key + (c.visible === false ? '(h)' : '') + (c.pinned ? `[${c.pinned}]` : '')).join(','));
const visualOrder = (page) => page.evaluate(() => [...document.querySelectorAll('.ssg-header-cell')].map((h) => ({ t: h.textContent.trim(), x: Math.round(h.getBoundingClientRect().x) })).filter((h) => h.t).sort((a, b) => a.x - b.x).map((h) => h.t).join(','));
async function pinMenu(page, title, itemRe) {
  const h = page.locator('.ssg-header-cell', { hasText: title }).first();
  await h.hover();
  await page.getByRole('button', { name: `${title} の列メニュー` }).click();
  await page.locator('.ssg-menu-item', { hasText: '列の固定' }).hover();
  await page.waitForTimeout(500);
  const items = await page.$$eval('.ssg-menu-item', (ms) => ms.map((m) => m.textContent.trim()));
  const target = items.find((t) => itemRe.test(t));
  if (!target) { console.log('  menu items:', items); await page.keyboard.press('Escape'); return false; }
  await page.locator('.ssg-menu-item', { hasText: target }).first().click();
  await page.waitForTimeout(500);
  return target;
}
(async () => {
  // A: 手で固定 → 手で解除(AI なし)
  {
    const { browser, page } = await open();
    console.log('A0', await cols(page));
    console.log('A pin', await pinMenu(page, '担当', /左に固定/), await cols(page));
    console.log('A unpin', await pinMenu(page, '担当', /固定しない|解除|固定を外/), await cols(page));
    console.log('A visual', await visualOrder(page));
    await browser.close();
  }
  // B: 手で固定 → AI でメモ列を隠す → 元に戻す → 手で解除
  {
    const { browser, page, logs } = await open();
    await page.click('[data-testid=toggle-colvis]');
    console.log('B pin', await pinMenu(page, '担当', /左に固定/), await cols(page));
    await askBar(page, 'メモ列を隠して');
    console.log('B hidden', await cols(page));
    await page.getByRole('button', { name: '元に戻す' }).click();
    await page.waitForTimeout(500);
    console.log('B undo', await cols(page), '|', (await barText(page)).split('\n').slice(7).join(' / '));
    console.log('B unpin', await pinMenu(page, '担当', /固定しない|解除|固定を外/), await cols(page));
    console.log('B visual', await visualOrder(page));
    console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
    await browser.close();
  }
  // C: 固定なしで AI で隠す → 元に戻す(並びは変わらないはず)
  {
    const { browser, page } = await open();
    await page.click('[data-testid=toggle-colvis]');
    await askBar(page, 'メモ列を隠して');
    await page.getByRole('button', { name: '元に戻す' }).click();
    await page.waitForTimeout(500);
    console.log('C undo', await cols(page));
    await browser.close();
  }
})();
