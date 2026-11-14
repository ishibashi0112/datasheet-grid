const { launch, shot, iphone, cdpTap, BASE } = require('./lib.cjs')
const { cellCenter, state, revealColumn } = require('./helpers.cjs')
const MOBILE = process.argv.includes('--mobile')
const tag = MOBILE ? 'm' : 'd'
const btn = async (page, cdp, text) => {
  const b = await page.evaluate((text) => { const e = [...document.querySelectorAll('button')].find((x) => x.textContent === text); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: e.disabled } }, text)
  if (MOBILE) await cdpTap(page, cdp, b.x, b.y); else await page.mouse.click(b.x, b.y)
  return b
}
const tap = async (page, cdp, c) => { if (MOBILE) await cdpTap(page, cdp, c.x, c.y); else await page.mouse.click(c.x, c.y) }
;(async () => {
  const { browser, context, page, logs } = await launch(MOBILE ? { ...iphone(), locale: 'ja-JP' } : { viewport: { width: 1280, height: 800 }, locale: 'ja-JP' })
  const cdp = await context.newCDPSession(page)
  await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
  // 4 行目(室温)を選んで「行を追加」
  let c = await cellCenter(page, 3, 'item'); await tap(page, cdp, c); await page.waitForTimeout(300)
  await btn(page, cdp, '行を追加'); await page.waitForTimeout(600)
  console.log('after 行を追加', await state(page))
  console.log(await shot(page, `19-${tag}-addrow`))
  const opts = await page.evaluate(() => [...document.querySelectorAll('[role=option]')].map((o) => { const b = o.getBoundingClientRect(); return { t: o.textContent, x: b.x + b.width / 2, y: b.y + b.height / 2 } }))
  const ng = opts.find((o) => o.t === '不良')
  if (ng) { await tap(page, cdp, ng); await page.waitForTimeout(400) }
  console.log('picked 不良 on new row', await state(page))
  const rowTexts = await page.evaluate(() => [3, 4, 5, 6].map((vr) => [...document.querySelectorAll(`.ssg-body-row[aria-rowindex="${vr + 2}"]`)].map((r) => r.textContent).join('|')))
  console.log('rows 3-6', rowTexts)
  console.log('summary', await page.evaluate(() => document.querySelector('.app-summary').textContent))
  // 元に戻す ×2
  let u = await btn(page, cdp, '元に戻す'); await page.waitForTimeout(400)
  console.log('undo1 disabled?', u.disabled, await page.evaluate(() => [...document.querySelectorAll('.ssg-body-row[aria-rowindex="6"]')].map((r) => r.textContent).join('|')))
  u = await btn(page, cdp, '元に戻す'); await page.waitForTimeout(400)
  console.log('undo2', await page.evaluate(() => [...document.querySelectorAll('.ssg-body-row[aria-rowindex="6"]')].map((r) => r.textContent).join('|')), await page.evaluate(() => document.querySelector('.ssg-root').innerText.match(/行 \d+ \/ \d+/)[0]))
  // 送信 → 入力漏れの先頭へ
  await btn(page, cdp, '送信'); await page.waitForTimeout(800)
  console.log('submit msg', await page.evaluate(() => document.querySelector('.app-message')?.textContent), await state(page))
  console.log(await shot(page, `19-${tag}-submit`))
  // 不良のみ → 絞り込み解除
  await btn(page, cdp, '不良のみ'); await page.waitForTimeout(600)
  console.log('不良のみ', await page.evaluate(() => document.querySelector('.ssg-root').innerText.match(/行 \d+ \/ \d+/)[0]), await state(page))
  await btn(page, cdp, '絞り込み解除'); await page.waitForTimeout(600)
  console.log('解除', await page.evaluate(() => document.querySelector('.ssg-root').innerText.match(/行 \d+ \/ \d+/)[0]))
  console.log('LOGS\n' + logs.join('\n'))
  await browser.close()
})()
