const { open, shot, handle } = require('./lib.cjs')
const log = (...a) => console.log(...a)
;(async () => {
  const { browser, page, logs } = await open('?extra=300')
  await page.mouse.move(700, 450)
  const seq = []
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(60)
    const s = await page.evaluate(() => {
      const sc = document.querySelector('.ssg-scroll-container')
      const rows = [...document.querySelectorAll('.ssg-body-row[data-pane="center"]')]
      const top = sc.getBoundingClientRect().top + 40
      const first = rows.map((r) => [r, r.getBoundingClientRect()]).filter(([, b]) => b.bottom > top).sort((a, b) => a[1].top - b[1].top)[0]
      return { st: Math.round(sc.scrollTop), sh: sc.scrollHeight, first: first ? first[0].getAttribute('aria-rowindex') + '@' + Math.round(first[1].top) : null }
    })
    seq.push(s)
  }
  const deltas = seq.map((s, i) => (i ? s.st - seq[i - 1].st : 0))
  log('scrollTop deltas', deltas.join(','))
  log('scrollHeight changes', [...new Set(seq.map((s) => s.sh))].join(','))
  log('first rows', seq.map((s) => s.first).join(' '))
  // 下から上へ
  await handle(page, 'g.scrollToBottom()')
  await page.waitForTimeout(1500)
  log('bottom', JSON.stringify(await handle(page, 'return g.getScrollPosition()')), 'visible', JSON.stringify(await handle(page, 'return g.getVisibleRowRange()')))
  await shot(page, '33-bottom')
  const seq2 = []
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, -120)
    await page.waitForTimeout(60)
    seq2.push(await page.evaluate(() => Math.round(document.querySelector('.ssg-scroll-container').scrollTop)))
  }
  log('up deltas', seq2.map((s, i) => (i ? s - seq2[i - 1] : 0)).join(','))
  log('LOGS', logs)
  await browser.close()
})()
