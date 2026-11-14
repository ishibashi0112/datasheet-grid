const { open } = require('./lib.cjs');
const cols = (page) => page.evaluate(() => window.__columns.map((c) => c.key + (c.visible === false ? '(h)' : '') + (c.pinned ? `[${c.pinned}]` : '')).join(','));
(async () => {
  const { browser, page, logs } = await open();
  await page.evaluate(() => window.__grid.applyState({ columns: window.__grid.getState().columns.map((c) => (c.key === 'rep' ? { ...c, pinned: 'left' } : c)) }));
  await page.waitForTimeout(400);
  console.log('1 pinned via applyState', await cols(page));
  console.log('  getState().columns', await page.evaluate(() => JSON.stringify(window.__grid.getState().columns.map((c) => c.key + (c.pinned ? `[${c.pinned}]` : '')))));
  // 状態の保存と復元のつもりの往復
  await page.evaluate(() => window.__grid.applyState({ columns: window.__grid.getState().columns }));
  await page.waitForTimeout(400);
  console.log('2 after round trip', await cols(page));
  await page.evaluate(() => window.__grid.applyState({ columns: window.__grid.getState().columns.map((c) => (c.key === 'memo' ? { ...c, visible: false } : c)) }));
  await page.waitForTimeout(400);
  console.log('3 hide memo via applyState', await cols(page));
  await page.evaluate(() => window.__grid.applyState({ columns: window.__grid.getState().columns.map((c) => (c.key === 'rep' ? { ...c, pinned: undefined } : c)) }));
  await page.waitForTimeout(400);
  console.log('4 unpin via applyState', await cols(page));
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
