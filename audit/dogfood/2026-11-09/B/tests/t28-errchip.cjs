const { open, shot } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open('http://127.0.0.1:5402/?run=0');
  for (const [label, scrollLeft] of [['memo at right edge', null], ['scrolled fully right', 99999]]) {
    await page.evaluate((sl) => { const g = window.__app.grid(); g.selectCell(4, g.getColIndex('memo'), { scrollIntoView: true }); if (sl) g.setScrollPosition({ left: sl }); g.focus(); }, scrollLeft);
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.keyboard.type('z'.repeat(70));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const e = document.querySelector('.ssg-cell-editor-error');
      const sc = document.querySelector('.ssg-root').getBoundingClientRect();
      const b = e?.getBoundingClientRect();
      return { text: e?.textContent, errLeft: Math.round(b?.left), errRight: Math.round(b?.right), errWidth: Math.round(b?.width), gridRight: Math.round(sc.right), viewport: innerWidth };
    });
    console.log(label, JSON.stringify(r));
    await shot(page, `28-errchip-${scrollLeft ? 'right' : 'edge'}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  await browser.close();
})();
