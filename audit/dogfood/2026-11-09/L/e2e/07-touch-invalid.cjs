const { launch, shot, iphone, cdpTap, BASE } = require('./lib.cjs')
const { cellCenter, state, revealColumn, revealRow } = require('./helpers.cjs')
;(async () => {
  const { browser, context, page, logs } = await launch({ ...iphone(), locale: 'ja-JP' })
  const cdp = await context.newCDPSession(page)
  await page.goto(BASE)
  await page.waitForSelector('.ssg-body-row')
  await page.waitForTimeout(800)
  // 不良でメモが空の行を探す(row 17 = view 15 は不良 + メモ 交換が必要…)。不良 + 写真なし を探す
  const target = await page.evaluate(() => {
    for (const r of document.querySelectorAll('.ssg-body-row[data-pane=center]')) {
      const c = r.querySelector('[data-ssg-col-key=photo].ssg-body-cell--invalid')
      if (c) return Number(r.getAttribute('aria-rowindex')) - 2
    }
    return null
  })
  console.log('invalid photo row view', target)
  await revealRow(page, target)
  await revealColumn(page, 'photo', target)
  const c = await cellCenter(page, target, 'photo')
  const attrs = await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y).closest('.ssg-body-cell'); return [...e.attributes].map((a) => `${a.name}=${a.value.slice(0, 60)}`) }, c)
  console.log('invalid cell attrs', attrs)
  // チェックボックスの外側(セルの右上寄り)をタップ
  await cdpTap(page, cdp, c.x + 26, c.y - 8)
  await page.waitForTimeout(1200)
  const tip = await page.evaluate(() => [...document.body.querySelectorAll('[role=tooltip], .ssg-tooltip, [class*=tooltip]')].map((e) => ({ cls: e.className, t: e.textContent, vis: getComputedStyle(e).visibility, op: getComputedStyle(e).opacity })))
  console.log('tooltip after tap', tip, await state(page))
  console.log(await shot(page, '07-iphone-invalid-tap'))
  // 長押し
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x + 26, y: c.y - 8 }] })
  await page.waitForTimeout(1200)
  const tip2 = await page.evaluate(() => [...document.body.querySelectorAll('[role=tooltip], .ssg-tooltip, [class*=tooltip]')].map((e) => ({ cls: e.className, t: e.textContent, vis: getComputedStyle(e).visibility, op: getComputedStyle(e).opacity })))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  console.log('tooltip during long press', tip2)
  console.log('LOGS\n' + logs.join('\n'))
  await browser.close()
})()
