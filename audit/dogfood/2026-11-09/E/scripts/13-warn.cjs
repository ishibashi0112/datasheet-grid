const { open, shot, sleep, cellBox } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open((process.argv[2] || 'http://127.0.0.1:5405') + '/repro/warn.html');
  await page.waitForSelector('.ssg-root');
  await sleep(1000);
  console.log('--- on mount');
  console.log(logs.filter(l => !l.includes('vite') && !l.includes('DevTools')).join('\n'));
  logs.length = 0;
  await page.evaluate(() => { const g = window.gridRef.current; g.exportCsv(); g.downloadCsv('x.csv'); g.getExportData(); g.openFilterManager(); g.openFind('x'); g.autoSizeColumns?.(); g.moveRow(1, 3); });
  await sleep(500);
  console.log('--- after methods');
  console.log(logs.join('\n'));
  await shot(page, '13-warn');
  await browser.close();
})();
