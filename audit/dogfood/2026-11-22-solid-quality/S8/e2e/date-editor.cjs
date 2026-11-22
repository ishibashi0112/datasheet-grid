// date エディタの入力(半角・全角・年月日・読めない文字・ネイティブの入力欄・貼り付け・IME)
const { open, shot } = require('./lib.cjs')
const BASE = process.env.BASE ?? 'http://localhost:3508'
const PATH = process.env.PATH_ ?? '/'
;(async () => {
  const { browser, context, page, logs } = await open({ timezoneId: 'Asia/Tokyo', clipboard: true })
  await page.goto(BASE + PATH)
  await page.waitForTimeout(1500)
  const cell = (r) => page.locator(`[data-pane="left"][role="row"][data-row-index="${r}"] [role="gridcell"]`).first()
  const text = async (r) => (await cell(r).textContent()).trim()
  const click = async (r) => { const b = await cell(r).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(100) }
  const editorInfo = () => page.evaluate(() => {
    const ed = document.querySelector('.ssg-cell-editor input, .ssg-cell-editor textarea')
    const msg = [...document.querySelectorAll('.ssg-cell-editor, [role=alert], .ssg-invalid-tooltip, .ssg-tooltip')].map((e) => e.textContent.trim()).filter(Boolean).join(' / ')
    return ed ? `${ed.type}:${ed.value} msg=${msg}` : `(エディタなし) msg=${msg}`
  })
  const cases = [
    ['半角 2026/11/1', '2026/11/1'],
    ['全角 ２０２６／１１／５', '２０２６／１１／５'],
    ['年月日 2026年11月7日', '2026年11月7日'],
    ['ハイフン 2026-11-09', '2026-11-09'],
    ['全角ハイフン ２０２６－１１－１０', '２０２６－１１－１０'],
    ['月/日/年 11/12/2026', '11/12/2026'],
  ]
  let r = 0
  for (const [name, input] of cases) {
    await click(r)
    await page.keyboard.type(input)
    const during = await editorInfo()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(250)
    console.log(`${name}: 打ち中 ${during} → 確定後 ${await text(r)} / ${await editorInfo()}`)
    r++
  }
  // 読めない文字
  for (const bad of ['11/1', '2026/2/30', 'あした']) {
    await click(r)
    await page.keyboard.type(bad)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(250)
    console.log(`読めない ${bad}: ${await editorInfo()} / セル ${await text(r)}`)
    await shot(page, 'date-bad-' + bad.replace(/\//g, '_'))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    console.log(`  Escape 後: ${await editorInfo()} / セル ${await text(r)}`)
  }
  r++
  // ネイティブの入力欄(ダブルクリック)
  {
    const b = await cell(r).boundingBox()
    await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2)
    await page.waitForTimeout(200)
    console.log('ダブルクリック:', await editorInfo())
    await page.keyboard.type('2026')
    await page.keyboard.type('12')
    await page.keyboard.type('24')
    console.log('  打った後:', await editorInfo())
    await page.keyboard.press('Enter')
    await page.waitForTimeout(250)
    console.log(`  確定後 ${await text(r)}`)
    await shot(page, 'date-native')
  }
  r++
  // F2 → ネイティブ → Tab
  {
    await click(r)
    await page.keyboard.press('F2')
    await page.waitForTimeout(150)
    console.log('F2:', await editorInfo())
    await page.keyboard.press('ArrowUp')
    console.log('  ↑:', await editorInfo())
    await page.keyboard.press('Tab')
    await page.waitForTimeout(200)
    console.log(`  Tab 後 ${await text(r)} / アクティブ: ${await page.evaluate(() => document.querySelector('.ssg-bar--bottom')?.textContent.match(/セル \S+/)?.[0])}`)
  }
  r++
  // 貼り付け
  for (const clip of ['2026/11/1', '２０２６／１１／１', '2026年11月3日', '45678']) {
    await click(r)
    await page.evaluate((t) => navigator.clipboard.writeText(t), clip)
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(300)
    const invalid = await cell(r).evaluate((el) => el.className)
    console.log(`貼り付け ${clip}: セル ${await text(r)} class=${invalid}`)
    r++
  }
  // IME(CDP)で全角の日付を打つ
  {
    const cdp = await context.newCDPSession(page)
    await click(r)
    for (const s of ['２', '２０', '２０２６']) await cdp.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length })
    await cdp.send('Input.insertText', { text: '２０２６' })
    await page.waitForTimeout(150)
    console.log('IME 1 回目の確定:', await editorInfo())
    await cdp.send('Input.imeSetComposition', { text: '／１１／２', selectionStart: 5, selectionEnd: 5 })
    await cdp.send('Input.insertText', { text: '／１１／２' })
    await page.waitForTimeout(150)
    console.log('IME 2 回目:', await editorInfo())
    await page.keyboard.press('Enter')
    await page.waitForTimeout(250)
    console.log(`  確定後 ${await text(r)}`)
  }
  console.log(logs.filter((l) => !l.includes('vite') && !l.includes('DevTools')).map((l) => l.slice(0, 300)).join('\n'))
  await browser.close()
})()
