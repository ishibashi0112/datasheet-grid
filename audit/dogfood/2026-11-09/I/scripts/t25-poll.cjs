const { open, askBar } = require('./lib.cjs');
(async () => {
  const { browser, page } = await open();
  await page.evaluate(() => {
    const h = window.__grid;
    const orig = h.getState.bind(h);
    window.__gsCalls = 0;
    try { h.getState = () => { window.__gsCalls += 1; return orig(); }; } catch (e) { window.__wrapErr = String(e); }
  });
  console.log('wrapErr', await page.evaluate(() => window.__wrapErr));
  const measure = async (label) => {
    await page.evaluate(() => { window.__gsCalls = 0; });
    await page.waitForTimeout(5000);
    console.log(label, 'getState calls in 5s:', await page.evaluate(() => window.__gsCalls));
  };
  await measure('idle (no session)');
  await askBar(page, '関東の 10 万円以上');
  await measure('applied');
  await page.getByRole('button', { name: '閉じる' }).click();
  await measure('after close');
  // 時間計測: 1 回の getState の時間
  const t = await page.evaluate(() => { const t0 = performance.now(); for (let i = 0; i < 100; i++) window.__grid.getState(); return (performance.now() - t0) / 100; });
  console.log('getState avg ms', t.toFixed(3));
  await browser.close();
})();
