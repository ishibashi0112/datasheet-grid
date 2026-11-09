const { open, shot } = require('./lib.cjs')
const { cellPos, cellText } = require('./dlib.cjs')
const SALES = '[data-testid=sales-wrap]'
const tabState = (page) => page.evaluate(() => [...document.querySelectorAll('[role=tab]')].map((t) => t.textContent + ':' + t.getAttribute('data-state')).join(' '))
;(async () => {
  for (const mode of ['force', 'unmount']) {
    for (const how of ['shortcut', 'mouse']) {
      const { browser, page, logs } = await open(mode === 'unmount' ? '?tabs=unmount' : '')
      const p = await cellPos(page, 1, '備考', SALES)
      await page.mouse.click(p.x, p.y)
      await page.keyboard.type('draft')
      await page.waitForTimeout(150)
      if (how === 'shortcut') await page.keyboard.press('Alt+2')
      else await page.click('[data-testid=tab-stock]')
      await page.waitForTimeout(300)
      const t1 = await tabState(page)
      if (how === 'shortcut') await page.keyboard.press('Alt+1')
      else await page.click('[data-testid=tab-sales]')
      await page.waitForTimeout(400)
      console.log(`[${mode}/${how}] tabs after switch: ${t1} → back: 備考[1] =`, JSON.stringify(await cellText(page, 1, '備考', SALES)), 'editor open:', await page.evaluate(() => !!document.querySelector('[data-testid=sales-wrap] .ssg-cell-editor')), 'active', await page.evaluate(() => document.activeElement.tagName + '.' + document.activeElement.className.toString().slice(0, 30)))
      const l = logs.filter((x) => !x.includes('React DevTools'))
      if (l.length) console.log('logs:', l.join('\n'))
      await browser.close()
    }
  }
})()
