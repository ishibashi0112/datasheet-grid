// HMR: dev サーバーを動かしたまま、グリッドを使う部品のファイルと列の定義のファイルを書き換える
const fs = require('fs')
const path = require('path')
const { open, click, text, shot } = require('./lib.cjs')
const SRC = path.join(__dirname, '..', 'src')
const COLS = path.join(SRC, 'columns.tsx')
const PAGES = path.join(SRC, 'pages.tsx')
const orig = { cols: fs.readFileSync(COLS, 'utf8'), pages: fs.readFileSync(PAGES, 'utf8') }
const restore = () => {
  fs.writeFileSync(COLS, orig.cols)
  fs.writeFileSync(PAGES, orig.pages)
}
process.on('exit', restore)
process.on('SIGINT', () => process.exit(1))

;(async () => {
  const { browser, page, logs, context } = await open('http://localhost:5501/?tab=signal')
  let loads = 0
  page.on('load', () => loads++)
  const cdp = await context.newCDPSession(page)
  const listeners = async (expr) =>
    (await cdp.send('DOMDebugger.getEventListeners', { objectId: (await cdp.send('Runtime.evaluate', { expression: expr })).result.objectId })).listeners
  const snap = async (label) => {
    const w = await listeners('window')
    const d = await listeners('document')
    const info = await page.evaluate(() => ({
      roots: document.querySelectorAll('.ssg-root').length,
      grids: document.querySelectorAll('[role="grid"]').length,
      bodyChildren: [...document.body.children].map((e) => (typeof e.className === 'string' && e.className) || e.id || e.tagName).join(','),
      header3: document.querySelector('[role="columnheader"][aria-colindex="3"]')?.textContent?.trim(),
      ariaLabel: document.querySelector('[role="grid"]')?.getAttribute('aria-label'),
      hmrMark: document.getElementById('hmr-mark')?.textContent ?? null,
      active: (() => { try { return JSON.stringify(window.__grid?.getActiveCell()) } catch (e) { return 'ERR ' + e.message } })(),
      editor: !!document.querySelector('.ssg-cell-editor'),
      editorValue: document.querySelector('.ssg-cell-editor textarea, .ssg-cell-editor input')?.value ?? null,
      filterPopover: document.querySelectorAll('.ssg-filter-popover').length,
      focus: document.activeElement?.className || document.activeElement?.tagName,
      rowsLen: window.__getRows?.().length,
      r2name: window.__getRows?.()[1]?.name,
    }))
    const winTypes = {}
    for (const l of w) winTypes[l.type] = (winTypes[l.type] || 0) + 1
    return { label, loads, win: w.length, doc: d.length, winTypes: JSON.stringify(winTypes), ...info }
  }
  const out = []
  const waitHmr = async () => { await page.waitForTimeout(1500) }
  out.push(await snap('initial'))

  // 1) 編集して元に戻せる履歴を作る(HMR の後に履歴が残るか)
  await click(page, 3, 3, { clickCount: 2 })
  await page.keyboard.press('Control+a')
  await page.keyboard.type('HMR前の編集')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  out.push(await snap('after edit'))

  // 2) 列の定義のファイルを書き換える(品名 → 品名★)
  fs.writeFileSync(COLS, orig.cols.replace("title: '品名'", "title: '品名★'"))
  await waitHmr()
  out.push(await snap('HMR columns.tsx'))
  // キー操作が 1 回だけ効くか(グリッドが 2 つ動いていれば 2 行動くかも)
  await click(page, 4, 4)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(150)
  out.push(await snap('ArrowDown after HMR1 (expect row 3)'))
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(200)
  out.push(await snap('Ctrl+Z after HMR1'))

  // 3) グリッドを使う部品のファイルを書き換える(ariaLabel と目印の文字)
  fs.writeFileSync(
    PAGES,
    orig.pages
      .replace('ariaLabel="在庫・発注表"', 'ariaLabel="在庫・発注表 HMR2"')
      .replace('<div class="min-h-0 flex-1" data-testid="grid-area">', '<span id="hmr-mark">HMR2</span>\n      <div class="min-h-0 flex-1" data-testid="grid-area">'),
  )
  await waitHmr()
  out.push(await snap('HMR pages.tsx'))
  await click(page, 4, 4)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(150)
  out.push(await snap('ArrowDown after HMR2 (expect row 3)'))

  // 4) 編集中に HMR(列の定義)
  await click(page, 5, 3, { clickCount: 2 })
  await page.keyboard.press('Control+a')
  await page.keyboard.type('打ちかけ')
  await page.waitForTimeout(150)
  out.push(await snap('editing before HMR3'))
  fs.writeFileSync(COLS, orig.cols.replace("title: '品名'", "title: '品名◆'"))
  await waitHmr()
  out.push(await snap('HMR columns.tsx while editing'))
  await shot(page, 't21-hmr-editing')
  await page.keyboard.type('X')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  out.push(await snap('typed X + Enter after HMR3'))

  // 5) 列フィルターを開いたまま HMR(部品のファイル)
  const hdr = page.locator('[role="columnheader"][aria-colindex="4"]').first()
  await hdr.hover()
  await page.waitForTimeout(100)
  await hdr.locator('button, [role="button"]').last().click()
  await page.waitForTimeout(250)
  await page.getByRole('menuitem', { name: /フィルター/ }).first().click()
  await page.waitForTimeout(500)
  out.push(await snap('filter open before HMR4'))
  fs.writeFileSync(PAGES, orig.pages.replace('ariaLabel="在庫・発注表"', 'ariaLabel="在庫・発注表 HMR4"'))
  await waitHmr()
  out.push(await snap('HMR pages.tsx with filter open'))
  await shot(page, 't21-hmr-filter')
  // 残ったポップオーバーで操作できるか / Escape
  const cb = page.getByRole('checkbox', { name: /食品/ })
  out.push({ label: 'food checkbox count', n: await cb.count() })
  if (await cb.count()) {
    await cb.first().click().catch((e) => out.push({ label: 'click err', e: e.message.slice(0, 200) }))
    await page.waitForTimeout(200)
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  out.push(await snap('after Escape'))
  out.push({ label: 'filters', f: await page.evaluate(() => { try { return JSON.stringify(window.__grid.getState().filters) } catch (e) { return 'ERR ' + e.message } }) })

  // 6) 元に戻す(ファイルを戻す)→ もう一度
  restore()
  await waitHmr()
  out.push(await snap('restored files'))
  await click(page, 4, 4)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(150)
  out.push(await snap('ArrowDown after restore'))
  await shot(page, 't21-hmr-final')

  for (const o of out) console.log(JSON.stringify(o))
  console.log('LOGS:\n' + logs.filter((l) => !/\[vite\] (connecting|connected)/.test(l)).map((l) => l.slice(0, 400)).join('\n'))
  await browser.close()
})().catch((e) => { console.error(e); restore(); process.exit(1) })