const { open, shot, cellRect, clickCell, gridState, snapshot, diff, ensureVisible, dumpLogs } = require('./lib.cjs');
const writeClip = (page, t) => page.evaluate((t) => navigator.clipboard.writeText(t), t);
(async () => {
  const { browser, page, logs } = await open();
  let snap = await snapshot(page);
  const step = async (label) => {
    const s = await snapshot(page);
    const st = await gridState(page);
    console.log(`[${label}] diff=`, JSON.stringify(diff(snap, s)), 'active=', JSON.stringify(st.active), 'sel=', JSON.stringify(st.sel.range ?? st.sel));
    snap = s;
  };
  // A) 部署(編集不可・左固定)から 3 列貼る
  await ensureVisible(page, 'S020', 'dept');
  await writeClip(page, '外科\t早\t遅');
  const r = await clickCell(page, 'S020', 'dept');
  console.log('clicked', r);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(250);
  await step('paste from dept');
  await shot(page, '10-paste-from-dept');
  // B) ラベル行をまたぐ
  await ensureVisible(page, 'S030', 'd5');
  await writeClip(page, '夜\n休\n早');
  await clickCell(page, 'S030', 'd5');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(250);
  await step('paste across label');
  await shot(page, '11-paste-across-label');
  // C) 不正な値
  await ensureVisible(page, 'S031', 'd10');
  await writeClip(page, '日勤\tx');
  await clickCell(page, 'S031', 'd10');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(250);
  await step('paste invalid');
  console.log('invalid', JSON.stringify(await page.evaluate(() => window.__grid.current.getInvalidCells())));
  await shot(page, '12-paste-invalid');
  // D) Excel 由来の CRLF と末尾改行
  await ensureVisible(page, 'S040', 'd1');
  await writeClip(page, '早\t遅\r\n夜\t休\r\n');
  await clickCell(page, 'S040', 'd1');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(250);
  await step('paste CRLF');
  // E) undo x4
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(80); }
  await step('undo x4');
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Control+y'); await page.waitForTimeout(80); }
  await step('redo x4');
  dumpLogs(logs);
  await browser.close();
})();
