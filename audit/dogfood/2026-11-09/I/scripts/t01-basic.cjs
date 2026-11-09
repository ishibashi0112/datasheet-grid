const { open, askBar, barText, state } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  await page.screenshot({ path: 'shots/01-initial.png' });
  console.log('BAR0:', JSON.stringify(await barText(page)));
  await askBar(page, '関東の 10 万円以上');
  console.log('BAR1:', JSON.stringify(await barText(page)));
  console.log('STATE1:', JSON.stringify((await state(page)).filters));
  await page.screenshot({ path: 'shots/01-after-ask.png' });
  const log = await page.evaluate(() => window.__askLog.map((e) => ({ text: e.text, bytes: e.bodyBytes, outcome: e.outcome })));
  console.log('ASKLOG', JSON.stringify(log));
  console.log('LOGS', logs.join('\n'));
  await browser.close();
})();
