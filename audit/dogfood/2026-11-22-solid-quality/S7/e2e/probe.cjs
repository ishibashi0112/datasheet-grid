const { open, shot, sleep } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open()
  await page.goto('http://localhost:5507/projects/web?minDelay=300&maxDelay=600&loadFail=0&saveFail=0')
  await page.waitForSelector('[role=grid][aria-label="タスク"]', { timeout: 15000 })
  await sleep(500)
  await shot(page, 'probe')
  const info = await page.evaluate(() => {
    const g = document.querySelector('[role=grid][aria-label="タスク"]')
    const rows = [...g.querySelectorAll('[role=row]')].slice(0, 4).map((r) => ({ cls: r.className, attrs: [...r.attributes].map((a) => a.name + '=' + a.value).join(' '), cells: [...r.querySelectorAll('[role=gridcell],[role=columnheader],[role=rowheader]')].slice(0, 9).map((c) => [...c.attributes].filter(a=>a.name.startsWith('aria')||a.name.startsWith('data')).map((a) => a.name + '=' + a.value).join(' ') + ' :: ' + c.textContent) }))
    return { rootCls: g.className, rows }
  })
  console.log(JSON.stringify(info, null, 1))
  console.log(logs.join('\n'))
  await browser.close()
})()
