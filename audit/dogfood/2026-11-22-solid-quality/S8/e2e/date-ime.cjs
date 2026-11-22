// imeDirectInput を付けた表で、IME で全角の日付を打ち始める
const { open, shot } = require('./lib.cjs')
const BASE = process.env.BASE ?? 'http://localhost:3508'
;(async () => {
  const { browser, context, page, logs } = await open({ timezoneId: 'Asia/Tokyo' })
  await page.goto(BASE + (process.env.PATH_ ?? '/'))
  await page.waitForTimeout(1500)
  const cdp = await context.newCDPSession(page)
  const cell = (r) => page.locator(`[data-pane="left"][role="row"][data-row-index="${r}"] [role="gridcell"]`).first()
  const text = async (r) => (await cell(r).textContent()).trim()
  const click = async (r) => { const b = await cell(r).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(150) }
  const editorInfo = () => page.evaluate(() => {
    const ed = document.querySelector('.ssg-cell-editor input, .ssg-cell-editor textarea')
    const msg = [...document.querySelectorAll('.ssg-cell-editor')].map((e) => e.textContent.trim()).filter(Boolean).join(' / ')
    return ed ? `${ed.type}:${ed.value}${msg ? ' msg=' + msg : ''}` : '(エディタなし)'
  })
  const ime = async (s) => {
    for (let i = 1; i <= s.length; i++) await cdp.send('Input.imeSetComposition', { text: s.slice(0, i), selectionStart: i, selectionEnd: i })
    await cdp.send('Input.insertText', { text: s })
    await page.waitForTimeout(150)
  }
  const cases = [['２０２６／１１／５'], ['２０２６年１１月７日'], ['２０２６', '／１１／９'], ['１１／１'], ['２０２６－１１－１０']]
  let r = 0
  for (const parts of cases) {
    await click(r)
    for (const p of parts) await ime(p)
    const during = await editorInfo()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(250)
    console.log(`IME ${parts.join(' + ')}: 打ち中 ${during} → 確定後 セル ${await text(r)} / ${await editorInfo()}`)
    if (await page.locator('.ssg-cell-editor').count()) { await shot(page, 'date-ime-bad'); await page.keyboard.press('Escape'); await page.waitForTimeout(150) }
    r++
  }
  console.log(logs.filter((l) => !l.includes('vite') && !l.includes('DevTools')).map((l) => l.slice(0, 300)).join('\n'))
  await browser.close()
})()
