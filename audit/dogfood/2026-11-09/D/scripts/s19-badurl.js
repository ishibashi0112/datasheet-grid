const { open, sleep, waitRows, lastGet, shot } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  const f = encodeURIComponent(JSON.stringify({ bogus: { kind: 'text', value: 'x' }, plan: { kind: 'set', mode: 'include', values: ['pro'] }, seats: { kind: 'text', value: 'oops' } }));
  await page.goto(`http://localhost:3401/users?sort=bogus.asc,mrr.desc&filters=${f}`);
  await sleep(4000);
  await sleep(800);
  const g = lastGet(reqs);
  console.log('GET query:', JSON.stringify(g.query));
  console.log('getState:', await page.evaluate(() => 0));
  console.log('top text:', await page.evaluate(() => document.querySelector('.ssg-root').textContent.slice(0, 300)));
  await shot(page, '19-badurl');
  // garbage JSON
  await page.goto(`http://localhost:3401/users?filters=%7Bnot-json&sort=..,`);
  await waitRows(page);
  console.log('garbage GET query:', JSON.stringify(lastGet(reqs).query));
  // wrong shaped value: set with values not array
  const f2 = encodeURIComponent(JSON.stringify({ plan: { kind: 'set', mode: 'include', values: 'pro' }, seats: { kind: 'number', raw: '>5' } }));
  await page.goto(`http://localhost:3401/users?filters=${f2}`);
  await sleep(3000);
  console.log('wrong-shape GET query:', JSON.stringify(lastGet(reqs)?.query), 'rows?', await page.evaluate(() => document.querySelectorAll('[role=row][data-row-key]').length));
  await shot(page, '19-badurl2');
  console.log('logs:', logs.slice(0, 8));
  await browser.close();
})();
