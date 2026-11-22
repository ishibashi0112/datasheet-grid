// 半角で打ち始めて(文字の入力欄で開く)、続きを全角で入れる
const { open } = require('./lib.cjs')
const BASE = process.env.BASE ?? 'http://localhost:3508'
;(async () => {
  const { browser, page, logs } = await open({ timezoneId: 'Asia/Tokyo' })
  await page.goto(BASE + (process.env.PATH_ ?? '/'))
  await page.waitForTimeout(1500)
  const cell = (r) => page.locator(`[data-pane="left"][role="row"][data-row-index="${r}"] [role="gridcell"]`).first()
  const text = async (r) => (await cell(r).textContent()).trim()
  let r = 0
  for (const [first, rest] of [['2', '０２６／１１／５'], ['2', '０２６年１１月１４日'], ['2', '０２６．１１．１５'], ['2', '０２６－１１－１６'], ['2', '026/11/17 10:00']]) {
    const b = await cell(r).boundingBox(); await page.mouse.click(b.x + 20, b.y + 10); await page.waitForTimeout(100)
    await page.keyboard.type(first)
    await page.keyboard.insertText(rest)
    const v = await page.evaluate(() => document.querySelector('.ssg-cell-editor input')?.value)
    await page.keyboard.press('Enter'); await page.waitForTimeout(250)
    const ed = await page.evaluate(() => document.querySelector('.ssg-cell-editor')?.textContent.trim())
    console.log(`${first}${rest}: 入力欄 ${v} → セル ${await text(r)}${ed !== undefined ? ' / 開いたまま: ' + ed : ''}`)
    if (ed !== undefined) { await page.keyboard.press('Escape'); await page.waitForTimeout(100) }
    r++
  }
  console.log(logs.filter((l) => !l.includes('vite') && !l.includes('DevTools')).join('\n'))
  await browser.close()
})()
