const { launch, shot, BASE } = require('./lib.cjs')
const { state } = require('./helpers.cjs')
const focusDesc = (page) => page.evaluate(() => {
  const e = document.activeElement
  const outline = e ? getComputedStyle(e).outlineStyle + ' ' + getComputedStyle(e).outlineWidth + ' ' + getComputedStyle(e).outlineColor : ''
  const after = e ? getComputedStyle(e, '::after') : null
  return { tag: e?.tagName, cls: (e?.className || '').toString().slice(0, 50), name: e?.getAttribute('aria-label') || e?.textContent?.trim().slice(0, 20) || e?.getAttribute('placeholder'), outline, after: after ? `${after.content} ${after.outlineStyle} ${after.boxShadow?.slice(0, 40)} ${after.borderStyle}` : '', attrs: e ? { ad: e.getAttribute('aria-activedescendant'), kbd: e.getAttribute('data-ssg-pointer'), hasActive: e.getAttribute('data-ssg-has-active-cell') } : null }
})
;(async () => {
  const { browser, page, logs } = await launch({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' })
  await page.goto(BASE)
  await page.waitForSelector('.ssg-body-row')
  await page.waitForTimeout(800)
  // 点検者の入力欄から Tab で進む
  await page.focus('input[name=inspector]')
  const seq = []
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(150)
    const f = await focusDesc(page)
    seq.push(f)
    if (f.cls.includes('ssg-shell')) { await shot(page, '08-kbd-shell-focus'); break }
  }
  console.log('Tab sequence', seq.map((f) => `${f.tag}.${f.cls.split(' ')[0]}「${f.name}」 outline=${f.outline} after=${f.after}`).join('\n'))
  console.log('shell attrs', seq[seq.length - 1].attrs)
  // 最初の矢印
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  console.log('after first ArrowDown', await state(page))
  await shot(page, '08-kbd-first-arrow')
  // いろいろなキー
  const keys = ['ArrowRight', 'ArrowRight', 'End', 'Home', 'Control+End', 'Control+Home', 'PageDown', 'PageDown', 'PageUp', 'Control+ArrowDown', 'Control+ArrowUp']
  for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(250); const s = await state(page); console.log(k, s.activeCell, 'sel', s.selectedCount) }
  // Alt+↓ で列メニュー
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150)
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150)
  await page.keyboard.press('Alt+ArrowDown'); await page.waitForTimeout(500)
  console.log('Alt+Down focus', await focusDesc(page))
  await shot(page, '08-kbd-colmenu')
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100)
  console.log('menu ↓', await focusDesc(page))
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  console.log('menu Esc', await focusDesc(page), (await state(page)).activeCell)
  // Alt+↓ → フィルター… → popover
  await page.keyboard.press('Alt+ArrowDown'); await page.waitForTimeout(400)
  await page.keyboard.press('Enter'); await page.waitForTimeout(1000)
  console.log('filter popover focus', await focusDesc(page))
  await shot(page, '08-kbd-filter')
  const tabs = []
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(80); const f = await focusDesc(page); tabs.push(`${f.tag}「${f.name}」`) }
  console.log('Tab in popover', tabs.join(' → '))
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  console.log('popover Esc', await focusDesc(page))
  // 編集
  await page.keyboard.press('Enter'); await page.waitForTimeout(300)
  console.log('Enter on result col', await state(page))
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
  console.log('select via keys', await state(page))
  // Tab で行の端まで行って外へ
  const outs = []
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(100); const f = await focusDesc(page); const s = await state(page); outs.push(`${f.tag}.${f.cls.split(' ')[0]} ${s.activeCell?.key ?? ''}`); if (!f.cls.includes('ssg-shell')) break }
  console.log('Tab to exit', outs.join(' → '))
  await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(300)
  console.log('Shift+Tab back', await focusDesc(page), (await state(page)).activeCell)
  await shot(page, '08-kbd-back-in')
  console.log('LOGS\n' + logs.join('\n'))
  await browser.close()
})()
