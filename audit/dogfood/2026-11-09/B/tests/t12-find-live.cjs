const { open, shot, center, cellHandle } = require('./lib.cjs');
const mode = process.argv[2] ?? 'replace';
const base = process.argv[3] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=${mode}`);
  await page.evaluate(() => {
    window.__find = [];
  });
  const p = await center(page, await cellHandle(page, 3, 'name'));
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(200);
  // type slowly while ticks arrive
  for (const ch of 'Iron Union') { await page.keyboard.type(ch); await page.waitForTimeout(70); }
  await page.waitForTimeout(800);
  const st1 = await page.evaluate(() => ({ input: document.querySelector('.ssg-find-bar input')?.value, focus: document.activeElement?.closest('.ssg-find-bar') != null, label: document.querySelector('.find-label')?.textContent, active: window.__app.grid().getActiveCell(), scroll: window.__app.grid().getScrollPosition() }));
  console.log('after typing', JSON.stringify(st1));
  // press Enter 3 times (next)
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(300); }
  const st2 = await page.evaluate(() => ({ label: document.querySelector('.find-label')?.textContent, active: window.__app.grid().getActiveCell(), scroll: window.__app.grid().getScrollPosition(), cur: document.querySelector('.ssg-find-mark--current')?.closest('[role=row]')?.getAttribute('data-row-key') }));
  console.log('after 3x Enter', JSON.stringify(st2));
  // watch stability of current hit / scroll over 3 seconds while ticks arrive
  const seq = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    seq.push(await page.evaluate(() => `${document.querySelector('.find-label')?.textContent}|act=${JSON.stringify(window.__app.grid().getActiveCell())}|top=${window.__app.grid().getScrollPosition().top}|cur=${document.querySelector('.ssg-find-mark--current')?.closest('[role=row]')?.getAttribute('data-row-key')}`));
  }
  console.log('stable?', seq.join('\n   '));
  // now a volatile query: digits of prices
  await page.keyboard.press('Control+a');
  for (const ch of '.5') { await page.keyboard.type(ch); await page.waitForTimeout(70); }
  const seq2 = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(400);
    seq2.push(await page.evaluate(() => `${document.querySelector('.find-label')?.textContent}|act=${JSON.stringify(window.__app.grid().getActiveCell())}|top=${window.__app.grid().getScrollPosition().top}|cur=${document.querySelector('.ssg-find-mark--current')?.closest('[role=row]')?.getAttribute('data-row-key')}`));
  }
  console.log('volatile', seq2.join('\n   '));
  await shot(page, `12-find-live-${mode}`);
  // press Enter repeatedly -> does it advance?
  const adv = [];
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(120); adv.push(await page.evaluate(() => document.querySelector('.find-label')?.textContent)); }
  console.log('advance', adv.join(', '));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  console.log('after esc focus in grid:', await page.evaluate(() => document.activeElement?.className));
  console.log('LOGS', logs);
  await browser.close();
})();
