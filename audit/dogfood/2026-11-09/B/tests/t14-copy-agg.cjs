const { open, shot, center, cellHandle, scanJapanese } = require('./lib.cjs');
const mode = process.argv[2] ?? 'replace';
const base = process.argv[3] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=${mode}`);
  // drag-select rows 1..10 (view 0..9) columns last..volume while feed runs
  const a = await center(page, await cellHandle(page, 2, 'last'));
  const b = await center(page, await cellHandle(page, 11, 'volume'));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const sel = await page.evaluate(() => window.__app.grid().getSelection());
  console.log('selection', JSON.stringify(sel));
  // aggregates over time vs computed
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__app.setRunning(false));
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const bar = document.querySelector('.ssg-bar--bottom').innerText.replace(/\s+/g, ' ');
      const g = window.__app.grid();
      const rows = g.getSelectedRows();
      let sum = 0, n = 0;
      for (const q of rows) for (const k of ['last', 'change', 'changePct', 'volume']) { sum += q[k]; n++; }
      return { bar, expectedSum: Math.round(sum * 10000) / 10000, n };
    });
    console.log('agg', i, JSON.stringify(r));
    await page.evaluate(() => window.__app.setRunning(true));
    await page.waitForTimeout(700);
  }
  // copy while running
  await page.keyboard.press('Control+c');
  const snapshot = await page.evaluate(() => window.__app.grid().getSelectedRows().map((r) => [r.symbol, r.last, r.change, r.changePct, r.volume]));
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  console.log('clipboard:\n' + clip.split('\r\n').slice(0, 4).join('\n'), '\nlines', clip.split(/\r?\n/).length);
  console.log('snapshot first rows', JSON.stringify(snapshot.slice(0, 3)));
  // compare clipboard lines with snapshot (values could differ if a tick hit between)
  const lines = clip.split(/\r?\n/).filter(Boolean).map((l) => l.split('\t'));
  let mismatch = 0;
  lines.forEach((l, i) => { const s = snapshot[i]; if (!s) return; if (Number(l[0]) !== s[1] || Number(l[3]) !== s[4]) mismatch++; });
  console.log('mismatching lines', mismatch, 'of', lines.length);
  await page.waitForTimeout(800);
  await shot(page, `14-copyrange-${mode}`);
  const overlay = await page.evaluate(() => !!document.querySelector('.ssg-copy-range-overlay'));
  console.log('copy overlay still shown after ticks:', overlay);
  // big selection: Ctrl+A aggregates (50k cells threshold: 2000*15=30000) 
  await page.keyboard.press('Control+a');
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(500);
    console.log('ctrl+a bar', await page.evaluate(() => document.querySelector('.ssg-bar--bottom').innerText.replace(/\s+/g, ' ')));
  }
  console.log((await scanJapanese(page, 'agg')).join('\n'));
  console.log('LOGS', logs);
  await browser.close();
})();
