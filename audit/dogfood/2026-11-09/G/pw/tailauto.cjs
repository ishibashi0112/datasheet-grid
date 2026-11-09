const { open, shot, wait, rowCount, waitCountChange } = require('./lib.cjs')
;(async () => {
  const url = (process.argv[2] ?? 'http://localhost:5407/') + '?live=1'
  const tag = process.argv[3] ?? 'dev'
  const { browser, page, logs } = await open(url)
  await wait(1000)
  // 行の高さが変わる表(50,000 行以下)で末尾を追う
  await page.evaluate(() => window.__grid.applyState({ filters: { columnFilters: { level: { kind: 'set', mode: 'include', values: ['WARN', 'ERROR', 'FATAL'] }, service: { kind: 'set', mode: 'include', values: ['checkout', 'billing'] } } } }))
  await wait(3000)
  const samples = []
  for (let i = 0; i < 16; i++) {
    samples.push(await page.evaluate(() => {
      const el = document.querySelector('.ssg-scroll-container')
      const follow = document.querySelectorAll('.toolbar input[type=checkbox]')[1].checked
      const m = document.querySelector('.ssg-bar--bottom').innerText.match(/行\s*(\d+)/)
      const nums = [...document.querySelectorAll('[data-pane="left"].ssg-body-row [role=rowheader]')].filter((c) => { const b = c.getBoundingClientRect(); const r = el.getBoundingClientRect(); return b.bottom <= r.bottom + 1 && b.top >= r.top }).map((c) => Number(c.textContent))
      return { gap: Math.round(el.scrollHeight - el.clientHeight - el.scrollTop), follow, count: Number(m?.[1]), lastVisible: Math.max(...nums) }
    }))
    await wait(500)
  }
  console.log(samples.map((s) => `${s.count}/${s.lastVisible}/gap${s.gap}/${s.follow ? 'F' : '-'}`).join(' '))
  await shot(page, `tailauto-${tag}`)
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).slice(0, 30).join('\n'))
  await browser.close()
})()
