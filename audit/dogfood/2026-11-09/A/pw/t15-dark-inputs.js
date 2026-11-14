const L = require('./lib');
async function openMenu(page, title) {
  const hb = await page.evaluate((t) => { const h = [...document.querySelectorAll('[role="columnheader"]')].find((e) => e.textContent.trim().startsWith(t)); const r = h.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, title);
  await page.mouse.move(hb.cx, hb.cy); await page.waitForTimeout(150);
  await page.click(`[aria-label="${title} の列メニュー"]`); await page.waitForTimeout(250);
}
const audit = (page) => page.evaluate(() => {
  const out = [];
  const root = document.getElementById('root');
  for (const el of document.querySelectorAll('input, select, textarea, button')) {
    if (root.contains(el)) continue;
    const cs = getComputedStyle(el);
    if (el.offsetParent === null) continue;
    out.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]}[${el.type || ''}] "${(el.value || el.textContent || el.placeholder || '').trim().slice(0, 14)}" color=${cs.color} bg=${cs.backgroundColor}`);
  }
  return out;
});
(async () => {
  const { browser, page, logs } = await L.open();
  await page.click('[data-testid="dark-toggle"]'); await page.waitForTimeout(300);
  for (const col of ['金額', '日付', '摘要']) {
    await openMenu(page, col);
    await page.locator('.ssg-menu-panel').getByText('フィルター…', { exact: true }).click();
    await page.waitForTimeout(600);
    const inputs = await page.$$('.ssg-filter-popover input:not([type=checkbox])');
    if (inputs[0]) { await inputs[0].click(); await page.keyboard.type(col === '日付' ? '2026/10/1' : col === '金額' ? '1000' : 'abc'); }
    await page.waitForTimeout(200);
    console.log('==', col); (await audit(page)).forEach((l) => console.log('  ', l));
    const box = await (await page.$('.ssg-filter-popover')).boundingBox();
    await page.screenshot({ path: `${L.SHOTS}/15-dark-filter-${col}.png`, clip: { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: Math.min(box.height + 8, 500) } });
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
  await openMenu(page, '区分');
  await page.locator('.ssg-menu-panel').getByText('フィルターを管理…', { exact: true }).click();
  await page.waitForTimeout(800);
  console.log('== manage'); (await audit(page)).slice(0, 30).forEach((l) => console.log('  ', l));
  await L.shot(page, '15-dark-manage');
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
