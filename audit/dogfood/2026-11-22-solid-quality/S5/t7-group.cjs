// 株価タブ: 業種でまとめる(rowGroup + aggFunc)を更新中に確かめる
// 使い方: node t7-group.cjs <label> <signal|apply>
const { open, sleep } = require('./lib.cjs')
;(async () => {
  const label = process.argv[2] ?? 'x'
  const mode = process.argv[3] ?? 'signal'
  const { browser, page, logs } = await open(`http://127.0.0.1:5505/?n=1000&tab=stocks&mode=${mode}&group`)
  await page.waitForSelector('.ssg-body-cell', { timeout: 60000 })
  await sleep(1500)
  const out = { label, mode }
  const ev = (f, a) => page.evaluate(f, a)
  const groupRowsText = () =>
    ev(() => [...document.querySelectorAll('.ssg-body-row[data-pane=center]:not(.ssg-pinned-row)')]
      .sort((a, b) => +a.dataset.rowIndex - +b.dataset.rowIndex)
      .slice(0, 4)
      .map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 90)))
  out.groups = await ev(() => window.__stockGrid.getGroupRows().map((g) => `${g.value}:${g.collapsed}`).join(' '))
  out.rows1 = await groupRowsText()
  out.topBar = await ev(() => (document.querySelector('.ssg-bar--top')?.innerText ?? '').replace(/\s+/g, ' '))
  await sleep(2000)
  out.rows2 = await groupRowsText()
  out.aggUpdates = JSON.stringify(out.rows1) !== JSON.stringify(out.rows2)
  // 1 つのグループを開く
  const g0 = await ev(() => window.__stockGrid.getGroupRows()[0])
  await ev((k) => window.__stockGrid.setGroupCollapsed(k, false), g0.groupKey)
  await sleep(600)
  out.afterExpand = await ev(() => document.querySelectorAll('.ssg-body-row[data-pane=center]:not(.ssg-pinned-row)').length)
  let maxChanged = 0
  for (let i = 0; i < 15; i++) {
    maxChanged = Math.max(maxChanged, await ev(() => document.querySelectorAll('.ssg-body-cell--changed').length))
    await sleep(100)
  }
  out.maxChangedInGroup = maxChanged
  // ▸ を押して閉じる(キーボード / マウス)
  out.groupsAfter = await ev(() => window.__stockGrid.getGroupRows().slice(0, 3).map((g) => `${g.value}:${g.collapsed}`).join(' '))
  await page.screenshot({ path: `${__dirname}/shots/t7-${label}-${mode}-group.png` })
  // 業種でまとめるを外す → 戻す
  await page.locator('[data-testid=group]').uncheck()
  await sleep(800)
  out.ungroupedRows = await ev(() => window.__stockGrid.getGroupRows().length)
  await page.locator('[data-testid=group]').check()
  await sleep(800)
  out.regroupedRows = await ev(() => window.__stockGrid.getGroupRows().length)
  out.logs = logs.filter((l) => !l.includes('[vite]'))
  console.log(JSON.stringify(out, null, 1))
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
