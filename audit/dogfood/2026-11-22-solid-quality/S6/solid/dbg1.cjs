const { launch, BASE, devices, cell, active } = require('./lib.cjs')
const dev = process.env.DEV ?? 'iPhone 13'
;(async () => {
  const d = { ...devices[dev] }; delete d.defaultBrowserType
  const { browser, page, logs } = await launch(process.env.DESK ? {} : { ...d, deviceScaleFactor: 1 })
  await page.goto(process.env.URL ?? BASE); await page.waitForTimeout(1500)
  const rc = cell(page, 2, 'result')
  await rc.scrollIntoViewIfNeeded()
  console.log('result cell html', (await rc.evaluate((e) => e.outerHTML)).slice(0, 400))
  console.log('photo cell html', (await cell(page, 2, 'photo').evaluate((e) => e.outerHTML)).slice(0, 400))
  let b = await rc.boundingBox(); console.log('bbox', b)
  if (process.env.DESK) { await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2) } else {
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(80)
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2) }
  await page.waitForTimeout(600)
  console.log('active el', await page.evaluate(() => { const e = document.activeElement; return [e.tagName, e.className, e.getAttribute('role'), e.outerHTML.slice(0, 300)] }))
  console.log('listbox', await page.evaluate(() => [...document.querySelectorAll('[role=listbox],[role=option],select')].map((e) => e.tagName + ' ' + e.getAttribute('role') + ' ' + e.className).slice(0, 10)))
  await page.screenshot({ path: `dbg-select-${process.env.DESK ? 'desk' : 'm'}.png` })
  await page.keyboard.press('Escape')
  const hb = page.locator('[role="columnheader"][data-ssg-col-key="result"] button[aria-haspopup="menu"]').first()
  await hb.scrollIntoViewIfNeeded(); b = await hb.boundingBox(); console.log('menu btn', b, await hb.evaluate((e) => e.outerHTML.slice(0, 300)))
  if (process.env.DESK) { await page.mouse.move(b.x + 2, b.y + 2); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2) } else await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
  await page.waitForTimeout(600)
  console.log('menu', await page.evaluate(() => [...document.querySelectorAll('[role=menu]')].map((m) => m.outerHTML.slice(0, 500))))
  await page.screenshot({ path: `dbg-menu-${process.env.DESK ? 'desk' : 'm'}.png` })
  console.log(logs.join('\n'))
  await browser.close()
})()
