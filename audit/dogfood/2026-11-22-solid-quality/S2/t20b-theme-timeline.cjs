// theme="auto" / motion 既定: サーバーの HTML のクラス → ハイドレーション後のクラスの移り変わりを、文書の読み込みの最初から記録する
const { chromium } = require('playwright')
const BASE = process.env.BASE ?? 'http://localhost:3501'
;(async () => {
  const browser = await chromium.launch()
  for (const p of (process.env.PATHS ?? '/users,/activity,/users?stream=1').split(',')) {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 700 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    const logs = []
    page.on('console', (m) => { const t = m.text(); if (!/\[vite\]|solid-performance|Download the/.test(t)) logs.push(`[${m.type()}] ${t.split('\n')[0].slice(0, 200)}`) })
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
    await page.addInitScript(() => {
      window.__tl = []
      const t0 = performance.now()
      let seen = null
      new MutationObserver(() => {
        const r = document.querySelector('.ssg-root')
        if (!r) return
        const c = r.className + ' | portals:' + document.querySelectorAll('body > .ssg-theme-dark').length
        if (r !== seen) { window.__tl.push([Math.round(performance.now() - t0), 'root-node', r.className]); seen = r }
        if (window.__tl.at(-1)?.[2] !== c) window.__tl.push([Math.round(performance.now() - t0), 'class', c])
      }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    })
    await page.goto(BASE + p)
    await page.waitForTimeout(2500)
    const tl = await page.evaluate(() => window.__tl.filter((x) => x[1] === 'root-node' || x[1] === 'class').slice(0, 8))
    console.log(p, JSON.stringify(tl))
    if (logs.length) console.log('  logs:', logs.join(' / '))
    await ctx.close()
  }
  await browser.close()
})()
