// TZ がずれた SSR の後、固定列(日付)のセルを編集すると、どの行が変わるか
const { open, shot } = require('./lib.cjs')
const enc = encodeURIComponent
;(async () => {
  const { browser, page, logs } = await open({ timezoneId: process.env.BTZ ?? 'Pacific/Honolulu' })
  const f = enc(JSON.stringify({ createdAt: { kind: 'dateSet', condition: { mode: 'range', from: '2026-11-01', to: '2026-11-03' }, set: null } }))
  await page.goto(`http://localhost:3508/?f=${f}`)
  await page.waitForTimeout(1500)
  const rowText = () => page.evaluate(() => {
    const out = []
    for (const pane of ['left', 'center']) {
      const r = document.querySelector(`[data-pane="${pane}"][role="row"][data-row-index="0"]`)
      out.push(pane + ': ' + (r ? r.textContent : '(none)'))
    }
    return out
  })
  console.log('before', await rowText())
  // 1 行目の日付のセル(固定列)をクリックして 2026/12/24 と打つ
  const cell = page.locator('[data-pane="left"][role="row"][data-row-index="0"] [role="gridcell"]').first()
  const box = await cell.boundingBox()
  console.log('cell box', box)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(200)
  console.log('active:', await page.evaluate(() => document.querySelector('.ssg-root')?.textContent.match(/セル [^ ]+/)?.[0]))
  await page.keyboard.type('2026/12/24')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  console.log('after', await rowText())
  await shot(page, 'tz-edit-after')
  // CSV で何が保存されているか: 12/24 の行
  const csv = await page.evaluate(() => new Promise((resolve) => {
    const orig = URL.createObjectURL
    URL.createObjectURL = (blob) => { blob.text().then(resolve); return orig.call(URL, blob) }
    ;[...document.querySelectorAll('.toolbar button')].find((b) => b.textContent === 'CSV').click()
  }))
  console.log('csv rows with 2026-12-24:', csv.split('\n').filter((l) => l.includes('2026-12-24') || l.includes('2026/12/24')))
  console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.slice(0, 200)).join('\n'))
  await browser.close()
})()
