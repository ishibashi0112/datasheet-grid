const { launch, shot, iphone, cdpTap, cdpTouchDrag, BASE } = require('./lib.cjs')
const { cellCenter, state, revealColumn } = require('./helpers.cjs')
const rectOf = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => { const b = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 30), x: b.x + b.width / 2, y: b.y + b.height / 2, w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) } }), sel)
const geom = (page) => page.evaluate(() => {
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] }
  const sc = document.querySelector('.ssg-scroll-container')
  return { vw: innerWidth, vh: innerHeight, root: r(document.querySelector('.ssg-root')), scroll: r(sc), sch: sc.clientHeight, scw: sc.clientWidth, rows: document.querySelectorAll('.ssg-body-row[data-pane=center]').length, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, top: sc.scrollTop, left: sc.scrollLeft }
})
;(async () => {
  const { browser, context, page, logs } = await launch({ ...iphone(), locale: 'ja-JP' })
  const cdp = await context.newCDPSession(page)
  await page.goto(BASE)
  await page.waitForSelector('.ssg-body-row')
  await page.waitForTimeout(800)
  // 行番号のタップ
  let rn = (await rectOf(page, '.ssg-body-row[aria-rowindex="4"] .ssg-row-header-cell'))[0]
  await cdpTap(page, cdp, rn.x, rn.y)
  await page.waitForTimeout(400)
  console.log('tap row number 3', await state(page))
  // 列見出しのタップ
  const hdr = (await rectOf(page, '[role=columnheader]')).find((h) => h.t.startsWith('項目'))
  await cdpTap(page, cdp, hdr.x - 30, hdr.y)
  await page.waitForTimeout(400)
  console.log('tap header 項目', await state(page))
  // セルを選んでから、長押し(ドラッグなし)
  let c = await cellCenter(page, 5, 'item')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] })
  await page.waitForTimeout(900)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(400)
  console.log('long press item r6', await state(page))
  // 2 つの別のセルを素早くタップ(編集にならないこと)
  const a = await cellCenter(page, 1, 'item'); const b = await cellCenter(page, 2, 'item')
  await cdpTap(page, cdp, a.x, a.y); await page.waitForTimeout(100); await cdpTap(page, cdp, b.x, b.y); await page.waitForTimeout(500)
  console.log('quick taps on 2 cells', await state(page))
  // 編集中にスワイプ
  await revealColumn(page, 'memo', 3)
  c = await cellCenter(page, 3, 'memo')
  await cdpTap(page, cdp, c.x, c.y); await page.waitForTimeout(120); await cdpTap(page, cdp, c.x, c.y); await page.waitForTimeout(500)
  await page.keyboard.insertText('スワイプ中')
  const edBefore = (await rectOf(page, '.ssg-cell-editor'))[0]
  const sc = (await rectOf(page, '.ssg-scroll-container'))[0]
  await cdpTouchDrag(page, cdp, { x: sc.left + 250, y: sc.top + 250 }, { x: sc.left + 250, y: sc.top + 120 }, 10)
  await page.waitForTimeout(600)
  const edAfter = (await rectOf(page, '.ssg-cell-editor'))[0]
  const cellAfter = await cellCenter(page, 3, 'memo')
  console.log('swipe while editing: editor before', edBefore && [edBefore.top, edBefore.bottom], 'after', edAfter && [edAfter.top, edAfter.bottom], 'cell after', cellAfter && [cellAfter.y - cellAfter.h / 2], await state(page))
  console.log(await shot(page, '05-iphone-swipe-editing'))
  // 確定させる(別のセルをタップ)
  c = await cellCenter(page, 8, 'memo') || await cellCenter(page, 10, 'memo')
  if (c) { await cdpTap(page, cdp, c.x, c.y); await page.waitForTimeout(400) }
  console.log('after commit', await state(page), await page.evaluate(() => { for (const r of document.querySelectorAll('.ssg-body-row[aria-rowindex="5"]')) { const c = r.querySelector('[data-ssg-col-key=memo]'); if (c) return c.textContent } return 'not rendered' }))
  // ---- 回転(縦 → 横)
  await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTo({ top: 3000 }))
  await page.waitForTimeout(400)
  c = await cellCenter(page, 90, 'item')
  if (c) { await cdpTap(page, cdp, c.x, c.y); await page.waitForTimeout(300) }
  console.log('portrait', await geom(page), await state(page))
  await page.setViewportSize({ width: 664, height: 390 })
  await page.waitForTimeout(800)
  console.log('landscape', await geom(page), await state(page))
  console.log(await shot(page, '05-iphone-landscape'))
  await page.setViewportSize({ width: 390, height: 664 })
  await page.waitForTimeout(800)
  console.log('portrait again', await geom(page), await state(page))
  console.log(await shot(page, '05-iphone-portrait-again'))
  console.log('LOGS\n' + logs.join('\n'))
  await browser.close()
})()
