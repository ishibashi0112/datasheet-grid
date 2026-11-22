// axe-core: 表・列メニュー・列フィルター・エディタ・右クリックメニュー・ダイアログ
const fs = require('fs')
const { launch, cell } = require('./lib.cjs')
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
;(async () => {
  for (const base of (process.env.BASES ?? 'http://localhost:5506/react/,http://localhost:5506/solid/').split(',')) {
    const { browser, page, logs } = await launch({})
    await page.goto(base); await page.waitForTimeout(1200)
    const tag = base.includes('react') ? 'react' : base.includes('solid') ? 'solidprod' : 'soliddev'
    await page.addScriptTag({ content: axeSrc })
    const run = async (name, ctxSel) => {
      const r = await page.evaluate(async (sel) => { const res = await window.axe.run(sel ? { include: [[sel]] } : document, { resultTypes: ['violations'] }); return res.violations.map((v) => `${v.id}(${v.impact})x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`) }, ctxSel)
      console.log(tag, name, r.length ? '\n   ' + r.join('\n   ') : 'OK')
    }
    await run('page')
    // 列メニュー
    const h = page.locator('[role="columnheader"][data-ssg-col-key="item"]').first(); const hb = await h.boundingBox(); await page.mouse.move(hb.x + 10, hb.y + 10)
    await page.locator('[role="columnheader"][data-ssg-col-key="item"] button[aria-haspopup="menu"]').first().click(); await page.waitForTimeout(400)
    await run('column menu', '[role=menu]')
    await page.locator('[role=menu] [role=menuitem]', { hasText: /フィルター/ }).first().click(); await page.waitForTimeout(500)
    await run('filter popover (text)', '.ssg-filter-popover')
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    // set フィルター
    const h2 = page.locator('[role="columnheader"][data-ssg-col-key="result"]').first(); const hb2 = await h2.boundingBox(); await page.mouse.move(hb2.x + 10, hb2.y + 10)
    await page.locator('[role="columnheader"][data-ssg-col-key="result"] button[aria-haspopup="menu"]').first().click(); await page.waitForTimeout(400)
    await page.locator('[role=menu] [role=menuitem]', { hasText: /フィルター/ }).first().click(); await page.waitForTimeout(500)
    await run('filter popover (set)', '.ssg-filter-popover')
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    // エディタ(text / select / number / multiline)
    for (const key of ['item', 'result', 'value', 'memo']) {
      await cell(page, 1, key).dblclick(); await page.waitForTimeout(400)
      await run('editor ' + key, null)
      await page.keyboard.press('Escape'); await page.waitForTimeout(250)
    }
    // 右クリックメニュー
    await cell(page, 2, 'item').click({ button: 'right' }); await page.waitForTimeout(400)
    await run('context menu', '[role=menu]')
    await page.keyboard.press('Escape'); await page.waitForTimeout(250)
    // 展開行
    await page.locator('.ssg-body-row[data-row-index="0"] button[aria-expanded]').first().click(); await page.waitForTimeout(400)
    await run('detail expanded', null)
    // ツールパネル
    await page.locator('.ssg-bar-chip').first().click(); await page.waitForTimeout(500)
    await run('tool panel', null)
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    // ダイアログ
    await page.locator('#open-dialog').click(); await page.waitForTimeout(600)
    await run('dialog', 'dialog')
    await browser.close()
  }
})()
