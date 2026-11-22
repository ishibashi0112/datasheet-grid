// ?async: 非同期の行を取り直す間に前の行を出し続けるか、状態(並び / 絞り込み / スクロール / アクティブセル / ハンドル)が残るか
// 使い方: node t20-async.cjs <label> [追加の query(例 &loadingon)]
const { open, sleep } = require('./lib.cjs')
const label = process.argv[2] ?? 'x'
const extra = process.argv[3] ?? ''
;(async () => {
  const t0 = Date.now()
  const { browser, page, logs } = await open(`http://127.0.0.1:5505/?async&n=200000${extra}`)
  const ev = (f, a) => page.evaluate(f, a)
  const sawLoading = await page.waitForSelector('[data-testid=loading]', { timeout: 5000 }).then(() => true).catch(() => false)
  await page.waitForSelector('.ssg-body-cell', { timeout: 60000 })
  console.log(`[${label}] initial: loading fallback seen=${sawLoading}, first cell after ${Date.now() - t0}ms`)
  await sleep(1500)
  await ev(() => { window.__firstHandle = window.__logGrid; window.__refCalls = 0 })
  // 状態を作る: 時刻の降順 + グローバルフィルター "timeout" + 50 行目あたりへスクロール + セルを選ぶ
  await ev(() => window.__logGrid.applyState({ sort: [{ columnKey: 'time', direction: 'desc' }], filters: { globalText: 'timeout' } }))
  await sleep(800)
  await ev(() => window.__logGrid.scrollToRow(50, 'start')); await sleep(500)
  const c = page.locator('.ssg-body-row[data-pane="center"] [data-ssg-col-key="service"]').nth(3)
  await c.click(); await sleep(300)
  const snap = () => ev(() => {
    const g = window.__logGrid
    const st = g.getState()
    const scroller = document.querySelector('.ssg-scroll, .ssg-body-scroll, [data-ssg-scroll]') ?? [...document.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight + 100 && getComputedStyle(d).overflowY !== 'visible')
    const rows = [...document.querySelectorAll('.ssg-body-row[data-pane=center]')].filter((r) => r.dataset.rowKey).sort((a, b) => +a.dataset.rowIndex - +b.dataset.rowIndex)
    const root = document.querySelector('.ssg-root')
    return {
      pending: document.querySelector('[data-testid=pending]')?.textContent ?? null,
      loading: !!document.querySelector('[data-testid=loading]'),
      roots: document.querySelectorAll('.ssg-root').length,
      rootVisible: root ? root.getBoundingClientRect().height > 0 && root.isConnected : false,
      bodyRows: rows.length,
      firstKey: rows[0]?.dataset.rowKey,
      top: document.querySelector('.ssg-bar--top')?.innerText.replace(/\s+/g, ' ').slice(0, 60),
      active: document.querySelector('.ssg-bar--bottom')?.innerText.match(/セル\s*(\S+)/)?.[1] ?? null,
      sort: JSON.stringify(st.sort), global: st.filters.globalText,
      scrollTop: scroller ? Math.round(scroller.scrollTop) : null,
      sameHandle: window.__logGrid === window.__firstHandle,
      count: document.querySelector('[data-testid=logcount]')?.textContent,
    }
  })
  const before = await snap()
  console.log(`[${label}] before switch:`, JSON.stringify(before))
  await page.selectOption('[data-testid=env]', 'stg')
  const seen = []
  for (let i = 0; i < 25; i++) { await sleep(100); const s = await snap(); seen.push(`${i * 100}ms pending=${s.pending} loading=${s.loading} roots=${s.roots} vis=${s.rootVisible} rows=${s.bodyRows} first=${s.firstKey} count=${s.count}`) }
  // 重なりを圧縮して出す
  let last = ''; for (const l of seen) { const k = l.replace(/^\d+ms /, ''); if (k !== last) console.log(`[${label}]   ${l}`); last = k }
  await sleep(1500)
  const after = await snap()
  console.log(`[${label}] after land:`, JSON.stringify(after))
  await page.screenshot({ path: `${__dirname}/shots/t20-${label}-after.png` })
  // 取り直しの間に操作する: もう一度切り替えて、待っている間にスクロールと矢印キー
  await page.selectOption('[data-testid=env]', 'dev'); await sleep(200)
  await page.mouse.move(700, 500); await page.mouse.wheel(0, 600); await sleep(200)
  await page.keyboard.press('ArrowDown'); await sleep(100)
  const mid = await snap()
  console.log(`[${label}] during 2nd fetch after wheel+ArrowDown:`, JSON.stringify(mid))
  await sleep(2500)
  console.log(`[${label}] after 2nd land:`, JSON.stringify(await snap()))
  // 落ちる環境 → Errored → 戻す
  await page.selectOption('[data-testid=env]', 'broken'); await sleep(2500)
  console.log(`[${label}] broken: error=${await page.locator('[data-testid=error]').count()} roots=${await page.locator('.ssg-root').count()}`)
  if (await page.locator('[data-testid=retry]').count()) { await page.click('[data-testid=retry]'); await sleep(3000) }
  console.log(`[${label}] after retry:`, JSON.stringify(await snap()))
  console.log(`[${label}] fetches:`, (await ev(() => window.__fetches)).join(' | '))
  console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n')[0].slice(0, 220)).join('\n'))
  await browser.close()
})()
