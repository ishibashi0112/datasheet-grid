// キーボードだけの操作
const { launch, active, focused } = require('./lib.cjs')
;(async () => {
  for (const base of (process.env.BASES ?? 'http://localhost:5506/react/,http://localhost:5506/solid/,http://localhost:5506/').split(',')) {
    const { browser, page, logs } = await launch({})
    await page.goto(base); await page.waitForTimeout(1200)
    const tag = base.includes('react') ? 'react' : base.includes('solid') ? 'solidprod' : 'soliddev'
    const out = []
    const k = async (key, note = key) => { await page.keyboard.press(key); await page.waitForTimeout(250); out.push(`${note} → ${await focused(page)} | act ${await active(page)}`) }
    await page.locator('#lang').focus()
    out.push('start ' + await focused(page))
    await k('Tab'); await k('Tab'); await k('Tab'); await k('Tab')
    const ring = await page.evaluate(() => { const a = document.querySelector('[id$="-active-cell"]'); const root = document.querySelector('.ssg-root'); const sh = document.querySelector('.ssg-shell, [data-ssg-has-active-cell]'); return { hasActive: !!a, attrs: sh ? [...sh.attributes].map((x) => x.name + '=' + x.value).filter((x) => /ssg/.test(x)).join(' ') : null, after: sh ? getComputedStyle(sh, '::after').outlineStyle + '/' + getComputedStyle(sh, '::after').borderTopStyle + '/' + getComputedStyle(sh, '::after').boxShadow.slice(0, 40) : null } })
    out.push('ring after tab-in: ' + JSON.stringify(ring))
    await page.screenshot({ path: `shot-k-${tag}-tabin.png`, clip: { x: 0, y: 0, width: 700, height: 300 } })
    await k('ArrowDown'); await k('ArrowRight')
    out.push('ring after arrow: ' + JSON.stringify(await page.evaluate(() => { const sh = document.querySelector('.ssg-shell'); const a = getComputedStyle(sh, '::after'); return [[...sh.attributes].map((x) => x.name + '=' + x.value).filter((x) => /ssg/.test(x)).join(' '), a.content, a.borderTopWidth + ' ' + a.borderTopStyle + ' ' + a.borderTopColor, a.outlineStyle, a.boxShadow.slice(0, 50)] })))
    await page.screenshot({ path: `shot-k-${tag}-arrow.png`, clip: { x: 0, y: 0, width: 700, height: 300 } })
    // Alt+↓ → 列メニュー
    await k('Alt+ArrowDown'); await k('ArrowDown'); await k('Escape')
    // Shift+F10 → 右クリックメニュー
    await k('Shift+F10'); out.push('ctx items ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((e) => e.textContent.trim())))); await k('Escape')
    // 端の列まで行って Tab で外へ
    await k('End'); await k('Tab', 'Tab at last col'); await k('Shift+Tab', 'Shift+Tab back')
    // 展開トグル列へ: Home → ← ← ? (先頭データ列から ←)
    await k('Home'); await k('ArrowLeft'); await k('Enter', 'Enter on toggle')
    out.push('expanded ' + await page.evaluate(() => [...document.querySelectorAll('button[aria-expanded="true"]')].length))
    await k('End'); await k('Tab', 'Tab from last col (card)'); await k('Tab'); await k('Tab'); await k('Tab'); await k('Tab'); await k('Tab'); await k('Tab')
    await k('Shift+Tab', 'S-Tab'); await k('Shift+Tab', 'S-Tab'); await k('Shift+Tab', 'S-Tab'); await k('Shift+Tab', 'S-Tab'); await k('Shift+Tab', 'S-Tab'); await k('Shift+Tab', 'S-Tab')
    // カードの閉じるボタンを Enter → フォーカスは表へ戻る?
    await k('End'); await k('Tab', 'into card');
    for (let i = 0; i < 6; i++) { const f = await focused(page); if (/閉じる|Close/.test(f)) break; await page.keyboard.press('Tab'); await page.waitForTimeout(150) }
    out.push('on close btn ' + await focused(page))
    await k('Enter', 'Enter on card close')
    out.push('expanded ' + await page.evaluate(() => [...document.querySelectorAll('button[aria-expanded="true"]')].length))
    // Ctrl+F
    await k('Control+f', 'Ctrl+F'); await page.keyboard.type('倉庫'); await page.waitForTimeout(400); out.push('find marks ' + await page.locator('mark.ssg-find-mark').count()); await k('Escape', 'Esc find')
    for (const o of out) console.log(tag, o)
    console.log(tag, 'logs:', logs.filter((l) => !/solid-performance|Download the/.test(l)).join(' / '))
    await browser.close()
  }
})()
