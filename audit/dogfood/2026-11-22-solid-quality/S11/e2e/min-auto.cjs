// 最小の再現: Shadow の中のグリッドで popupContainer を書かない(既定 'auto')と、ポップアップはどこに出て見た目が付くか
const { open, shot } = require('./lib.cjs')
const URL_ = process.env.URL ?? 'http://localhost:5511/min/index.html?popup=auto'
const NAME = process.env.NAME ?? 'solid'
;(async () => {
  const { browser, page } = await open({ viewport: { width: 900, height: 700 } })
  await page.goto(URL_); await page.waitForTimeout(2000)
  await page.locator('min-grid [role="row"][data-row-index="1"] [role="gridcell"][data-ssg-col-key="qty"]').click({ position: { x: 20, y: 14 } })
  await page.keyboard.press('Alt+ArrowDown'); await page.waitForTimeout(400)
  const r = await page.evaluate(() => {
    const sr = document.querySelector('min-grid').shadowRoot
    const m = sr.querySelector('[role=menu]') ?? document.querySelector('[role=menu]')
    if (!m) return 'なし'
    const cs = getComputedStyle(m)
    return `${sr.contains(m) ? 'shadow' : 'document(' + m.parentElement.tagName + ')'} bg=${cs.backgroundColor} position=${cs.position} border=${cs.borderTopWidth}`
  })
  console.log(NAME, '既定の popupContainer の列メニュー:', r)
  await shot(page, `min-auto-${NAME}`)
  await browser.close()
})()
