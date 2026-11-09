const { open, shot } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open()
  const root = page.locator('.ssg-root').nth(2)
  await root.scrollIntoViewIfNeeded()
  const pos = await page.evaluate(() => {
    const root = document.querySelectorAll('.ssg-root')[2]
    const h = [...root.querySelectorAll('[role=columnheader]')].find((x) => x.textContent.replace('⋮','').trim() === '担当')
    const hr = h.getBoundingClientRect()
    const row = [...root.querySelectorAll('[role=row][aria-rowindex="3"]')].find((r) => { const b = r.getBoundingClientRect(); return b.left <= hr.left + 2 && b.right >= hr.right - 2 })
    return { x: hr.x + hr.width / 2, y: row.getBoundingClientRect().y + 18 }
  })
  await page.mouse.dblclick(pos.x, pos.y)
  await page.waitForTimeout(500)
  const kids = await page.evaluate(() => [...document.body.children].map((e) => `${e.tagName}.${e.className}`.slice(0, 100)))
  console.log(kids)
  const opts = await page.evaluate(() => [...document.querySelectorAll('[role=option], [role=listbox]')].map((e) => `${e.getAttribute('role')} ${e.className} ${e.textContent.slice(0,20)}`).slice(0, 5))
  console.log(opts, await page.evaluate(() => document.activeElement.outerHTML.slice(0, 200)))
  await shot(page, 'probe-select')
  await browser.close()
})()
