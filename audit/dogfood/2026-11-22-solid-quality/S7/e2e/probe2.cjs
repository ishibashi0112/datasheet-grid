const { open, clickCell, sleep } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open()
  await page.goto('http://localhost:5507/projects/web?minDelay=300&maxDelay=600&loadFail=0&saveFail=0')
  await page.waitForSelector('[role=grid][aria-label="タスク"] [data-row-key="web-1"]')
  await clickCell(page, 'タスク', 'web-2', 'estimate')
  await sleep(200)
  const info = await page.evaluate(() => {
    const g = document.querySelector('[role=grid][aria-label="タスク"]')
    const c = g.querySelector('[data-row-key="web-2"] [data-ssg-col-key="estimate"]')
    const bb = document.querySelector('.ssg-root')
    return { cellAttrs: [...c.attributes].map(a => a.name+'='+a.value).join(' '), activeEls: [...document.querySelectorAll('[class*=active]')].map(e => e.className).slice(0,8), bottom: [...document.querySelectorAll('[class*=bottom]')].map(e=>e.className + ' :: ' + e.textContent).slice(0,3), focus: document.activeElement?.className }
  })
  console.log(JSON.stringify(info, null, 1))
  await page.keyboard.press('Enter')
  await sleep(200)
  console.log(await page.evaluate(() => [...document.querySelectorAll('.ssg-cell-editor, .ssg-cell-editor *')].map(e => e.tagName + '.' + e.className).join('\n')))
  await browser.close()
})()
