const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const q of ['', '?strict=0']) {
    const p = await b.newPage();
    const warns = []; p.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text().slice(0, 60)); });
    await p.goto('http://localhost:5409/repro/hints.html' + q);
    await p.waitForSelector('.ssg-body-cell');
    await p.waitForTimeout(300);
    const w0 = warns.length;
    for (let i = 0; i < 3; i += 1) { await p.click('#rerender'); await p.waitForTimeout(100); }
    console.log(q || '(strict)', 'mount warnings', w0, 'after 3 rerenders', warns.length);
    await p.close();
  }
  await b.close();
})();
