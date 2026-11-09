// Tab で右へ打ち進める版: 行 0 の 6 列へ「値 + Tab」を GAP ms 間隔で続けて送る
const { chromium } = require('playwright')
const BASE = process.env.BASE ?? 'http://localhost:5411'
function keyEvents(ch) {
  if (ch === '\t') return [
    { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
    { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
  ]
  const vk = ch.charCodeAt(0)
  return [
    { type: 'keyDown', key: ch, code: `Digit${ch}`, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk },
    { type: 'keyUp', key: ch, code: `Digit${ch}`, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk },
  ]
}
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  const cdp = await page.context().newCDPSession(page)
  const gapMs = Number(process.env.GAP ?? 0)
  const keys = ['code', 'c1', 'c2', 'c3', 'c4', 'c5']
  const out = []
  for (let iter = 0; iter < Number(process.env.ITER ?? 6); iter++) {
    await page.goto(BASE + '/repro.html?cols=6', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-pane="center"].ssg-body-row')
    const cell = (k) => page.locator(`.ssg-body-row[data-row-index="0"] [data-ssg-col-key="${k}"]`).first()
    await cell('code').click()
    const values = keys.map((_, i) => `${10 + iter}${i}`)
    const text = values.map((v) => v + '\t').join('')
    const sends = []
    for (const ch of text) {
      for (const ev of keyEvents(ch)) sends.push(cdp.send('Input.dispatchKeyEvent', ev))
      if (gapMs) await new Promise((r) => setTimeout(r, gapMs))
    }
    await Promise.all(sends)
    await page.waitForTimeout(400)
    const got = []
    for (const k of keys) got.push(await cell(k).innerText())
    out.push({ ok: values.every((v, i) => got[i] === v), values, got })
  }
  console.log(JSON.stringify({ gapMs, ok: out.filter((o) => o.ok).length, total: out.length, fails: out.filter((o) => !o.ok).slice(0, 3) }))
  await browser.close()
})()
