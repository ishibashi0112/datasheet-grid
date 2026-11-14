const { open, shot, dumpLogs } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  await shot(page, '01-initial');
  const info = await page.evaluate(() => {
    const root = document.querySelector('.ssg-root');
    const cells = document.querySelectorAll('.ssg-body-cell');
    const anyCell = cells[0];
    return {
      rootClass: root.className,
      bodyRows: document.querySelectorAll('.ssg-body-row').length,
      cells: cells.length,
      sampleCellAttrs: anyCell ? [...anyCell.attributes].map((a) => `${a.name}=${a.value}`).join(' ') : null,
      grid: document.querySelector('[role="grid"]')?.outerHTML.slice(0, 400),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  dumpLogs(logs);
  await browser.close();
})();
