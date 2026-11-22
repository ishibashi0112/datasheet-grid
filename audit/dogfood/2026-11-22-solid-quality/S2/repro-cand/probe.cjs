// 本番の最小再現をブラウザの TZ を変えて開き、DOM とスクショを取る
const { chromium } = require('playwright')
;(async () => {
  const tz = process.argv[2] ?? 'Pacific/Pago_Pago'
  const b = await chromium.launch()
  const ctx = await b.newContext({ timezoneId: tz, viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  const logs = []
  p.on('console', (m) => logs.push(`C ${m.type()} ${m.text().slice(0, 300)}`))
  p.on('pageerror', (e) => logs.push(`E ${e.message}`))
  await p.goto(process.env.URL ?? 'http://localhost:5502/')
  await p.waitForTimeout(2000)
  console.log(tz, JSON.stringify(await p.evaluate(() => ({
    headers: [...document.querySelectorAll('[role="columnheader"]')].map((e) => e.textContent.trim()),
    rowsLeft: document.querySelectorAll('.ssg-body-row[data-pane="left"]').length,
    rowsCenter: document.querySelectorAll('.ssg-body-row[data-pane="center"]').length,
    cells: [...document.querySelectorAll('.ssg-body-row [data-ssg-col-key="at"]')].map((e) => e.textContent),
    chip: document.querySelector('.ssg-bar-chip')?.textContent,
    rowcount: document.querySelector('[role="grid"]')?.getAttribute('aria-rowcount'),
  }))))
  if (await p.locator('#btn').count()) { await p.locator('#btn').click(); await p.waitForTimeout(200); console.log('button:', await p.locator('#btn').textContent()) }
  console.log(logs.join('\n'))
  await p.screenshot({ path: `shot-${process.env.TAG ?? 'x'}-${tz.replace('/', '_')}.png` })
  await b.close()
})()
