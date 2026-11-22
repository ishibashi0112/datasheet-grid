// S7 の本物の画面で: 保存中(onFlush)に次のセルを打ち始めると止まる。止まった後に何ができるか
const { open, clickCell, getCell, activeInfo, setSettings, shot, sleep } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open()
  await setSettings(page, { loadMode: 'deferred', saveMode: 'onFlush', fill: true })
  await page.goto('http://localhost:5507/projects/web?minDelay=800&maxDelay=800&loadFail=0&saveFail=0')
  await page.waitForSelector('[role=grid][aria-label="タスク"] [data-row-key="web-1"]')
  const st = async (l) => { const a = await activeInfo(page, 'タスク'); console.log(l.padEnd(16), JSON.stringify({ active: a.active, editor: a.editorValue, focus: a.focus, e3: await getCell(page, 'タスク', 'web-3', 'title'), e5: await getCell(page, 'タスク', 'web-5', 'title'), editors: await page.evaluate(() => document.querySelectorAll('.ssg-cell-editor').length) })) }
  await clickCell(page, 'タスク', 'web-2', 'title')
  await page.keyboard.type('A'); await page.keyboard.press('Enter')
  await sleep(200)
  await page.keyboard.type('B')
  await sleep(200); await st('保存中に B')
  await shot(page, 'stuck-during')
  await sleep(2500); await st('保存の後')
  await page.keyboard.press('Escape'); await sleep(200); await st('Esc')
  await clickCell(page, 'タスク', 'web-5', 'title'); await sleep(200); await st('別のセルを押す')
  await page.keyboard.type('C'); await page.keyboard.press('Enter'); await sleep(300); await st('C + Enter')
  // 止まったエディタを押して打つ
  const ed = await page.$('.ssg-cell-editor input')
  if (ed) { await ed.click(); await page.keyboard.type('D'); await page.keyboard.press('Enter'); await sleep(1500); await st('エディタを押して D') }
  await clickCell(page, 'タスク', 'web-6', 'title', { double: true }); await sleep(300); await st('ダブルクリック')
  await shot(page, 'stuck-after')
  console.log('--- console'); console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n')[0]).join('\n'))
  await browser.close()
})()
