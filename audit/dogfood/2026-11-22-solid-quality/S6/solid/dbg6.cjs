const { launch, devices } = require('./lib.cjs')
;(async () => {
  const d = { ...devices['iPhone 13'] }; delete d.defaultBrowserType
  for (const touch of [true, false]) {
    const { browser, ctx } = await launch(touch ? { ...d, deviceScaleFactor: 1 } : {})
    for (const base of ['http://localhost:5506/react/', 'http://localhost:5506/solid/']) {
      const page = await ctx.newPage()
      await page.goto(base); await page.waitForTimeout(1000)
      const info = await page.evaluate(() => {
        const out = {}
        const sz = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const a = getComputedStyle(e, '::after'); const bf = getComputedStyle(e, '::before'); return `${Math.round(r.width)}x${Math.round(r.height)} after:${a.content === 'none' ? '-' : a.width + 'x' + a.height + '@' + a.inset} before:${bf.content === 'none' ? '-' : bf.width + 'x' + bf.height}` }
        for (const s of ['.ssg-icon-btn', '[role=columnheader] [class*=resize]', '.ssg-body-row button[aria-expanded]', '.ssg-body-row [class*=drag]', '.ssg-cell-checkbox', '.ssg-row-checkbox', '.ssg-bar-chip', '.ssg-global-filter input, .ssg-bar input']) out[s] = sz(s)
        // CSS ルールに pointer: coarse があるか
        let coarse = 0; for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) if (r.media && /coarse/.test(r.media.mediaText)) coarse += r.cssRules.length } catch {} }
        out.coarseRules = coarse
        return out
      })
      console.log(touch ? 'touch' : 'mouse', base, JSON.stringify(info, null, 0))
      await page.close()
    }
    await browser.close()
  }
})()
