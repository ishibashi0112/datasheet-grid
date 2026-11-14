const { open, shot, center, cellHandle } = require('./lib.cjs');
const mode = process.argv[2] ?? 'replace';
const base = process.argv[3] ?? 'http://127.0.0.1:5402/';
const extra = process.argv[4] ?? '';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=${mode}${extra}`);
  await page.evaluate(() => window.__app.grid().applyState({ sort: [{ columnKey: 'changePct', direction: 'desc' }] }));
  await page.waitForTimeout(500);
  const viewRow = 4;
  await page.evaluate((vr) => { const g = window.__app.grid(); g.selectCell(vr, g.getColIndex('memo'), { scrollIntoView: true }); }, viewRow);
  await page.waitForTimeout(400);
  const keyAtStart = await page.evaluate(() => window.__app.grid().getSelectedRows()[0].symbol);
  const pt = await center(page, await cellHandle(page, viewRow + 2, 'memo'));
  await page.mouse.dblclick(pt.x, pt.y);
  await page.keyboard.type('abc');
  // sample
  const samples = await page.evaluate(async (k) => {
    const g = window.__app.grid();
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 6000) {
      await new Promise((r) => setTimeout(r, 20));
      const vi = g.getViewRowIndex(k);
      const a = g.getActiveCell();
      const ed = document.querySelector('.ssg-cell-editor');
      let under = null;
      if (ed) {
        const eb = ed.getBoundingClientRect();
        for (const el of document.querySelectorAll('[role="row"][data-pane="center"][data-row-key]')) {
          const b = el.getBoundingClientRect();
          if (b.top <= eb.top + eb.height / 2 && b.bottom >= eb.top + eb.height / 2) under = el.getAttribute('data-row-key');
        }
      }
      out.push({ t: Math.round(performance.now() - t0), vi, ar: a?.row, under, ed: !!ed });
    }
    return out;
  }, keyAtStart);
  let mism = 0, runs = [], cur = null, lostEditor = 0, underMism = 0;
  for (const s of samples) {
    if (!s.ed) lostEditor++;
    if (s.under && s.under !== keyAtStart) underMism++;
    if (s.vi !== s.ar) { mism++; if (!cur) cur = { start: s.t, end: s.t, vi: s.vi, ar: s.ar }; else cur.end = s.t; }
    else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  console.log(mode, 'key', keyAtStart, 'samples', samples.length, 'activeRow!=viewIdx', mism, 'editorOverOtherRow', underMism, 'editorGone', lostEditor);
  console.log(samples.filter((_, i) => i % 3 === 0).map((s) => `${s.t}:${s.vi}/${s.ar}/${s.under}`).join(" "));
  console.log('mismatch runs (ms):', JSON.stringify(runs.slice(0, 15).map((r) => `${r.start}-${r.end} vi=${r.vi} ar=${r.ar}`)));
  await page.keyboard.press('Escape');
  console.log('LOGS', logs);
  await browser.close();
})();
