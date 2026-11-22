// 最小の再現: サーバーとブラウザのタイムゾーンを変えて、固定列と中央の列が同じ行かを見る
const { chromium } = require('playwright')
const path = require('path')
;(async () => {
  const browser = await chromium.launch()
  for (const tz of (process.env.TZS ?? 'Asia/Tokyo Pacific/Honolulu').split(' ')) {
    const ctx = await browser.newContext({ timezoneId: tz, deviceScaleFactor: 1, viewport: { width: 800, height: 600 } })
    const page = await ctx.newPage()
    const logs = []
    page.on('console', (m) => { if (!m.text().includes('[vite]')) logs.push(`[${m.type()}] ${m.text().slice(0, 160)}`) })
    page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message))
    await page.goto(process.env.URL ?? 'http://localhost:5508/')
    await page.waitForTimeout(1500)
    const res = await page.evaluate(() => {
      const left = [...document.querySelectorAll('[data-pane="left"][role="row"][data-row-index]')].map((r) => r.textContent.trim())
      const center = [...document.querySelectorAll('[data-pane="center"][role="row"][data-row-index]')].map((r) => r.textContent.trim())
      const bar = [...document.querySelectorAll('.ssg-bar--top .ssg-bar-chip')].map((e) => e.textContent.trim()).join(' | ')
      return { bar, left, center }
    })
    console.log(`\n== browser ${tz}`)
    console.log(JSON.stringify(res))
    console.log(logs.join('\n'))
    await page.screenshot({ path: path.join(__dirname, '..', 'shots', `${process.env.SHOT ?? 'min'}-${tz.replace('/', '_')}.png`) })
    await ctx.close()
  }
  await browser.close()
})()
