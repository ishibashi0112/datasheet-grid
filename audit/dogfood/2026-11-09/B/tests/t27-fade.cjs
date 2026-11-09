// Sorted live board with animateRows: how often / how long are visible rows (nearly) transparent?
const { open, shot } = require('./lib.cjs');
const base = process.argv[2] ?? 'http://127.0.0.1:5402/';
const q = process.argv[3] ?? '';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=replace${q}`);
  await page.evaluate(() => window.__app.grid().applyState({ sort: [{ columnKey: 'changePct', direction: 'desc' }] }));
  await page.waitForTimeout(1000);
  const r = await page.evaluate(async () => {
    const sc = document.querySelector('.ssg-scroll-container').getBoundingClientRect();
    const hidden = new Map(); // key -> frames hidden consecutively
    let frames = 0, framesWithHidden = 0, maxRun = 0, totalHiddenRowFrames = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 5000) {
      await new Promise((res) => requestAnimationFrame(res));
      frames++;
      let any = false;
      const seen = new Set();
      for (const row of document.querySelectorAll('[role="row"][data-pane="center"][data-row-key]')) {
        const b = row.getBoundingClientRect();
        if (b.top < sc.top + 40 || b.bottom > sc.bottom - 30) continue;
        // effective opacity of first cell
        const cell = row.querySelector('.ssg-body-cell');
        const op = Math.min(Number(getComputedStyle(row).opacity), cell ? Number(getComputedStyle(cell).opacity) : 1);
        if (op < 0.3) {
          any = true; totalHiddenRowFrames++;
          const k = row.getAttribute('data-row-key');
          seen.add(k);
          const n = (hidden.get(k) ?? 0) + 1; hidden.set(k, n); if (n > maxRun) maxRun = n;
        }
      }
      for (const k of [...hidden.keys()]) if (!seen.has(k)) hidden.delete(k);
      if (any) framesWithHidden++;
    }
    return { frames, framesWithHidden, maxConsecutiveFramesHidden: maxRun, totalHiddenRowFrames };
  });
  console.log(q || 'anim on', JSON.stringify(r));
  await shot(page, `27-fade${q.replace(/[&=]/g, '_')}`);
  await browser.close();
})();
