// renderCell の中で外の signal を読んだとき、変わったセルだけが描き直されるか(要素の同一性で確かめる)
const { open } = require('./lib.cjs')
;(async () => {
  const base = process.argv[2] || 'http://localhost:5512/'
  for (const mode of (process.argv[3] || 'jsx,body').split(',')) {
    const { browser, page, logs } = await open(`${base}?peer=${mode}&nopeers`)
    await page.waitForTimeout(800)
    const r = await page.evaluate(async () => {
      const app = window.__app
      const root = document.querySelector('[aria-label="生産計画"]').closest('.ssg-root')
      const snap = () => {
        const m = new Map()
        for (const cell of root.querySelectorAll('[role=gridcell]')) {
          const row = cell.closest('[role=row]')?.getAttribute('aria-rowindex')
          m.set(`${row}:${cell.getAttribute('aria-colindex')}`, { cell, content: cell.firstElementChild, text: cell.textContent })
        }
        return m
      }
      const before = snap()
      let added = 0
      let removed = 0
      const mo = new MutationObserver((recs) => {
        for (const x of recs) {
          added += x.addedNodes.length
          removed += x.removedNodes.length
        }
      })
      mo.observe(root, { childList: true, subtree: true })
      const render0 = window.__counters.render
      // 1 人だけ 1 つ右へ動かす
      const p0 = app.peers()[0]
      const idx = app.columns().findIndex((c) => c.key === p0.colKey)
      const nextKey = app.columns()[idx + 1].key
      app.setPeers((prev) => prev.map((p, i) => (i === 0 ? { ...p, colKey: nextKey } : p)))
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)))
      const after = snap()
      mo.disconnect()
      let sameCell = 0, sameContent = 0, changedContent = [], total = 0
      for (const [k, b] of before) {
        const a = after.get(k)
        if (!a) continue
        total++
        if (a.cell === b.cell) sameCell++
        if (a.content === b.content) sameContent++
        else changedContent.push(k)
      }
      return { total, sameCell, sameContent, changedContent: changedContent.slice(0, 10), changedCount: changedContent.length, added, removed, renderCalls: window.__counters.render - render0, peer: p0.name, from: p0.colKey, to: nextKey, marks: root.querySelectorAll('.peer').length }
    })
    // 20 回/秒で 3 秒動かしたときの renderCell の呼び出しと DOM の出入り
    const r2 = await page.evaluate(async () => {
      const root = document.querySelector('[aria-label="生産計画"]').closest('.ssg-root')
      let added = 0
      const mo = new MutationObserver((recs) => { for (const x of recs) added += x.addedNodes.length })
      mo.observe(root, { childList: true, subtree: true })
      const render0 = window.__counters.render
      window.__app.setRunning(true)
      await new Promise((res) => setTimeout(res, 3000))
      window.__app.setRunning(false)
      mo.disconnect()
      return { renderCallsPer3s: window.__counters.render - render0, addedNodesPer3s: added }
    })
    console.log(mode, JSON.stringify(r), JSON.stringify(r2))
    const warn = logs.filter((l) => l.startsWith('[warning]') || l.startsWith('[error]') || l.startsWith('[pageerror]'))
    console.log('  warnings', warn.length, [...new Set(warn.map((w) => w.split('\n')[0].slice(0, 140)))].join(' | '))
    await browser.close()
  }
})()
