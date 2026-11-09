const L = require('./lib');
(async () => {
  const { browser, page, logs } = await L.open();
  console.log('shot', await L.shot(page, '01-initial'));
  console.log('header total', await L.headerTotal(page));
  console.log('total row', await L.totalRowText(page));
  console.log('r1', await L.cellText(page, 1, '日付'), await L.cellText(page, 1, '区分'), await L.cellText(page, 1, '金額'), await L.cellText(page, 1, '税区分'), await L.cellText(page, 1, '状態'));
  const html = await page.evaluate(() => document.querySelector('.ssg-root').outerHTML.length);
  console.log('root html len', html);
  console.log('LOGS', logs.join('\n'));
  await browser.close();
})();
