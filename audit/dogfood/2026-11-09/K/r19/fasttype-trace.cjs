const { chromium } = require('playwright')
const BASE = 'http://localhost:5411'
function keyEvents(ch) {
  if (ch === '\n') return [
    { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
    { type: 'char', key: 'Enter', text: '\r', unmodifiedText: '\r' },
    { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
  ]
  const vk = ch.charCodeAt(0)
  return [
    { type: 'keyDown', key: ch, code: `Digit${ch}`, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk },
    { type: 'keyUp', key: ch, code: `Digit${ch}`, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk },
  ]
}
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const cdp = await page.context().newCDPSession(page)
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-pane="center"].ssg-body-row')
  await page.locator('.ssg-body-row[data-row-index="0"] [data-ssg-col-key="note"]').first().click()
  await page.evaluate(() => {
    const t0 = performance.now()
    window.__trace = []
    const desc = (el) => !el ? 'null' : el === document.body ? 'body' : (el.className || el.tagName).toString().slice(0, 30)
    for (const type of ['keydown', 'keyup', 'input', 'focusin', 'focusout']) {
      window.addEventListener(type, (e) => window.__trace.push(`${(performance.now() - t0).toFixed(1)} ${type} ${e.key ?? e.data ?? ''} tgt=${desc(e.target)} act=${desc(document.activeElement)} prevented=${e.defaultPrevented}`), true)
    }
    let f = 0
    const raf = () => { window.__trace.push(`${(performance.now() - t0).toFixed(1)} --frame ${f++}`); if (f < 60) requestAnimationFrame(raf) }
    requestAnimationFrame(raf)
  })
  const gap = Number(process.env.GAP ?? 50)
  const sends = []
  for (const ch of (process.env.SEQ ?? '12\n34\n56\n').replace(/\\n/g, '\n')) {
    for (const ev of keyEvents(ch)) sends.push(cdp.send('Input.dispatchKeyEvent', ev))
    await new Promise((r) => setTimeout(r, gap))
  }
  await Promise.all(sends)
  await page.waitForTimeout(300)
  const trace = await page.evaluate(() => window.__trace)
  console.log(trace.filter((l) => !/--frame/.test(l) || true).join('\n'))
  const got = []
  for (let r = 0; r < 4; r++) got.push(await page.locator(`.ssg-body-row[data-row-index="${r}"] [data-ssg-col-key="note"]`).first().innerText())
  console.log('GOT', JSON.stringify(got))
  await browser.close()
})()
