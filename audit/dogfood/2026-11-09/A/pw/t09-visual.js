const L = require('./lib');
(async () => {
  const { browser, page, logs } = await L.open();
  for (const mode of ['light', 'dark']) {
    if (mode === 'dark') { await page.click('[data-testid="dark-toggle"]'); await page.waitForTimeout(300); }
    await L.shot(page, `09-${mode}-grid`);
    // 列メニュー(区分の ⋮)
    const hb = await page.evaluate(() => { const h = [...document.querySelectorAll('[role="columnheader"]')].find((e) => e.textContent.trim().startsWith('区分')); const r = h.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
    await page.mouse.move(hb.cx, hb.cy); await page.waitForTimeout(200);
    const menuBtn = await page.$('[aria-label="区分 の列メニュー"]');
    await menuBtn.click(); await page.waitForTimeout(300);
    await L.shot(page, `09-${mode}-colmenu`);
    const items = await page.evaluate(() => { const p = document.querySelector('.ssg-menu-panel'); return p ? [...p.querySelectorAll('button, [role]')].map((e) => (e.getAttribute('role') || e.tagName) + ':' + e.textContent.trim()).slice(0, 20) : null; });
    console.log(mode, 'menu items', items);
    // フィルター
    await page.locator('.ssg-menu-panel').getByText('フィルター…', { exact: true }).click();
    await page.waitForTimeout(600);
    await L.shot(page, `09-${mode}-filter`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // select エディタ
    await L.clickCell(page, 14, '税区分'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    await L.shot(page, `09-${mode}-select`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    // date エディタ
    await L.clickCell(page, 14, '日付'); await page.keyboard.press('F2'); await page.waitForTimeout(300);
    await L.shot(page, `09-${mode}-date`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    // invalid tooltip
    const rc = await L.cellBox(page, 16, '領収書');
    await page.mouse.move(rc.cx + 20, rc.cy); await page.waitForTimeout(900);
    console.log(mode, 'tooltip', await page.evaluate(() => { const t = document.querySelector('.ssg-tooltip'); return t ? t.textContent + ' visible=' + getComputedStyle(t).visibility + ' op=' + getComputedStyle(t).opacity : null; }));
    await L.shot(page, `09-${mode}-tooltip`);
  }
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
