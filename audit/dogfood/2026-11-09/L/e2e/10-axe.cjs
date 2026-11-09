const fs = require('fs')
const path = require('path')
const { launch, shot, iphone, BASE } = require('./lib.cjs')
const { cellCenter, state, revealColumn, revealRow } = require('./helpers.cjs')
const axeSrc = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
const all = {}
async function runAxe(page, label, context) {
  await page.evaluate(axeSrc)
  const res = await page.evaluate(async (context) => {
    const r = await window.axe.run(context || document, { resultTypes: ['violations', 'incomplete'] })
    const pick = (v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 160), why: (n.any.concat(n.all, n.none).map((c) => c.message).join(' | ')).slice(0, 220) })) })
    return { violations: r.violations.map(pick), incomplete: r.incomplete.map((v) => ({ id: v.id, n: v.nodes.length })) }
  }, context)
  all[label] = res
  console.log(`\n=== ${label}: ${res.violations.length} violations`)
  for (const v of res.violations) {
    console.log(`- ${v.id} [${v.impact}] x${v.n}: ${v.help}`)
    for (const n of v.nodes) console.log(`    ${n.target}\n      ${n.html}\n      → ${n.why}`)
  }
  console.log('  incomplete:', res.incomplete.map((i) => `${i.id}x${i.n}`).join(', '))
}
async function openColMenu(page, title) {
  const k = await page.evaluate((title) => { const h = [...document.querySelectorAll('[role=columnheader]')].find((e) => e.textContent.includes(title)); const r = h.querySelector('button').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, title)
  // ⋮ はホバーで出る
  await page.mouse.move(k.x - 30, k.y); await page.waitForTimeout(200)
  await page.mouse.click(k.x, k.y); await page.waitForTimeout(500)
}
async function clickMenu(page, text) {
  const it = await page.evaluate((text) => { const e = [...document.querySelectorAll('.ssg-menu-item')].find((m) => m.textContent.includes(text)); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, text)
  await page.mouse.click(it.x, it.y); await page.waitForTimeout(1000)
}
;(async () => {
  const { browser, page, logs } = await launch({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' })
  await page.goto(BASE)
  await page.waitForSelector('.ssg-body-row')
  await page.waitForTimeout(800)
  await runAxe(page, 'desktop-initial')
  // セルを選んだ状態
  let c = await cellCenter(page, 2, 'item'); await page.mouse.click(c.x, c.y); await page.waitForTimeout(300)
  await runAxe(page, 'desktop-active-cell')
  // 列メニュー
  await openColMenu(page, '結果')
  await runAxe(page, 'column-menu')
  // set フィルター
  await clickMenu(page, 'フィルター…')
  await runAxe(page, 'set-filter-popover')
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  // numberSet フィルター
  await openColMenu(page, '測定値'); await clickMenu(page, 'フィルター…')
  await runAxe(page, 'numberSet-filter-popover'); await shot(page, '10-numberset-filter')
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  // dateSet フィルター
  await openColMenu(page, '点検日'); await clickMenu(page, 'フィルター…')
  await runAxe(page, 'dateSet-filter-popover'); await shot(page, '10-dateset-filter')
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  // textSet フィルター
  await openColMenu(page, '項目'); await clickMenu(page, 'フィルター…')
  await runAxe(page, 'textSet-filter-popover')
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  // 並び替えを管理 / フィルターを管理 パネル
  await openColMenu(page, '結果'); await clickMenu(page, '並び替えを管理')
  await runAxe(page, 'sort-panel'); await shot(page, '10-sort-panel')
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  await openColMenu(page, '結果'); await clickMenu(page, '列の表示')
  await runAxe(page, 'columns-panel'); await shot(page, '10-columns-panel')
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  // エディタ
  for (const [key, row] of [['result', 2], ['value', 2], ['memo', 3], ['inspectedAt', 2], ['inspector', 2]]) {
    c = await cellCenter(page, row, key); await page.mouse.dblclick(c.x, c.y); await page.waitForTimeout(500)
    await runAxe(page, `editor-${key}`)
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  }
  // validation の reject の吹き出しは無いので mark のツールチップ
  await revealRow(page, 22); c = await cellCenter(page, 22, 'photo'); await page.mouse.move(c.x + 20, c.y); await page.waitForTimeout(1200)
  await runAxe(page, 'invalid-tooltip')
  // find
  c = await cellCenter(page, 22, 'item'); await page.mouse.click(c.x, c.y); await page.keyboard.press('Control+f'); await page.waitForTimeout(400)
  await page.keyboard.type('照度'); await page.waitForTimeout(800)
  await runAxe(page, 'find-bar'); await shot(page, '10-find-bar')
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  // フィルターチップバー
  await page.evaluate(() => [...document.querySelectorAll('.app-form button')].find((b) => b.textContent === '不良のみ').click()); await page.waitForTimeout(600)
  await runAxe(page, 'chip-bar'); await shot(page, '10-chip-bar')
  // モバイル
  const m = await launch({ ...iphone(), locale: 'ja-JP' })
  await m.page.goto(BASE); await m.page.waitForSelector('.ssg-body-row'); await m.page.waitForTimeout(800)
  await runAxe(m.page, 'mobile-initial')
  fs.writeFileSync(path.join(__dirname, '..', 'axe-results.json'), JSON.stringify(all, null, 1))
  console.log('LOGS\n' + logs.join('\n') + '\n' + m.logs.join('\n'))
  await m.browser.close()
  await browser.close()
})()
