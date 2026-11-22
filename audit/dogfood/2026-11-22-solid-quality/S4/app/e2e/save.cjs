// 実ブラウザ: onRowsChange から action で保存しているあいだに別の行を編集する
const { chromium } = require('playwright')
const path = require('path')
const BASE = process.env.BASE || 'http://localhost:5504/'
;(async () => {
  const modes = (process.argv[2] || 'optimistic,flush,action,plain').split(',')
  const browser = await chromium.launch()
  for (const mode of modes) {
    const context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    const logs = []
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
    await page.goto(`${BASE}save.html?mode=${mode}&ms=1500`)
    await page.waitForSelector('.ssg-body-cell')
    await page.waitForTimeout(300)
    const cell = async (rowKey, col) => {
      const l = page.locator(`[data-pane="center"].ssg-body-row[data-row-key="${rowKey}"] [aria-colindex="${col}"]`).first()
      const b = await l.boundingBox()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }
    const st = (l) =>
      page.evaluate((l) => {
        const ed = document.querySelector('.ssg-cell-editor')
        const t = (k) => document.querySelector(`[data-pane="center"].ssg-body-row[data-row-key="${k}"] [aria-colindex="2"]`)?.textContent
        return `${l}: editorOpen=${!!ed} editorValue=${JSON.stringify(ed?.querySelector('input,textarea')?.value ?? null)} active=${JSON.stringify(window.grid?.getActiveCell())} r1=${t(1)} r2=${t(2)} r3=${t(3)} activeEl=${document.activeElement?.className}`
      }, l)
    const out = []
    // 1 回目: 1 行目の品名
    let p = await cell(1, 2)
    await page.mouse.dblclick(p.x, p.y)
    await page.keyboard.press('Control+a')
    await page.keyboard.type('first')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(150)
    out.push(await st('150ms after Enter (saving)'))
    await page.screenshot({ path: path.join(__dirname, `save-${mode}-during.png`) })
    // 保存中に 3 行目を押して打ち始める
    p = await cell(3, 2)
    if (process.env.DBL) await page.mouse.dblclick(p.x, p.y)
    else await page.mouse.click(p.x, p.y)
    await page.waitForTimeout(100)
    out.push(await st((process.env.DBL ? 'dblclicked' : 'clicked') + ' r3 (saving)'))
    if (process.env.DBL) await page.screenshot({ path: path.join(__dirname, `save-${mode}-dbl.png`) })
    await page.keyboard.type('second')
    await page.waitForTimeout(100)
    out.push(await st('typed second (saving)'))
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    out.push(await st('Enter (saving)'))
    // 落ち着くまで
    await page.waitForTimeout(3500)
    out.push(await st('settled'))
    out.push('saves: ' + JSON.stringify(await page.evaluate(() => window.saves)))
    out.push('db: ' + JSON.stringify(await page.evaluate(() => window.db().map((r) => r.name))))
    // 矢印キーのあとで Ctrl+Z
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(300)
    out.push(await st('after Ctrl+Z'))
    console.log(`===== ${mode}`)
    for (const o of out) console.log(o)
    console.log('LOGS', logs.filter((l) => !l.includes('[vite]')).map((l) => l.slice(0, 300)).join('\n'))
    await context.close()
  }
  await browser.close()
})()