const { open, shot, center, cellHandle } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open('http://127.0.0.1:5402/?mode=replace&memo=1&n=300');
  await page.evaluate(() => window.__app.grid().applyState({ sort: [{ columnKey: 'changePct', direction: 'desc' }] }));
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__app.grid(); g.selectCell(10, g.getColIndex('memo'), { scrollIntoView: true }); g.setScrollPosition({ top: 0 }); g.focus(); });
  await page.waitForTimeout(300);
  await page.keyboard.press('F2');
  const opened = await page.evaluate(() => document.querySelector('.ssg-cell-editor input')?.value);
  const samples = [];
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(250);
    samples.push(await page.evaluate(() => { const g = window.__app.grid(); const e = document.querySelector('.ssg-cell-editor')?.getBoundingClientRect(); return `row=${g.getActiveCell()?.row} top=${g.getScrollPosition().top} edY=${Math.round(e?.top ?? -1)}`; }));
  }
  console.log('editing', opened);
  console.log(samples.join('\n'));
  await shot(page, '29-edit-scroll');
  await page.keyboard.press('Escape');
  await browser.close();
})();
