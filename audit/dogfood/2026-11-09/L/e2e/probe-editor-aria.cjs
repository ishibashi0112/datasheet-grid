const { launch, BASE } = require('./lib.cjs')
const { cellCenter } = require('./helpers.cjs')
;(async () => {
  const { browser, page } = await launch({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' })
  await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
  for (const key of ['memo', 'result']) {
    const c = await cellCenter(page, 2, key); await page.mouse.dblclick(c.x, c.y); await page.waitForTimeout(500)
    const r = await page.evaluate(() => {
      const ed = document.querySelector('.ssg-cell-editor')
      const owner = document.querySelector('[aria-owns]')
      const lb = document.querySelector('[role=listbox]')
      const input = ed?.querySelector('input,textarea')
      return {
        editor: ed && { role: ed.getAttribute('role'), label: ed.getAttribute('aria-label'), id: ed.id, parentRole: ed.parentElement?.getAttribute('role'), parentCls: ed.parentElement?.className },
        owner: owner && { role: owner.getAttribute('role'), owns: owner.getAttribute('aria-owns'), key: owner.getAttribute('data-ssg-col-key') },
        input: input && [...input.attributes].map((a) => `${a.name}=${a.value.slice(0, 40)}`),
        listbox: lb && { attrs: [...lb.attributes].map((a) => `${a.name}=${a.value.slice(0, 40)}`), opts: [...lb.querySelectorAll('[role=option]')].map((o) => `${o.id}|${o.getAttribute('aria-selected')}`) },
      }
    })
    console.log(key, JSON.stringify(r, null, 1))
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100)
    console.log(' after ArrowDown', await page.evaluate(() => ({ ad: document.activeElement.getAttribute('aria-activedescendant'), sel: [...document.querySelectorAll('[role=option]')].map((o) => o.getAttribute('aria-selected')).join(',') })))
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  }
  await browser.close()
})()
