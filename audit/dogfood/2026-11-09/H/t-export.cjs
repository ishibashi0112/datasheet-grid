const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
(async () => {
  const { browser, page, logs } = await open();
  await page.getByRole('button', { name: 'すべて閉じる', exact: true }).click();
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const out = {};
    return out;
  });
  // use the grid handle via the app? Not exposed. Use button for includeGroupRows, plus expose via React devtools? Instead add a window hook
  await page.getByRole('button', { name: 'CSV(小計つき)' }).click();
  await page.waitForTimeout(300);
  const csv = await page.evaluate(() => window.__lastCsv);
  const lines = csv.split('\r\n');
  log('lines', lines.length);
  log(lines.slice(0, 8).join('\n'));
  // find subtotal lines and compare to group rows on screen
  const sub = lines.filter(l => l.includes('小計'));
  log('subtotal lines', sub.length);
  log(sub.slice(0, 6).join('\n'));
  const gr = await groupRows(page);
  log('screen groups', JSON.stringify(gr.slice(0, 3).map(g => g.label + JSON.stringify(g.vals))));
  // verify sums by recomputing from leaf lines
  const head = lines[0].split(',');
  const ai = head.indexOf('担当者'), ei = head.indexOf('見積(h)'), pi = head.indexOf('進捗(%)'), ii = head.indexOf('ID');
  const leaf = lines.slice(1).filter(l => l && !l.includes('小計'));
  const byA = {};
  for (const l of leaf) { const f = l.split(','); byA[f[ai]] = byA[f[ai]] || { n: 0, e: 0, p: 0 }; byA[f[ai]].n++; byA[f[ai]].e += Number(f[ei]); byA[f[ai]].p += Number(f[pi]); }
  log('recomputed 加藤', JSON.stringify(byA['加藤 陽菜']), 'avg', byA['加藤 陽菜'].p / byA['加藤 陽菜'].n);
  log('leaf count', leaf.length);
  // check "includes header? where is 小計 label column"
  log(logs.join('\n'));
  await browser.close();
})();
