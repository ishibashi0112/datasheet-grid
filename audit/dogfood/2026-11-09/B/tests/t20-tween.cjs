// Sample cell texts at high frequency during highlightChanges count-up; look for unformatted intermediate values.
const { open, shot } = require('./lib.cjs');
const base = process.argv[2] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=replace`);
  const res = await page.evaluate(async () => {
    const bad = { last: new Set(), changePct: new Set(), volume: new Set(), change: new Set(), high: new Set() };
    const re = { last: /^\d{1,3}(,\d{3})*\.\d{2}$/, high: /^\d{1,3}(,\d{3})*\.\d{2}$/, change: /^[+-]?\d{1,3}(,\d{3})*\.\d{2}$|^0\.00$/, changePct: /^[+-]?\d+\.\d{2}%$|^0\.00%$/, volume: /^\d{1,3}(,\d{3})*$/ };
    let samples = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 4000) {
      await new Promise((r) => requestAnimationFrame(r));
      samples++;
      for (const key of Object.keys(re)) {
        for (const c of document.querySelectorAll(`.ssg-body-cell[data-ssg-col-key="${key}"]:not(.ssg-total-cell)`)) {
          const t = c.textContent.trim();
          if (!re[key].test(t)) bad[key].add(t);
        }
      }
    }
    return { samples, bad: Object.fromEntries(Object.entries(bad).map(([k, v]) => [k, [...v].slice(0, 10)])) };
  });
  console.log(JSON.stringify(res, null, 1));
  console.log('LOGS', logs);
  await browser.close();
})();
