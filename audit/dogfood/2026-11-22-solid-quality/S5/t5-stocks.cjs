// 株価タブ: 更新中のソート・選択・コピー・集計・メモの編集と undo
// 使い方: node t5-stocks.cjs <label> <signal|apply>
const { open, sleep } = require('./lib.cjs')
;(async () => {
  const label = process.argv[2] ?? 'x'
  const mode = process.argv[3] ?? 'signal'
  const url = `http://127.0.0.1:5505/?n=1000&tab=stocks&mode=${mode}`
  const { browser, page, logs } = await open(url)
  await page.waitForSelector('.ssg-body-cell', { timeout: 60000 })
  const out = { label, mode }
  const ev = (f, a) => page.evaluate(f, a)
  const setMode = (m) => ev((m) => window.__setMode(m), m)
  const bottom = () => ev(() => (document.querySelector('.ssg-bar--bottom')?.innerText ?? '').replace(/\s+/g, ' '))
  const topBar = () => ev(() => (document.querySelector('.ssg-bar--top')?.innerText ?? '').replace(/\s+/g, ' '))
  // 見えている中央ペインの行(表示順)
  const visible = (col) =>
    ev((col) => [...document.querySelectorAll('.ssg-body-row[data-pane=center]:not(.ssg-pinned-row)')]
      .filter((r) => r.dataset.rowKey)
      .sort((a, b) => +a.dataset.rowIndex - +b.dataset.rowIndex)
      .map((r) => ({ key: r.dataset.rowKey, idx: +r.dataset.rowIndex, text: r.querySelector(`[data-ssg-col-key="${col}"]`)?.textContent ?? null })), col)
  const cellOf = (key, col) => page.locator(`.ssg-body-row[data-row-key="${key}"]:not(.ssg-pinned-row) [data-ssg-col-key="${col}"]`).first()
  await sleep(1500)

  // 1) 更新回数・固定行・条件付き書式・光るセル
  out.ticks1 = await ev(() => document.querySelector('[data-testid=ticks]')?.textContent)
  out.pinned = await ev(() => [...document.querySelectorAll('.ssg-pinned-row[data-pane=center]')].map((r) => r.textContent.slice(0, 40)))
  out.pinnedLeft = await ev(() => [...document.querySelectorAll('.ssg-pinned-row[data-pane=left]')].map((r) => r.textContent.slice(0, 30)))
  out.cf = await ev(() => ({
    scale: document.querySelectorAll('.ssg-body-cell--cf-scale').length,
    bar: document.querySelectorAll('.ssg-cf-bar').length,
    chip: document.querySelectorAll('.ssg-chip').length,
  }))
  let maxChanged = 0
  for (let i = 0; i < 20; i++) {
    maxChanged = Math.max(maxChanged, await ev(() => document.querySelectorAll('.ssg-body-cell--changed').length))
    await sleep(100)
  }
  out.maxChangedCells = maxChanged
  await page.screenshot({ path: `${__dirname}/shots/t5-${label}-${mode}-live.png` })

  // 2) 集計(並べ替えなし。株価の列を 10 行)
  const rows0 = await visible('price')
  await cellOf(rows0[0].key, 'price').click()
  await cellOf(rows0[9].key, 'price').click({ modifiers: ['Shift'] })
  await sleep(300)
  out.agg1 = (await bottom()).match(/平均.*$/)?.[0]
  await sleep(1500)
  out.agg2 = (await bottom()).match(/平均.*$/)?.[0]
  out.aggLive = out.agg1 !== out.agg2
  // 止めて DOM と比べる
  await setMode('off')
  await sleep(1200)
  const rowsOff = await visible('price')
  const domSum = rowsOff.slice(0, 10).reduce((s, r) => s + Number(String(r.text).replace(/,/g, '')), 0)
  const dataSum = await ev((keys) => window.__stocks().filter((s) => keys.includes(s.symbol)).reduce((a, s) => a + s.price, 0), rowsOff.slice(0, 10).map((r) => r.key))
  out.aggStopped = (await bottom()).match(/平均.*$/)?.[0]
  out.domSum = domSum
  out.dataSum = dataSum
  // コピー(止めた状態)
  await page.keyboard.press('Control+c')
  await sleep(200)
  const clip1 = await ev(() => navigator.clipboard.readText())
  out.copyStoppedMatches = clip1.trim().split(/\r?\n/).map((v) => Number(v)).reduce((a, b) => a + b, 0) === dataSum
  // 更新中のコピー
  await setMode(mode)
  await sleep(700)
  await page.keyboard.press('Control+c')
  await sleep(50)
  const clip2 = await ev(() => navigator.clipboard.readText())
  const clipKeys = (await visible('price')).slice(0, 10).map((r) => r.key)
  const dataNow = await ev((keys) => keys.map((k) => window.__stocks().find((s) => s.symbol === k)?.price), clipKeys)
  const clipVals = clip2.trim().split(/\r?\n/).map(Number)
  out.copyLiveLines = clipVals.length
  out.copyLiveAllIntegers = clipVals.every((v) => Number.isInteger(v))
  out.copyLiveDiffFromNow = clipVals.filter((v, i) => v !== dataNow[i]).length // 0〜数個(コピー後に更新が来れば差が出る)

  // 3) メモの編集(並べ替えなし)→ undo
  const memoKey = rows0[2].key
  await cellOf(memoKey, 'memo').dblclick()
  await sleep(150)
  out.editorOpen = await page.locator('.ssg-cell-editor').count()
  for (const ch of ['注', '目']) {
    await page.keyboard.insertText(ch)
    await sleep(400) // 打っている間に更新が来る
  }
  await page.keyboard.press('Enter')
  await sleep(300)
  out.memoAfterCommit = await ev((k) => window.__stocks().find((s) => s.symbol === k)?.memo, memoKey)
  out.editorClosed = (await page.locator('.ssg-cell-editor').count()) === 0
  await sleep(2000)
  out.memoAfterTicks = await ev((k) => window.__stocks().find((s) => s.symbol === k)?.memo, memoKey)
  out.canUndo = await ev(() => window.__stockGrid.canUndo())
  await setMode('off')
  await sleep(400)
  const before = await ev(() => window.__stocks().map((s) => [s.symbol, s.price, s.volume, s.memo]))
  await page.keyboard.press('Control+z')
  await sleep(400)
  const after = await ev(() => window.__stocks().map((s) => [s.symbol, s.price, s.volume, s.memo]))
  out.memoAfterUndo = after.find((r) => r[0] === memoKey)?.[3]
  out.undoPriceRolledBack = after.filter((r, i) => r[1] !== before[i][1] || r[2] !== before[i][2]).length
  await setMode(mode)
  await sleep(500)

  // 4) 前日比で降順(列メニュー)
  const th = page.locator('.ssg-header-cell', { hasText: '前日比' })
  await th.hover()
  await th.locator('.ssg-icon-btn').last().click()
  await sleep(300)
  await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: '降順' }).first().click()
  await sleep(1500)
  out.topBarSorted = await topBar()
  // アクティブセルが行に付いていくか(12 行目のメモ)
  const sorted = await visible('changePct')
  const followKey = sorted[12].key
  await cellOf(followKey, 'memo').click()
  let moved = 0
  let mismatch = 0
  let prevIdx = await ev((k) => window.__stockGrid.getViewRowIndex(k), followKey)
  for (let i = 0; i < 24; i++) {
    await sleep(250)
    const r = await ev((k) => ({ v: window.__stockGrid.getViewRowIndex(k), a: window.__stockGrid.getActiveCell() }), followKey)
    if (r.v !== prevIdx) moved++
    prevIdx = r.v
    if (!r.a || r.a.row !== r.v) mismatch++
  }
  out.followMoves = moved
  out.followMismatch = mismatch
  // 並べ替えが保たれているか(止めて調べる)
  await setMode('off')
  await sleep(1200)
  const sortedOff = await visible('changePct')
  const pct = sortedOff.map((r) => parseFloat(String(r.text).replace('%', '')))
  out.sortViolations = pct.filter((v, i) => i > 0 && v > pct[i - 1] + 1e-9).length
  out.sortSample = pct.slice(0, 6)
  await setMode(mode)

  // 5) 並べ替え中に何行かの範囲を選ぶ → 入れ替わったら 1 セルに
  const s2 = await visible('name')
  await cellOf(s2[5].key, 'name').click()
  await cellOf(s2[9].key, 'name').click({ modifiers: ['Shift'] })
  await sleep(100)
  const sel0 = await ev(() => JSON.stringify(window.__stockGrid.getSelection()))
  await sleep(3000)
  const sel1 = await ev(() => JSON.stringify(window.__stockGrid.getSelection()))
  out.rangeSel0 = sel0.slice(0, 160)
  out.rangeSel1 = sel1.slice(0, 160)

  // 6) 並べ替え中にメモを編集(打っている間に行が動く)
  const s3 = await visible('changePct')
  const editKey = s3[10].key
  const belowKey = s3[11].key
  await cellOf(editKey, 'memo').dblclick()
  await sleep(150)
  for (const ch of ['a', 'b', 'c']) {
    await page.keyboard.type(ch)
    await sleep(500)
  }
  const idxBeforeEnter = await ev((k) => window.__stockGrid.getViewRowIndex(k), editKey)
  await page.keyboard.press('Enter')
  await sleep(300)
  out.sortedEditMemo = await ev((k) => window.__stocks().find((s) => s.symbol === k)?.memo, editKey)
  out.sortedEditWrongRows = await ev(() => window.__stocks().filter((s) => s.memo === 'abc' || s.memo === 'ab' || s.memo === 'a').map((s) => s.symbol))
  out.sortedEditEditKey = editKey
  out.sortedEditIdxBeforeEnter = idxBeforeEnter
  out.activeAfterEnter = await ev(() => window.__stockGrid.getActiveCell())
  await page.screenshot({ path: `${__dirname}/shots/t5-${label}-${mode}-sorted.png` })

  out.logs = logs.filter((l) => !l.includes('[vite]'))
  console.log(JSON.stringify(out, null, 1))
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
