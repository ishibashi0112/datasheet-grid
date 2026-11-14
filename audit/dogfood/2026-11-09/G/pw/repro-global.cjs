const { chromium } = require('playwright')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 })
  const logs = []
  page.on('console', (m) => logs.push(m.type() + ' ' + m.text()))
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message))
  await page.goto(process.argv[2])
  await page.waitForSelector('[data-pane="center"].ssg-body-row')
  const input = page.locator('.ssg-bar--top input')
  const sample = async (label, ms) => {
    const out = []
    const t = Date.now()
    while (Date.now() - t < ms) {
      const m = (await page.locator('.ssg-bar--bottom').innerText()).match(/行\s*(\d+)/)
      const first = await page.locator('[data-pane="center"].ssg-body-row').first().locator('[role=gridcell]').nth(1).innerText().catch(() => '')
      out.push(`${Date.now() - t}:${m?.[1]}:${first}`)
      await wait(60)
    }
    console.log(label, out.join(' | '))
  }
  await input.fill('apple'); await sample('apple', 2500)
  await input.fill(''); await sample('clear', 800)
  await input.fill('banana'); await sample('banana', 2500)
  console.log(logs.filter((l) => !l.includes('DevTools')).join('\n'))
  await browser.close()
})()
