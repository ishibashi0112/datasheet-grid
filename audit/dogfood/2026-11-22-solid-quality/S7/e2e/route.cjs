// ルートの切り替えでグリッドが外れて付く: 編集中・保存中・ポップアップを開いたまま
const { open, clickCell, getCell, activeInfo, setSettings, shot, sleep } = require('./lib.cjs')
const [loadMode = 'deferred', fill = '0'] = process.argv.slice(2)
;(async () => {
  const { browser, page, logs } = await open()
  await setSettings(page, { loadMode, saveMode: 'onFlush', fill: fill === '1' })
  const url = 'http://localhost:5507/projects/web?minDelay=800&maxDelay=800&loadFail=0&saveFail=0'
  const ready = () => page.waitForSelector('[role=grid][aria-label="タスク"] [data-row-key="web-1"]', { timeout: 15000 })
  const popups = () => page.evaluate(() => ({
    menus: document.querySelectorAll('[role=menu]').length,
    dialogs: [...document.querySelectorAll('[role=dialog]')].map((d) => d.className).join(','),
    listbox: document.querySelectorAll('[role=listbox]').length,
    portals: [...document.body.children].filter((e) => e.id !== 'root' && e.tagName !== 'SCRIPT').map((e) => e.className || e.tagName).join(','),
    grids: [...document.querySelectorAll('[role=grid]')].map((g) => g.getAttribute('aria-label')).join(','),
    path: location.pathname,
  }))
  await page.goto(url); await ready()
  const mark = (s) => logs.push(`---- ${s}`)

  // (a) 編集中にメンバーへ
  mark('a 編集中に移る')
  await clickCell(page, 'タスク', 'web-3', 'title', { double: true })
  await page.keyboard.press('End'); await page.keyboard.type('X')
  await page.click('a[data-link=members]')
  await sleep(500)
  console.log('a 編集中にメンバーへ', JSON.stringify(await popups()), 'events', await page.evaluate(() => window.__events.join(',')))
  await page.goBack(); await ready(); await sleep(300)
  console.log('a 戻った', await getCell(page, 'タスク', 'web-3', 'title'), JSON.stringify(await page.evaluate(() => window.__db.tasks.get('web')[2].title)))

  // (b) 保存中にメンバーへ
  mark('b 保存中に移る')
  await clickCell(page, 'タスク', 'web-4', 'estimate')
  await page.keyboard.type('9'); await page.keyboard.press('Enter')
  await sleep(100)
  await page.click('a[data-link=members]')
  await sleep(2500)
  console.log('b 保存中にメンバーへ', JSON.stringify(await popups()), 'api', await page.evaluate(() => window.__api.log.slice(-4).join(',')), 'db', await page.evaluate(() => window.__db.tasks.get('web')[3].estimate))
  await page.goBack(); await ready(); await sleep(300)
  console.log('b 戻った', await getCell(page, 'タスク', 'web-4', 'estimate'))

  // (c) 列フィルターを開いたまま戻る(ブラウザの戻る)
  mark('c 列フィルター')
  await page.click('a[data-link=members]'); await sleep(300); await page.goBack(); await ready(); await sleep(300)
  const hdr = await page.$('[role=grid][aria-label="タスク"] [role=columnheader][data-ssg-col-key="status"]')
  const hb = await hdr.boundingBox()
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  const menuBtn = await hdr.$('button')
  await menuBtn.click()
  await sleep(300)
  const items = await page.$$eval('[role=menu] [role=menuitem], [role=menu] [role=menuitemradio]', (els) => els.map((e) => e.textContent.trim()))
  console.log('c 列メニュー', items.join(' / '))
  // 「フィルター」項目を押す
  const filterItem = await page.$('[role=menu] [role=menuitem]:has-text("フィルター")')
  if (filterItem) await filterItem.click()
  await sleep(600)
  console.log('c フィルター開いた', JSON.stringify(await popups()))
  await shot(page, 'route-filter-open')
  await page.goForward(); await sleep(600)
  console.log('c 進む(メンバー)', JSON.stringify(await popups()))
  await shot(page, 'route-filter-after')
  await page.goBack(); await ready(); await sleep(500)
  console.log('c 戻った', JSON.stringify(await popups()))

  // (d) 右クリックメニューを開いたまま進む
  mark('d 右クリック')
  const cb = await (await page.$('[role=grid][aria-label="タスク"] [data-row-key="web-5"] [data-ssg-col-key="title"]')).boundingBox()
  await page.mouse.click(cb.x + 30, cb.y + 10, { button: 'right' })
  await sleep(300)
  console.log('d 右クリック', JSON.stringify(await popups()))
  await page.goForward(); await sleep(500)
  console.log('d 進む', JSON.stringify(await popups()))
  await page.goBack(); await ready(); await sleep(500)

  // (e) select エディタの候補を開いたまま進む
  mark('e select')
  await clickCell(page, 'タスク', 'web-6', 'assignee', { double: true })
  await sleep(300)
  console.log('e select 開いた', JSON.stringify(await popups()))
  await page.goForward(); await sleep(500)
  console.log('e 進む', JSON.stringify(await popups()))
  await page.goBack(); await ready(); await sleep(500)

  // 最後にふつうに編集できるか
  mark('f 最後')
  await clickCell(page, 'タスク', 'web-7', 'title')
  await page.keyboard.type('最後'); await page.keyboard.press('Enter')
  await sleep(2500)
  console.log('f 最後に編集', await getCell(page, 'タスク', 'web-7', 'title'), JSON.stringify(await activeInfo(page, 'タスク')))
  console.log('--- console'); console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n')[0]).join('\n'))
  await browser.close()
})()
