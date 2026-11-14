const { open, shot, cellRect, clickCell, gridState, ensureVisible, dumpLogs } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open({ viewport: { width: 900, height: 700 } });
  // 1) d3 から右の固定列の上へドラッグして保持 → 横の自動スクロール
  const a = await cellRect(page, 'S003', 'd3');
  const wr = await page.locator('[role="columnheader"][data-ssg-col-key="workDays"]').boundingBox();
  await page.mouse.move(a.cx, a.cy); await page.mouse.down();
  await page.mouse.move(wr.x + 10, a.cy, { steps: 8 });
  const sl0 = (await gridState(page)).scroll.left;
  await page.waitForTimeout(1200);
  const st1 = await gridState(page);
  await shot(page, '50-drag-autoscroll-right');
  await page.mouse.up();
  console.log('drag to right pinned: scrollLeft', sl0, '->', st1.scroll.left, 'sel', JSON.stringify(st1.sel.range));
  // 2) 中央をスクロールした状態で、左固定の氏名から中央へドラッグ
  await page.evaluate(() => window.__grid.current.setScrollPosition({ left: 400 })); await page.waitForTimeout(250);
  const n = await cellRect(page, 'S010', 'name');
  const vis = await page.evaluate(() => { const lp = document.querySelector('[role="columnheader"][data-ssg-col-key="dept"]').getBoundingClientRect().right; const k = [...document.querySelectorAll('[role="columnheader"][data-ssg-col-key^="d"]')].filter((h) => /^d\d+$/.test(h.dataset.ssgColKey)).find((h) => h.getBoundingClientRect().left >= lp + 2); return k.dataset.ssgColKey; });
  const b = await cellRect(page, 'S012', vis);
  await page.mouse.move(n.cx, n.cy); await page.mouse.down(); await page.mouse.move(b.cx, b.cy, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(200);
  const st2 = await gridState(page);
  console.log('drag name -> first visible center col', vis, 'sel', JSON.stringify(st2.sel.range), 'scrollLeft after', st2.scroll.left);
  await shot(page, '51-drag-left-to-center-scrolled');
  // 3) 上へドラッグ(固定したラベル行の下)→ 縦の自動スクロール
  await page.evaluate(() => window.__grid.current.setScrollPosition({ top: 900, left: 0 })); await page.waitForTimeout(300);
  const keyAt = await page.evaluate(() => { const hb = document.querySelector('.ssg-header-row').getBoundingClientRect().bottom; const rows = [...document.querySelectorAll('.ssg-body-row[data-pane="center"][data-row-key]')].map((r) => ({ k: r.dataset.rowKey, t: r.getBoundingClientRect().top })).filter((r) => r.t > hb + 80).sort((x, y) => x.t - y.t); return rows[3].k; });
  const c = await cellRect(page, keyAt, 'd2');
  const hdr = await page.locator('.ssg-header-row').first().boundingBox();
  await page.mouse.move(c.cx, c.cy); await page.mouse.down();
  await page.mouse.move(c.cx, hdr.y + hdr.height + 10, { steps: 6 }); // 固定したラベル行の上
  const top0 = (await gridState(page)).scroll.top;
  await page.waitForTimeout(1000);
  const st3 = await gridState(page);
  await page.mouse.up();
  console.log('drag up onto sticky label: from', keyAt, 'scrollTop', top0, '->', st3.scroll.top, 'sel', JSON.stringify(st3.sel.range));
  // 4) select エディタを開いたまま横スクロール
  await page.evaluate(() => window.__grid.current.setScrollPosition({ top: 0, left: 0 })); await page.waitForTimeout(250);
  await clickCell(page, 'S004', 'd8');
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  const pos = async () => page.evaluate(() => { const p = document.querySelector('.ssg-select-editor-popover'); const c = document.querySelector('.ssg-body-row[data-row-key="S004"] [data-ssg-col-key="d8"]'); return { pop: p ? Math.round(p.getBoundingClientRect().x) : null, cell: c ? Math.round(c.getBoundingClientRect().x) : null, editor: !!document.querySelector('.ssg-cell-editor') }; });
  console.log('editor open', JSON.stringify(await pos()));
  const box = await page.locator('.ssg-scroll-container').boundingBox();
  await page.mouse.move(box.x + 500, box.y + 300);
  await page.mouse.wheel(200, 0); await page.waitForTimeout(300);
  console.log('after wheel 200', JSON.stringify(await pos()));
  await shot(page, '52-select-open-hscroll');
  await page.mouse.wheel(0, 300); await page.waitForTimeout(300);
  console.log('after wheel down', JSON.stringify(await pos()));
  await shot(page, '53-select-open-vscroll');
  await page.keyboard.press('Escape');
  dumpLogs(logs);
  await browser.close();
})();
