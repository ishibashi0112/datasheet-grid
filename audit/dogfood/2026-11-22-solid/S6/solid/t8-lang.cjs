// localeText をシグナルで切り替えたとき、文言が全部変わるか(React 版と比べる)
const { launch, cell } = require('./lib.cjs')
const collect = (page) => page.evaluate(() => {
  const s = new Set()
  const add = (t) => { t = (t ?? '').trim(); if (t) s.add(t) }
  const scope = [...document.querySelectorAll('.ssg-root, [role=menu], [role=dialog], .ssg-filter-popover, .ssg-select-editor-popover, [class*=tooltip], [class*=toolpanel]')]
  for (const r of scope) {
    const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.parentElement.closest('[data-ssg-col-key]:not([role=columnheader]) ') && !n.parentElement.closest('[role=columnheader]')) continue; add(n.textContent) }
    for (const e of [r, ...r.querySelectorAll('*')]) for (const a of ['aria-label', 'placeholder', 'title', 'data-ssg-tooltip', 'aria-roledescription', 'aria-description']) if (e.hasAttribute(a) && !(e.closest('[data-ssg-col-key]') && !e.closest('[role=columnheader]') && a === 'aria-label' && e.getAttribute('role') === 'gridcell')) add(`@${a}=${e.getAttribute(a)}`)
  }
  return [...s]
})
const scenario = async (page, label) => {
  const all = new Set()
  const grab = async (step) => { for (const t of await collect(page)) all.add(t) }
  await grab('base')
  // 列メニュー → フィルター
  for (const key of ['item', 'result', 'value']) {
    const h = page.locator(`.grid-area [role="columnheader"][data-ssg-col-key="${key}"]`).first(); const hb = await h.boundingBox(); await page.mouse.move(hb.x + 10, hb.y + 10); await page.waitForTimeout(150)
    await page.locator(`.grid-area [role="columnheader"][data-ssg-col-key="${key}"] button[aria-haspopup="menu"]`).first().click(); await page.waitForTimeout(300); await grab('menu')
    // 列の固定 の小メニュー
    const pin = page.locator('[role=menu] [role=menuitem][aria-haspopup]').first(); if (await pin.count()) { await pin.hover(); await page.waitForTimeout(300); await grab('pinmenu') }
    await page.locator('[role=menu] [role=menuitem]').first().click(); await page.waitForTimeout(400); await grab('filter')
    // 条件の select を開く
    const sel = page.locator('.ssg-filter-popover select'); for (let i = 0; i < await sel.count(); i++) { for (const o of await sel.nth(i).locator('option').allTextContents()) all.add('opt:' + o) }
    await page.keyboard.press('Escape'); await page.waitForTimeout(250)
  }
  // 右クリックメニュー / エディタ / 展開 / ツールパネル / 範囲選択の集計
  await cell(page, 2, 'item').click({ button: 'right' }); await page.waitForTimeout(300); await grab('ctx'); await page.keyboard.press('Escape')
  await cell(page, 1, 'result').dblclick(); await page.waitForTimeout(300); await grab('select'); await page.keyboard.press('Escape')
  await cell(page, 1, 'value').dblclick(); await page.keyboard.press('Control+a'); await page.keyboard.type('-5'); await page.keyboard.press('Enter'); await page.waitForTimeout(300); await grab('invalid')
  await cell(page, 1, 'value').hover(); await page.waitForTimeout(800); await grab('tooltip')
  await cell(page, 1, 'item').click(); await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(500); await grab('range')
  await page.locator('.grid-area .ssg-body-row[data-row-index="0"] button[aria-expanded]').first().click(); await page.waitForTimeout(300); await grab('detail')
  await page.locator('.grid-area .ssg-bar-chip').first().click(); await page.waitForTimeout(500); await grab('toolpanel')
  for (const tab of await page.locator('[role=tab]').all()) { await tab.click(); await page.waitForTimeout(300); await grab('tab') }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  await page.locator('.grid-area .ssg-bar-input').fill('zzzzzz'); await page.waitForTimeout(600); await grab('nomatch'); await page.locator('.grid-area .ssg-bar-input').fill(''); await page.waitForTimeout(400)
  await page.locator('#open-dialog').click(); await page.waitForTimeout(400); await grab('dialog'); await page.locator('#close-dialog').click()
  // 行ドラッグのハンドル
  return [...all].sort()
}
;(async () => {
  const res = {}
  for (const base of (process.env.BASES ?? 'http://localhost:5506/react/,http://localhost:5506/solid/').split(',')) {
    const tag = base.includes('react') ? 'react' : 'solid'
    res[tag] = {}
    for (const flow of ['en', 'ja-after-en']) {
      const { browser, page, logs } = await launch({})
      await page.goto(base); await page.waitForTimeout(1200)
      await page.locator('#lang').click(); await page.waitForTimeout(500)
      if (flow === 'ja-after-en') { await page.locator('#lang').click(); await page.waitForTimeout(500) }
      res[tag][flow] = await scenario(page, flow)
      const L = logs.filter((l) => !/solid-performance|Download the/.test(l)); if (L.length) console.log(tag, flow, 'logs', L.slice(0, 5).join(' / '))
      await browser.close()
    }
    const { browser, page } = await launch({}); await page.goto(base); await page.waitForTimeout(1200); res[tag].ja = await scenario(page, 'ja'); await browser.close()
  }
  const cjk = (t) => /[　-ヿ一-鿿＀-￯]/.test(t)
  for (const tag of Object.keys(res)) {
    console.log(`== ${tag}: en にした後の CJK を含む文字列`, res[tag].en.filter(cjk).length); console.log(res[tag].en.filter(cjk).join('\n'))
    const a = new Set(res[tag].ja), b = new Set(res[tag]['ja-after-en'])
    console.log(`== ${tag}: ja と「en → ja」の差`, [...a].filter((x) => !b.has(x)).map((x) => '-' + x).concat([...b].filter((x) => !a.has(x)).map((x) => '+' + x)).join('\n'))
  }
  const r = new Set(res.react.en), s = new Set(res.solid.en)
  console.log('== en: react にだけある', [...r].filter((x) => !s.has(x)).join('\n')); console.log('== en: solid にだけある', [...s].filter((x) => !r.has(x)).join('\n'))
  require('fs').writeFileSync('lang-result.json', JSON.stringify(res, null, 1))
})()
