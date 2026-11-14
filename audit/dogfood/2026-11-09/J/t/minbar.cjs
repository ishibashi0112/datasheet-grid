const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  const base = process.env.BASE || 'http://localhost:5410'
  for (const w of [900, 640, 560, 480, 320]) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 1, locale: 'ja-JP' })
    const page = await ctx.newPage()
    const logs = []
    page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`))
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
    await page.goto(`${base}/min/bottombar.html?w=${w}`)
    await page.locator('.ssg-root').waitFor()
    await page.waitForTimeout(300)
    const cell = (r) => page.locator(`[role=row][aria-rowindex="${r + 2}"] [role=gridcell][aria-colindex="2"]`).first()
    const a = await cell(0).boundingBox(), b = await cell(3).boundingBox()
    await page.mouse.move(a.x + 20, a.y + 8); await page.mouse.down(); await page.mouse.move(b.x + 20, b.y + 8, { steps: 5 }); await page.mouse.up()
    await page.waitForTimeout(500)
    const info = await page.evaluate(() => {
      const bar = document.querySelector('.ssg-bar--bottom')
      const r = bar.getBoundingClientRect()
      const parts = [...bar.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim()).map((e) => { const b = e.getBoundingClientRect(); const vis = b.right > r.left && b.left < r.right; return `${e.textContent.trim()}[${Math.round(b.left - r.left)}..${Math.round(b.right - r.left)}]` })
      // 集計の入れ物の様子
      const agg = [...bar.querySelectorAll('*')].find((e) => /平均/.test(e.textContent) && e.children.length > 0 && !/行/.test(e.textContent))
      const cs = agg ? getComputedStyle(agg) : null
      return { w: Math.round(r.width), h: Math.round(r.height), parts, agg: agg && { cls: agg.className, overflow: cs.overflow, justify: cs.justifyContent, minWidth: cs.minWidth, flex: cs.flex, sw: agg.scrollWidth, cw: agg.clientWidth } }
    })
    console.log(JSON.stringify(info))
    const bb = await page.locator('.ssg-bar--bottom').boundingBox()
    await page.screenshot({ path: `shots/min-bottombar-${w}.png`, clip: { x: bb.x, y: bb.y - 4, width: bb.width, height: bb.height + 8 } })
    if (logs.length) console.log(logs.join('\n'))
    await ctx.close()
  }
  await browser.close()
})()
