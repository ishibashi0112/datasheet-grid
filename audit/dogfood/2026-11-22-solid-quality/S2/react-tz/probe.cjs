// React 版: theme=auto + motion 既定で SSR → hydrateRoot。ダーク + 視差効果を減らす のときのクラスの移り変わり
const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ timezoneId: process.argv[2] ?? 'UTC', viewport: { width: 900, height: 600 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  const logs = []
  p.on('console', (m) => logs.push(`C ${m.type()} ${m.text().slice(0, 200)}`))
  p.on('pageerror', (e) => logs.push(`E ${e.message}`))
  await p.addInitScript(() => {
    window.__tl = []; const t0 = performance.now(); let seen = null
    new MutationObserver(() => { const r = document.querySelector('.ssg-root'); if (!r) return; if (r !== seen) { window.__tl.push([Math.round(performance.now() - t0), 'root-node', r.className]); seen = r } else if (window.__tl.at(-1)?.[2] !== r.className) window.__tl.push([Math.round(performance.now() - t0), 'class', r.className]) }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  })
  await p.goto(process.env.URL)
  await p.waitForTimeout(2000)
  console.log('react', JSON.stringify(await p.evaluate(() => window.__tl)))
  console.log(logs.join('\n'))
  await b.close()
})()
