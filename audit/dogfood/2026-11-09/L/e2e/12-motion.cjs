const { launch, shot, BASE } = require('./lib.cjs')
const { cellCenter } = require('./helpers.cjs')
async function probe(page, label) {
  const r = await page.evaluate(() => {
    const root = document.querySelector('.ssg-root')
    const cs = getComputedStyle(root)
    const overlay = document.querySelector('.ssg-active-cell-overlay, [class*=active-cell]')
    const ocs = overlay ? getComputedStyle(overlay) : null
    const rows = [...document.querySelectorAll('.ssg-body-row')].slice(0, 3).map((r) => getComputedStyle(r).transitionDuration)
    return { rootCls: root.className, fast: cs.getPropertyValue('--ssg-motion-fast'), base: cs.getPropertyValue('--ssg-motion-base'), slow: cs.getPropertyValue('--ssg-motion-slow'), overlay: overlay ? { cls: overlay.className, td: ocs.transitionDuration, tp: ocs.transitionProperty.slice(0, 60) } : null, rowTd: rows }
  })
  console.log(label, JSON.stringify(r))
}
async function portalProbe(page, label) {
  const r = await page.evaluate(() => [...document.body.children].filter((e) => e.id !== 'root' && e.className).map((e) => ({ cls: e.className, an: getComputedStyle(e).animationName, ad: getComputedStyle(e).animationDuration, td: getComputedStyle(e).transitionDuration })))
  console.log(label, JSON.stringify(r))
}
;(async () => {
  for (const reduce of ['no-preference', 'reduce']) {
    const { browser, page, logs } = await launch({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP', reducedMotion: reduce })
    await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
    const c = await cellCenter(page, 2, 'item'); await page.mouse.click(c.x, c.y); await page.waitForTimeout(300)
    await probe(page, `[${reduce}] initial`)
    // 矢印で動かした直後(transition 中か)
    await page.keyboard.press('ArrowDown')
    const mid = await page.evaluate(() => { const o = document.querySelector('[class*=active-cell]'); return o ? getComputedStyle(o).transform + ' ' + o.getAnimations().length : null })
    console.log(`[${reduce}] right after ArrowDown: transform/animations`, mid)
    // 列メニュー
    const k = await page.evaluate(() => { const h = [...document.querySelectorAll('[role=columnheader]')].find((e) => e.textContent.includes('結果')); const r = h.querySelector('button').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
    await page.mouse.move(k.x - 30, k.y); await page.waitForTimeout(200); await page.mouse.click(k.x, k.y); await page.waitForTimeout(30)
    await portalProbe(page, `[${reduce}] menu open`)
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    // 並び替え(行のアニメ)
    const h = await page.evaluate(() => { const e = [...document.querySelectorAll('[role=columnheader]')].find((x) => x.textContent.includes('測定値')); const b = e.getBoundingClientRect(); return { x: b.x + b.width - 40, y: b.y + b.height / 2 } })
    await page.keyboard.down('Shift'); await page.mouse.click(h.x, h.y); await page.keyboard.up('Shift')
    await page.waitForTimeout(40)
    const anim = await page.evaluate(() => { const rows = [...document.querySelectorAll('.ssg-body-row')]; return { animating: rows.filter((r) => r.getAnimations().length > 0 || (getComputedStyle(r).transform !== 'none' && getComputedStyle(r).transform !== 'matrix(1, 0, 0, 1, 0, 0)')).length, total: rows.length, anyCellAnims: document.getAnimations().length } })
    console.log(`[${reduce}] 40ms after sort`, anim)
    // コピーの点線
    await page.mouse.click(c.x, c.y); await page.keyboard.press('Control+c'); await page.waitForTimeout(200)
    const copy = await page.evaluate(() => { const o = document.querySelector('.ssg-copy-range-overlay'); if (!o) return null; const all = [o, ...o.querySelectorAll('*')]; return all.map((e) => `${e.className?.baseVal ?? e.className}:${getComputedStyle(e).animationName}/${getComputedStyle(e).animationDuration}/${getComputedStyle(e).animationPlayState}`).join(' ; ') })
    console.log(`[${reduce}] copy overlay`, copy)
    await browser.close()
  }
  // 実行中に OS の設定を変えたとき
  const { browser, page } = await launch({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' })
  await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
  await probe(page, '[runtime] before')
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(300)
  await probe(page, '[runtime] after emulateMedia reduce')
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForTimeout(300)
  await probe(page, '[runtime] back to no-preference')
  await browser.close()
})()
