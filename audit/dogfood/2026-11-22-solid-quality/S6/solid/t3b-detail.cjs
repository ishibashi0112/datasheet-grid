// 展開行のカードの Tab の順と、閉じたときのフォーカス
const { launch, active, focused } = require('./lib.cjs')
;(async () => {
  for (const base of (process.env.BASES ?? 'http://localhost:5506/react/,http://localhost:5506/solid/').split(',')) {
    const { browser, page, logs } = await launch({})
    await page.goto(base); await page.waitForTimeout(1200)
    const tag = base.includes('react') ? 'react' : base.includes('solid') ? 'solidprod' : 'soliddev'
    const out = []
    const k = async (key, note = key) => { await page.keyboard.press(key); await page.waitForTimeout(250); out.push(`${note} → ${await focused(page)} | act ${await active(page)}`) }
    await page.locator('.ssg-bar-input').first().focus()
    await k('Tab'); await k('ArrowDown'); await k('ArrowLeft'); await k('Enter', 'Enter on toggle')
    out.push('expanded ' + await page.evaluate(() => [...document.querySelectorAll('button[aria-expanded="true"]')].map((b) => b.getAttribute('aria-label')).join(',')))
    await k('End'); for (let i = 0; i < 7; i++) await k('Tab', 'Tab' + i)
    await page.locator('.ssg-bar-input').first().focus(); await k('Tab', 'reenter'); for (let i = 0; i < 7; i++) await k('Shift+Tab', 'S-Tab' + i)
    // カードの中の「閉じる」を押す
    await page.locator('.ssg-bar-input').first().focus(); await k('Tab'); await k('End'); await k('Tab', 'into card')
    for (let i = 0; i < 6; i++) { if (/閉じる|Close/.test(await focused(page))) break; await page.keyboard.press('Tab'); await page.waitForTimeout(150) }
    out.push('on ' + await focused(page)); await k('Enter', 'Enter on card close')
    out.push('expanded ' + await page.evaluate(() => [...document.querySelectorAll('button[aria-expanded="true"]')].length))
    await k('ArrowDown', 'ArrowDown after close')
    // カードの入力欄で矢印 → アクティブセルは動かない
    await k('ArrowUp'); await k('Home'); await k('ArrowLeft'); await k('Space', 'Space on toggle'); await k('End'); await k('Tab', 'into card2'); await k('ArrowDown', 'ArrowDown in card input'); await page.keyboard.type('abc'); await k('Control+c', 'copy in card')
    // ctrl+F
    await page.locator('.ssg-bar-input').first().focus(); await k('Tab'); await k('Control+f', 'Ctrl+F'); await page.keyboard.type('倉庫'); await page.waitForTimeout(500); out.push('find marks ' + await page.locator('mark.ssg-find-mark').count() + ' ' + JSON.stringify(await page.evaluate(() => document.querySelector('.ssg-find-bar, [class*=find-bar]')?.textContent.trim().slice(0, 60)))); await k('Enter', 'Enter in find'); await k('Escape', 'Esc find')
    for (const o of out) console.log(tag, o)
    console.log(tag, 'logs:', logs.filter((l) => !/solid-performance|Download the/.test(l)).join(' / '))
    await browser.close()
  }
})()
