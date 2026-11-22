// 展開行カードの状態: 保存 / 元に戻す / 同じ行を表で編集したとき / 言語切り替え / 並べ替え
const { launch, cell } = require('./lib.cjs')
;(async () => {
  for (const base of (process.env.BASES ?? 'http://localhost:5506/react/,http://localhost:5506/').split(',')) {
    const tag = base.includes('react') ? 'react' : 'soliddev'
    const { browser, page, logs } = await launch({})
    await page.goto(base); await page.waitForTimeout(1200)
    const card = page.locator('[data-testid="detail-card"]').first()
    const st = async () => { const n = await card.count(); if (!n) return 'no card'; return JSON.stringify([await card.locator('input').inputValue(), await card.locator('textarea').inputValue(), await card.evaluate((e) => (e.__id ??= Math.random().toString(36).slice(2, 6)))]) }
    await page.locator('.grid-area .ssg-body-row[data-row-index="0"] button[aria-expanded]').first().click(); await page.waitForTimeout(400)
    console.log(tag, 'open', await st())
    await card.locator('input').fill('山田'); await card.locator('textarea').fill('交換済み')
    console.log(tag, 'typed', await st())
    // 同じ行の別のセルを表で編集(未保存の入力は?)
    await cell(page, 0, 'value').dblclick(); await page.keyboard.press('Control+a'); await page.keyboard.type('42'); await page.keyboard.press('Enter'); await page.waitForTimeout(400)
    console.log(tag, 'after editing same row value cell', await st(), 'value', await cell(page, 0, 'value').textContent())
    await card.locator('input').fill('山田'); await card.locator('textarea').fill('交換済み')
    await card.locator('button', { hasText: '保存' }).click(); await page.waitForTimeout(400)
    console.log(tag, 'saved', await st())
    await cell(page, 3, 'item').click(); await page.keyboard.press('Control+z'); await page.waitForTimeout(400)
    console.log(tag, 'undo (save)', await st())
    await page.keyboard.press('Control+y'); await page.waitForTimeout(400)
    console.log(tag, 'redo', await st())
    // 並べ替え(行 0 の位置が変わる)
    const h = page.locator('.grid-area [role="columnheader"][data-ssg-col-key="item"]').first(); await h.click(); await page.waitForTimeout(500)
    console.log(tag, 'after sort click', await st(), 'cards', await page.locator('[data-testid="detail-card"]').count())
    await page.locator('#lang').click(); await page.waitForTimeout(400)
    console.log(tag, 'after lang', await st())
    const L = logs.filter((l) => !/solid-performance|Download the/.test(l)); if (L.length) console.log(tag, 'logs', L.join(' / '))
    await browser.close()
  }
})()
