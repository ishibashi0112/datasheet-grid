const { open, shot, cellRect, dumpLogs } = require('./lib.cjs');
async function measure(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const headers = [...document.querySelectorAll('[role="columnheader"][data-ssg-col-key]')];
    const mism = [];
    for (const h of headers) {
      const key = h.dataset.ssgColKey;
      const c = q(`.ssg-body-row[data-row-key="S005"] [data-ssg-col-key="${key}"]`);
      if (!c) continue;
      const hr = rect(h), cr = rect(c);
      if (Math.abs(hr.x - cr.x) > 0.5 || Math.abs(hr.width - cr.width) > 0.5) mism.push({ key, hx: hr.x, cx: cr.x, hw: hr.width, cw: cr.width });
    }
    const sc = q('.ssg-scroll-container');
    const leftPane = rect(q('[role="columnheader"][data-ssg-col-key="dept"]'));
    const rightPane = rect(q('[role="columnheader"][data-ssg-col-key="workDays"]'));
    const rendered = headers.map((h) => h.dataset.ssgColKey).filter((k) => /^d\d+$/.test(k));
    // 中央ペインの見えている最初 / 最後の列の位置
    const visibleCenter = rendered.map((k) => ({ k, r: rect(q(`[role="columnheader"][data-ssg-col-key="${k}"]`)) }))
      .filter((o) => o.r.right > leftPane.right && o.r.left < rightPane.left);
    const label = rect(q('.ssg-label-row [class*="label"]'));
    return {
      scrollLeft: sc.scrollLeft, scrollWidth: sc.scrollWidth, clientWidth: sc.clientWidth,
      nameX: rect(q('[role="columnheader"][data-ssg-col-key="name"]')).x,
      nameCellX: rect(q('.ssg-body-row[data-row-key="S005"] [data-ssg-col-key="name"]'))?.x,
      deptRight: leftPane.right, workX: rightPane.x,
      workCellX: rect(q('.ssg-body-row[data-row-key="S005"] [data-ssg-col-key="workDays"]'))?.x,
      renderedFirst: rendered[0], renderedLast: rendered[rendered.length - 1], renderedCount: rendered.length,
      visFirst: visibleCenter[0]?.k, visLast: visibleCenter[visibleCenter.length - 1]?.k,
      mism,
    };
  });
}
(async () => {
  const { browser, page, logs } = await open();
  const box = await page.locator('.ssg-scroll-container').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const results = [];
  results.push(await measure(page));
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(150, 0);
    await page.waitForTimeout(120);
    results.push(await measure(page));
  }
  await shot(page, '03-hscroll-end');
  // 急な往復
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(-400, 0); await page.waitForTimeout(16); }
  await page.waitForTimeout(200);
  results.push(await measure(page));
  for (const r of results) console.log(JSON.stringify(r));
  // スクロールバーをドラッグして横へ
  dumpLogs(logs);
  await browser.close();
})();
