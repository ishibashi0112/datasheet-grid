// ブラウザは Pago Pago(今日 = 11-21 = 2 行)、サーバーは TZ の環境変数(Kiritimati なら今日 = 11-22 = 5 行)
const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1, timezoneId: process.env.BROWSER_TZ ?? 'Pacific/Pago_Pago' })
  const page = await ctx.newPage()
  const logs = []
  page.on('console', (m) => { if (!/\[vite\]|solid-performance|Download the/.test(m.text())) logs.push(`[${m.type()}] ${m.text().split('\n')[0].slice(0, 300)}`) })
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  const html = await (await ctx.request.get(process.env.URL ?? 'http://localhost:5502/')).text()
  const ssr = [...html.matchAll(/class="ssg-bar-chip[^"]*"[^>]*>(.*?)<\/span>/g)].map((m) => m[1].replace(/<!--.*?-->|<[^>]+>/g, '')).slice(0, 1)
  await page.goto(process.env.URL ?? 'http://localhost:5502/')
  await page.waitForTimeout(1500)
  const read = () => page.evaluate(() => ({
    browserToday: new Date().toLocaleDateString('sv'),
    topChip: document.querySelector('.ssg-bar--top .ssg-bar-chip')?.textContent,
    bottom: document.querySelector('.ssg-bar--bottom')?.textContent.replace(/\s+/g, ' ').slice(0, 60),
    ariaRowcount: document.querySelector('[role="grid"]')?.getAttribute('aria-rowcount'),
    bodyDates: [...document.querySelectorAll('.ssg-body-row [data-ssg-col-key="at"]')].map((e) => e.textContent),
  }))
  console.log('server HTML chip:', ssr)
  console.log('after hydrate  :', JSON.stringify(await read()))
  // セルを押す(ほかの状態を変える)
  const c = await page.locator('.ssg-body-row [data-ssg-col-key="at"]').first().boundingBox()
  await page.mouse.click(c.x + 20, c.y + 10); await page.waitForTimeout(400)
  console.log('after click    :', JSON.stringify(await read()))
  // グローバルフィルターに打って消す(行の数が一度変わる)
  const gi = page.locator('.ssg-bar-input').first()
  if (await gi.count()) { await gi.click(); await page.keyboard.type('2'); await page.waitForTimeout(600); await page.keyboard.press('Backspace'); await page.waitForTimeout(800) }
  console.log('after filter   :', JSON.stringify(await read()))
  await page.screenshot({ path: process.env.SHOT ?? 'shot.png' })
  console.log(logs.join('\n'))
  await browser.close()
})()
