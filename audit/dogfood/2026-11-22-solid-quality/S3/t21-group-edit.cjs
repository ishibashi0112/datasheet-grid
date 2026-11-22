// グループ化した表で、編集中(打ちかけ)に上へ行が足されたとき、エディタと打ちかけの文字とフォーカスが残るか
// 使い方: node t21-group-edit.cjs <app|min> <label> [query]
const { open, sleep } = require('./lib.cjs')
const kind = process.argv[2] ?? 'min'
const label = process.argv[3] ?? kind
const query = process.argv[4] ?? ''
const cfg = kind === 'app'
  ? { url: 'http://127.0.0.1:5503/?grid=group' + query, key: 'P00051', other: 'P00052', num: 'price', date: 'releasedAt', memo: 'description', custom: 'supplier', scroll: 51 }
  : { url: 'http://127.0.0.1:5503/group.html?x' + query, key: 'B1', other: 'B2', num: 'qty', date: 'day', memo: 'memo', custom: 'city', scroll: null }
const cellSel = (k, c) => `.ssg-body-row[data-pane="center"][data-row-key="${k}"] [data-ssg-col-key="${c}"]`
;(async () => {
  const results = []
  for (const which of ['num', 'date', 'memo', 'custom']) {
    const { browser, page, logs } = await open(cfg.url)
    await page.waitForSelector('.ssg-body-cell', { timeout: 15000 }); await sleep(800)
    if (cfg.scroll !== null) { await page.evaluate((i) => window.__grid().scrollToRow(i, 'center'), cfg.scroll); await sleep(500) }
    const col = cfg[which]
    const state = () => page.evaluate(({ k, c }) => {
      const a = document.activeElement
      const ed = document.querySelector('.ssg-cell-editor')
      const row = document.querySelector(`.ssg-body-row[data-pane="center"][data-row-key="${k}"]`)
      const cell = row?.querySelector(`[data-ssg-col-key="${c}"]`)
      return {
        editors: document.querySelectorAll('.ssg-cell-editor').length,
        focus: `${a?.tagName}${a?.getAttribute('type') ? '[' + a.getAttribute('type') + ']' : ''}.${String(a?.className ?? '').slice(0, 28)}`,
        value: a && 'value' in a ? a.value : undefined,
        edTop: ed ? Math.round(ed.getBoundingClientRect().top) : null,
        cellTop: cell ? Math.round(cell.getBoundingClientRect().top) : null,
        mounts: window.__mounts,
      }
    }, { k: cfg.key, c: col })
    await page.locator(cellSel(cfg.key, col)).click(); await sleep(150)
    let typedA, typedB, expect
    if (which === 'num') { typedA = '12'; typedB = '34'; await page.keyboard.type(typedA); expect = '1234' }
    else if (which === 'date') { await page.keyboard.press('F2'); await sleep(150); typedA = '0315'; typedB = '2026'; await page.keyboard.type(typedA); expect = '2026-03-15' }
    else if (which === 'memo') { typedA = 'abc'; typedB = 'f'; await page.keyboard.type('abc'); await page.keyboard.press('Alt+Enter'); await page.keyboard.type('de'); expect = 'abc\ndef' }
    else { typedA = 'x'; typedB = 'y'; await page.keyboard.type('x'); expect = 'xy' }
    await sleep(300)
    const before = await state()
    await page.evaluate(() => window.__insertTop()); await sleep(400)
    const after = await state()
    await page.keyboard.type(typedB); await sleep(150)
    const afterType = await state()
    await page.keyboard.press('Enter'); await sleep(400)
    const data = await page.evaluate(({ k, c }) => { const r = window.__rows().find((x) => x.id === k); return r ? r[c] : 'NO ROW' }, { k: cfg.key, c: col })
    const changedOthers = await page.evaluate(({ c, v }) => window.__rows().filter((x) => String(x[c]) === v).map((x) => x.id), { c: col, v: expect })
    const errs = logs.filter((l) => /error|warn/i.test(l) && !l.includes('[vite]') && !l.includes('STRICT_READ') && !l.includes('HUGE_FAN')).map((l) => l.split('\n')[0].slice(0, 200))
    results.push({ which, col, before, after, afterType, saved: JSON.stringify(data), expect: JSON.stringify(expect), rowsWithValue: changedOthers.join(','), errs })
    await page.screenshot({ path: `${__dirname}/shots/t21-${label}-${which}.png` })
    await browser.close()
  }
  for (const r of results) {
    console.log(`[${label}] ${r.which}(${r.col}): before=${JSON.stringify(r.before)}`)
    console.log(`    after insert=${JSON.stringify(r.after)}`)
    console.log(`    after typing more=${JSON.stringify(r.afterType)}`)
    console.log(`    saved=${r.saved} expect=${r.expect} rowsWithValue=[${r.rowsWithValue}] ${r.errs.length ? 'ERRS ' + r.errs.join(' | ') : ''}`)
  }
})()
