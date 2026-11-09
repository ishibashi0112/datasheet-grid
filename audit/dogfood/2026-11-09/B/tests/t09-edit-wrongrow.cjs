// Open the memo editor on a row of a live, sorted board, type, commit; check the row that received the text
// is the row whose memo the editor opened with.
const { open, shot, center, cellHandle } = require('./lib.cjs');
const mode = process.argv[2] ?? 'replace';
const runs = Number(process.argv[3] ?? 5);
const base = process.argv[4] ?? 'http://127.0.0.1:5402/';
const commitKey = process.argv[5] ?? 'Enter';
const openBy = process.argv[6] ?? 'f2';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=${mode}&memo=1`);
  await page.evaluate(() => window.__app.grid().applyState({ sort: [{ columnKey: 'changePct', direction: 'desc' }] }));
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__app.grid(); g.selectCell(4, g.getColIndex('memo'), { scrollIntoView: true }); });
  await page.waitForTimeout(400);
  let bad = 0;
  for (let i = 0; i < runs; i++) {
    const viewRow = 3 + (i % 5);
    await page.evaluate((vr) => { const g = window.__app.grid(); g.selectCell(vr, g.getColIndex('memo'), { scrollIntoView: true }); g.setScrollPosition({ top: 0 }); }, viewRow);
    await page.waitForTimeout(300);
    const pt = await center(page, await cellHandle(page, viewRow + 2, 'memo'));
    if (openBy === 'dbl') await page.mouse.dblclick(pt.x, pt.y);
    else if (openBy === 'type') { await page.mouse.click(pt.x, pt.y); }
    else { await page.mouse.click(pt.x, pt.y); await page.keyboard.press('F2'); }
    await page.waitForTimeout(30);
    const opened = await page.evaluate(() => document.querySelector('.ssg-cell-editor input, .ssg-cell-editor textarea')?.value);
    await page.keyboard.press('End');
    const suffix = ` #${i}`;
    for (const ch of suffix) { await page.keyboard.type(ch); await page.waitForTimeout(150); }
    await page.waitForTimeout(400);
    const pre = await page.evaluate(() => {
      const g = window.__app.grid();
      const a = g.getActiveCell();
      return { active: a?.row };
    });
    await page.keyboard.press(commitKey);
    await page.waitForTimeout(100);
    const res = await page.evaluate((suffix) => window.__app.getRows().filter((r) => r.memo.endsWith(suffix)).map((r) => [r.symbol, r.memo]), suffix);
    const openedSym = /^note (\w+)/.exec(opened ?? '')?.[1];
    const writtenTo = res[0]?.[0];
    const ok = res.length === 1 && writtenTo === openedSym && res[0][1] === `${opened}${suffix}`;
    if (!ok) bad++;
    console.log(`run ${i}: editor opened with "${opened}" -> written ${JSON.stringify(res)} ${ok ? 'OK' : 'WRONG ROW'} (activeRow before commit ${pre.active})`);
    if (!ok && bad === 1) await shot(page, `09-wrongrow-${mode}`);
    await page.waitForTimeout(200);
  }
  console.log(`${mode}: ${bad}/${runs} wrong`);
  console.log('LOGS', logs);
  await browser.close();
})();
