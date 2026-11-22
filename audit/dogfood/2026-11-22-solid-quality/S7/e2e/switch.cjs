// プロジェクトの切り替え: 取り直しの間の表示・isPending・<Loading on>・操作できるか
const { open, clickCell, getCell, activeInfo, setSettings, shot, dumpLogs, sleep } = require('./lib.cjs')
const [loadMode = 'memo', loadingOn = '0'] = process.argv.slice(2)
;(async () => {
  const { browser, page, logs } = await open()
  await setSettings(page, { loadMode, saveMode: 'onFlush', loadingOn: loadingOn === '1', fill: false })
  await page.goto('http://localhost:5507/projects/web?minDelay=1500&maxDelay=1500&loadFail=0&saveFail=0')
  await page.waitForSelector('[role=grid][aria-label="タスク"] [data-row-key="web-1"]', { timeout: 15000 })
  await clickCell(page, 'タスク', 'web-2', 'title')
  const snap = async (label) => {
    const s = await page.evaluate(() => {
      const g = document.querySelector('[role=grid][aria-label="タスク"]')
      return {
        url: location.pathname,
        current: document.querySelector('a[aria-current=page]')?.textContent ?? null,
        grid: !!g,
        firstKey: g?.querySelector('[role=row][data-row-key]')?.getAttribute('data-row-key') ?? null,
        loading: !!document.querySelector('.panel-loading'),
        pending: !!document.querySelector('[data-testid=pending]'),
        stale: !!document.querySelector('.panel.stale'),
        count: document.querySelector('[data-testid=remaining]')?.textContent ?? null,
        bar: g?.closest('.ssg-root')?.querySelector('.ssg-bar--bottom')?.textContent?.match(/セル\s*\S+?(?=範囲)/)?.[0] ?? null,
        menu: !!document.querySelector('[role=menu]'),
      }
    })
    console.log(label.padEnd(18), JSON.stringify(s))
  }
  await snap('切り替え前')
  await page.click('a[data-project=app]')
  const t0 = Date.now()
  await sleep(150); await snap('押して 150ms')
  // 取り直しの間に操作できるか: 矢印キー / スクロール / 列メニュー
  await page.keyboard.press('ArrowDown'); await sleep(150); await snap('↓ を押した')
  const hb = await page.$('[role=grid][aria-label="タスク"] [role=columnheader][data-ssg-col-key="assignee"]')
  if (hb) { const b = await hb.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: 'right' }) }
  await sleep(200); await snap('見出しを右クリック')
  await page.keyboard.press('Escape')
  await page.mouse.wheel(0, 600); await sleep(300); await snap('ホイール')
  await sleep(800); await snap('押して ~1.6s')
  await sleep(1200); await snap('押して ~2.8s')
  await shot(page, `switch-${loadMode}-${loadingOn}`)
  // 戻る
  await page.goBack(); await sleep(150); await snap('戻る 150ms')
  await sleep(2000); await snap('戻る 2s')
  console.log('--- console'); console.log(logs.filter((l) => !l.includes('[vite]')).join('\n'))
  await browser.close()
})()
