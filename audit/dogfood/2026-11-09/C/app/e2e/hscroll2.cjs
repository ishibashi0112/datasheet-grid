const { open, shot, dumpLogs } = require('./lib.cjs');
const W = Number(process.env.W || 760);
async function measure(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const headers = [...document.querySelectorAll('[role="columnheader"][data-ssg-col-key]')];
    const mism = [];
    for (const h of headers) {
      const key = h.dataset.ssgColKey;
      for (const rk of ['S005', 'S040']) {
        const c = q(`.ssg-body-row[data-row-key="${rk}"] [data-ssg-col-key="${key}"]`);
        if (!c) continue;
        const hr = rect(h), cr = rect(c);
        if (Math.abs(hr.x - cr.x) > 0.5 || Math.abs(hr.width - cr.width) > 0.5) mism.push({ rk, key, hx: hr.x, cx: cr.x });
      }
    }
    const sc = q('.ssg-scroll-container');
    const leftPane = rect(q('[role="columnheader"][data-ssg-col-key="dept"]'));
    const rightPane = rect(q('[role="columnheader"][data-ssg-col-key="workDays"]'));
    const rendered = headers.map((h) => h.dataset.ssgColKey).filter((k) => /^d\d+$/.test(k));
    const visibleCenter = rendered.map((k) => ({ k, r: rect(q(`[role="columnheader"][data-ssg-col-key="${k}"]`)) }))
      .filter((o) => o.r.right > leftPane.right + 1 && o.r.left < rightPane.left - 1);
    // 見える範囲に穴が無いか(連続した列か)
    const nums = visibleCenter.map((o) => Number(o.k.slice(1)));
    const holes = nums.filter((n, i) => i > 0 && n !== nums[i - 1] + 1);
    const lastVis = visibleCenter[visibleCenter.length - 1];
    const firstVis = visibleCenter[0];
    return {
      sl: sc.scrollLeft, sw: sc.scrollWidth, cw: sc.clientWidth,
      nameX: rect(q('[role="columnheader"][data-ssg-col-key="name"]')).x,
      deptR: leftPane.right, workX: rightPane.x, totalWorkX: rect(q('.ssg-total-row [data-ssg-col-key="workDays"]'))?.x,
      r: `${rendered[0]}..${rendered[rendered.length - 1]}(${rendered.length})`,
      vis: `${firstVis?.k}..${lastVis?.k}`, firstL: firstVis?.r.left, lastR: lastVis?.r.right,
      gapLeft: firstVis ? firstVis.r.left - leftPane.right : null, gapRight: lastVis ? rightPane.left - lastVis.r.right : null,
      holes, mism: mism.slice(0, 3), mismN: mism.length,
    };
  });
}
(async () => {
  const { browser, page, logs } = await open({ viewport: { width: W, height: 700 } });
  // 日の列を広げる(列幅 90 相当 = 本当の仮想化が働くように)は別スクリプトで
  const box = await page.locator('.ssg-scroll-container').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const res = [await measure(page)];
  for (let i = 0; i < 16; i++) { await page.mouse.wheel(120, 0); await page.waitForTimeout(80); res.push(await measure(page)); }
  await shot(page, `04-hscroll-narrow-${W}-end`);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(-500, 0); await page.waitForTimeout(10); }
  await page.waitForTimeout(150);
  res.push(await measure(page));
  // 縦にも
  await page.mouse.wheel(300, 1500); await page.waitForTimeout(250);
  res.push(await measure(page));
  await shot(page, `04-hscroll-narrow-${W}-diag`);
  for (const r of res) console.log(JSON.stringify(r));
  dumpLogs(logs);
  await browser.close();
})();
