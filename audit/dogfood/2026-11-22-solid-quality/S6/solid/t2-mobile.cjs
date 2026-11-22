// スマホ(iPhone 13 相当を Chromium で)のタッチ操作
const { launch, BASE, devices, texts, active, cell } = require('./lib.cjs')
const dev = process.env.DEV ?? 'iPhone 13'
;(async () => {
  const d = { ...devices[dev] }; delete d.defaultBrowserType
  const { browser, page, logs } = await launch({ ...d, deviceScaleFactor: 1 })
  const cdp = await page.context().newCDPSession(page)
  const swipe = async (x, y, dx, dy, steps = 8) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }] }); await page.waitForTimeout(16) }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(400)
  }
  const reveal = async (key) => { await page.evaluate((k) => { const s = document.querySelector('.ssg-scroll-container'); const c = document.querySelector(`.ssg-body-row [data-ssg-col-key="${k}"]`); s.scrollLeft = Math.max(0, parseFloat(c.style.left) - 4) }, key); await page.waitForTimeout(400) }
  const out = { push: (x) => console.log(JSON.stringify(x)) }
  await page.goto(BASE)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `shot-m-${process.env.TAG ?? ""}${dev}-1.png` })
  const sc = () => page.evaluate(() => { const s = document.querySelector('.ssg-scroll-container'); return [Math.round(s.scrollTop), Math.round(s.scrollLeft)] })
  const vp = page.viewportSize()
  // 縦スワイプ / 横スワイプ
  await swipe(vp.width / 2, vp.height * 0.7, 0, -250)
  out.push(['swipe up', await sc(), await page.evaluate(() => document.querySelectorAll('[aria-selected="true"]').length), await active(page)])
  await swipe(vp.width * 0.8, vp.height * 0.6, -200, 0)
  out.push(['swipe left', await sc(), await page.evaluate(() => document.querySelectorAll('[aria-selected="true"]').length)])
  await swipe(vp.width / 2, vp.height * 0.4, 0, 400)
  await swipe(vp.width * 0.4, vp.height * 0.6, 300, 0)
  out.push(['back', await sc()])
  // タップで選択
  const itemCell = cell(page, 1, 'item')
  let b = await itemCell.boundingBox()
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(400)
  out.push(['tap', await active(page)])
  // ダブルタップで編集
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(80)
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(400)
  out.push(['double tap', await page.evaluate(() => { const e = document.activeElement; return [e?.tagName, e?.className, e?.value, getComputedStyle(e).fontSize] })])
  await page.screenshot({ path: `shot-m-${process.env.TAG ?? ""}${dev}-edit.png` })
  await page.keyboard.press('End'); await page.keyboard.type('X'); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
  out.push(['edited', await itemCell.textContent()])
  // select(結果)をダブルタップ → 候補をタップ
  const resCell = cell(page, 2, 'result')
  await reveal('result')
  b = await resCell.boundingBox()
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(80)
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(500)
  const opts = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((o) => [o.textContent.trim(), Math.round(o.getBoundingClientRect().height)]))
  out.push(['select options', JSON.stringify(opts)])
  await page.screenshot({ path: `shot-m-${process.env.TAG ?? ""}${dev}-select.png` })
  const opt = page.locator('[role="option"]', { hasText: '不良' }).first()
  if (await opt.count()) { const ob = await opt.boundingBox(); await page.touchscreen.tap(ob.x + ob.width / 2, ob.y + ob.height / 2); await page.waitForTimeout(400) }
  out.push(['select result', await resCell.textContent()])
  // checkbox(写真)をタップ(横にスクロールが要るかも)
  const ph = cell(page, 2, 'photo')
  await reveal('photo')
  const ck = () => ph.locator('[role=checkbox]').getAttribute('aria-checked')
  const before = await ck()
  b = await ph.boundingBox()
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(400)
  out.push(['checkbox tap', before, await ck(), await active(page)])
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(400)
  out.push(['checkbox tap2', await ck(), await active(page)])
  // 列メニュー(⋮ は常に見える)→ フィルター
  await reveal('result')
  const menuBtn = page.locator('[role="columnheader"][data-ssg-col-key="result"] button[aria-haspopup="menu"]').first()
  const mo = await menuBtn.evaluate((e) => getComputedStyle(e).opacity)
  b = await menuBtn.boundingBox()
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(500)
  const items = await page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].map((e) => [e.textContent.trim(), Math.round(e.getBoundingClientRect().height)]))
  out.push(['col menu', mo, JSON.stringify(items.slice(0, 4))])
  await page.screenshot({ path: `shot-m-${process.env.TAG ?? ""}${dev}-menu.png` })
  const fi = page.locator('[role="menu"] [role^="menuitem"]', { hasText: 'フィルター' }).first()
  b = await fi.boundingBox({ timeout: 3000 })
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(600)
  const pop = await page.evaluate(() => { const p = document.querySelector('.ssg-filter-popover'); const r = p?.getBoundingClientRect(); return p ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), focus: document.activeElement?.tagName + '.' + document.activeElement?.className, inputFont: getComputedStyle(p.querySelector('input')).fontSize, optH: Math.round(p.querySelector('.ssg-filter-option')?.getBoundingClientRect().height ?? 0) } : null })
  out.push(['filter popover', JSON.stringify(pop), JSON.stringify(vp)])
  await page.screenshot({ path: `shot-m-${process.env.TAG ?? ""}${dev}-filter.png` })
  // 候補「良」を外す
  const o2 = page.locator('.ssg-filter-popover .ssg-filter-option', { hasText: '良' }).first()
  b = await o2.boundingBox()
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(400)
  const btn = page.locator('.ssg-filter-popover .ssg-filter-btn-primary')
  b = await btn.boundingBox()
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(500)
  out.push(['after filter', await texts(page, '.ssg-bar--top .ssg-bar-chip')])
  await page.screenshot({ path: `shot-m-${process.env.TAG ?? ""}${dev}-filtered.png` })
  // 下部バー
  out.push(['bottom bar', await page.evaluate(() => { const b = document.querySelector('.ssg-bar--bottom'); const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), b.scrollWidth, b.clientWidth, document.documentElement.scrollWidth] })])
  // 展開トグルをタップ → カードの入力欄をタップ
  const tg = page.locator('.ssg-body-row[data-row-index="0"] button[aria-expanded]').first()
  b = await tg.boundingBox()
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(500)
  const inp = page.locator('[data-testid="detail-card"] input').first()
  b = await inp.boundingBox()
  out.push(['card', b && [Math.round(b.x), Math.round(b.y), Math.round(b.width)]])
  if (b) { await page.touchscreen.tap(b.x + 10, b.y + b.height / 2); await page.waitForTimeout(300); out.push(['card focus', await page.evaluate(() => document.activeElement?.tagName + ' ' + document.activeElement?.value)]) }
  await page.screenshot({ path: `shot-m-${process.env.TAG ?? ""}${dev}-card.png` })
  // 横向き
  await page.setViewportSize({ width: vp.height, height: vp.width }); await page.waitForTimeout(800)
  out.push(['landscape', await page.evaluate(() => { const r = document.querySelector('.ssg-root').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), document.documentElement.scrollWidth, innerWidth] })])
  await page.screenshot({ path: `shot-m-${process.env.TAG ?? ""}${dev}-landscape.png` })
  
  console.log(logs.join('\n'))
  await browser.close()
})()
