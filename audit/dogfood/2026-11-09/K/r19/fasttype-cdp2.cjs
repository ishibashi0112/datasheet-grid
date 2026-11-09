// CDP でキーを待たずに続けて送る(バーコードリーダー相当: 数 ms 間隔で「値 + Enter」)
const { chromium } = require('playwright')
const BASE = process.env.BASE ?? 'http://localhost:5411'
const COL = process.env.COL ?? 'note'
function keyEvents(ch) {
  if (ch === '\n') return [
    { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
    { type: 'char', key: 'Enter', text: '\r', unmodifiedText: '\r' },
    { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
  ]
  const upper = ch.toUpperCase()
  const isDigit = /[0-9]/.test(ch)
  const code = isDigit ? `Digit${ch}` : `Key${upper}`
  const vk = upper.charCodeAt(0)
  return [
    { type: 'keyDown', key: ch, code, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk },
    { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk },
  ]
}
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  const cdp = await page.context().newCDPSession(page)
  const logs = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()) })
  const out = []
  const gapMs = Number(process.env.GAP ?? 0)
  for (let iter = 0; iter < Number(process.env.ITER ?? 10); iter++) {
    await page.goto(BASE + (process.env.PAGE ?? '/'), { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-pane="center"].ssg-body-row')
    const cell = (r) => page.locator(`.ssg-body-row[data-row-index="${r}"] [data-ssg-col-key="${COL}"]`).first()
    await cell(0).click()
    const values = Array.from({ length: 6 }, (_, i) => `${4900 + iter * 10 + i}`)
    const text = values.map((v) => v + '\n').join('')
    const sends = []
    for (const ch of text) {
      for (const ev of keyEvents(ch)) sends.push(cdp.send('Input.dispatchKeyEvent', ev))
      if (gapMs) await new Promise((r) => setTimeout(r, gapMs))
    }
    await Promise.all(sends)
    await page.waitForTimeout(400)
    const got = []
    for (let r = 0; r < 7; r++) got.push(await cell(r).innerText())
    out.push({ iter, ok: values.every((v, i) => got[i] === v), values, got })
  }
  console.log(JSON.stringify({ gapMs, col: COL, ok: out.filter((o) => o.ok).length, total: out.length, fails: out.filter((o) => !o.ok).slice(0, 4), logs }, null, 1))
  await browser.close()
})()
