// <Loading on> で fallback に替わる間に、開いていたポップアップがどうなるか
const { open, clickCell, setSettings, shot, sleep } = require('./lib.cjs')
const [kind = 'filter', loadMode = 'memo'] = process.argv.slice(2)
;(async () => {
  const { browser, page, logs } = await open()
  await setSettings(page, { loadMode, saveMode: 'onFlush', fill: false, loadingOn: true })
  await page.goto('http://localhost:5507/projects/web?minDelay=1500&maxDelay=1500&loadFail=0&saveFail=0')
  await page.waitForSelector('[role=grid][aria-label="タスク"] [data-row-key="web-1"]', { timeout: 15000 })
  const st = async (label) => console.log(label.padEnd(10), JSON.stringify(await page.evaluate(() => ({ grid: !!document.querySelector('[role=grid][aria-label="タスク"]'), loading: !!document.querySelector('.panel-loading'), portals: [...document.body.children].filter((e) => e.id !== 'root' && e.tagName !== 'SCRIPT').map((e) => e.className || e.tagName).join(','), editor: !!document.querySelector('.ssg-cell-editor'), focus: document.activeElement?.className }))))
  if (kind === 'filter') {
    const hdr = await page.$('[role=grid][aria-label="タスク"] [role=columnheader][data-ssg-col-key="status"]')
    const hb = await hdr.boundingBox(); await page.mouse.move(hb.x + 20, hb.y + 10)
    await (await hdr.$('button')).click(); await sleep(200)
    await page.click('[role=menu] >> text=フィルター…'); await sleep(500)
  } else if (kind === 'select') {
    await clickCell(page, 'タスク', 'web-3', 'assignee', { double: true }); await sleep(300)
  } else if (kind === 'edit') {
    await clickCell(page, 'タスク', 'web-3', 'title', { double: true }); await page.keyboard.type('abc'); await sleep(100)
  }
  await st('開いた')
  // キーボードでプロジェクトを替える代わりに、history から移る(リンクを押すと外側クリックで閉じるため)
  await page.evaluate(() => { history.pushState(null, '', '/projects/app' + location.search); dispatchEvent(new PopStateEvent('popstate')) })
  await sleep(300); await st('切替 300ms'); await shot(page, `loadingon-${kind}-during`)
  await sleep(Number(process.env.WAIT ?? 2000)); await st('切替の後'); await shot(page, `loadingon-${kind}-after`)
  console.log('db', JSON.stringify(await page.evaluate(() => ({ api: window.__api.log, events: window.__events, web3: window.__db.tasks.get('web')[2].title, appHasWeb: window.__db.tasks.get('app').filter((t) => t.id.startsWith('web')).length, first: document.querySelector('[role=grid] [data-row-key]')?.getAttribute('data-row-key') }))))
  console.log('--- console'); console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n')[0]).join('\n'))
  await browser.close()
})()
