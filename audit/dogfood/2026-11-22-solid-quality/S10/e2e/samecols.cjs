// applyState に今と同じ columns を渡したとき onColumnsChange が呼ばれるか
const { open, sleep } = require('./lib.cjs')
const [base = 'http://localhost:5510/'] = process.argv.slice(2)
;(async () => {
  const { browser, page, logs } = await open()
  await page.goto(base)
  await page.waitForSelector('[role=grid][aria-label="Orders"] [data-row-key="O00001"]')
  const r = await page.evaluate(async () => {
    const out = []
    window.__log.length = 0
    const s = window.__top.getState()
    window.__top.applyState({ columns: s.columns })
    await new Promise((r) => setTimeout(r, 100))
    out.push(['same columns (getState)', window.__log.slice()])
    window.__log.length = 0
    window.__top.applyState(window.__top.getState())
    await new Promise((r) => setTimeout(r, 100))
    out.push(['applyState(getState())', window.__log.slice()])
    window.__log.length = 0
    window.__top.applyState({ sort: [] })
    await new Promise((r) => setTimeout(r, 100))
    out.push(['sort only', window.__log.slice()])
    return out
  })
  for (const x of r) console.log(JSON.stringify(x))
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('RELAY_TEAR') && !l.includes('React DevTools')).join('\n'))
  await browser.close()
})()
