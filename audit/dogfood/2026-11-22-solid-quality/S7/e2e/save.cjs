// 編集を action + createOptimistic で保存する。saveMode を引数で
const { open, clickCell, getCell, activeInfo, setSettings, shot, dumpLogs, sleep } = require('./lib.cjs')
const [loadMode = 'memo', saveMode = 'direct', failNext = '0'] = process.argv.slice(2)
;(async () => {
  const { browser, page, logs } = await open()
  await setSettings(page, { loadMode, saveMode, fill: process.env.FILL !== '0' })
  await page.goto('http://localhost:5507/projects/web?minDelay=1000&maxDelay=1000&loadFail=0&saveFail=0')
  await page.waitForSelector('[role=grid][aria-label="タスク"] [data-row-key="web-1"]')
  await page.evaluate((n) => (window.__api.failNextSave = n), Number(failNext))
  const before = await getCell(page, 'タスク', 'web-2', 'estimate')
  await clickCell(page, 'タスク', 'web-2', 'estimate')
  await page.keyboard.type('7.5')
  await page.keyboard.press('Enter')
  const t0 = Date.now()
  const samples = []
  for (let i = 0; i < 12; i++) {
    await sleep(150)
    const a = await activeInfo(page, 'タスク')
    samples.push({ t: Date.now() - t0, cell: await getCell(page, 'タスク', 'web-2', 'estimate'), active: a.active, editor: a.editor, bar: (a.bar.match(/セル\s*\S+/) || [''])[0], saving: await page.$eval('body', () => !!document.querySelector('[data-testid=saving]')), msg: await page.evaluate(() => document.querySelector('[data-testid=save-message]')?.textContent ?? null) })
    if (i === 1) {
      // 保存中に矢印キーで動かす
      await page.keyboard.press('ArrowDown')
      samples.push({ t: Date.now() - t0, note: 'ArrowDown を押した' })
    }
  }
  await sleep(800)
  const a = await activeInfo(page, 'タスク')
  const db = await page.evaluate(() => window.__db.tasks.get('web').find((t) => t.id === 'web-2').estimate)
  console.log(JSON.stringify({ loadMode, saveMode, failNext, before, samples, final: { cell: await getCell(page, 'タスク', 'web-2', 'estimate'), active: a.active, bar: a.bar, db, msg: await page.evaluate(() => document.querySelector('[data-testid=save-message]')?.textContent ?? null), events: await page.evaluate(() => window.__events), api: await page.evaluate(() => window.__api.log) } }, null, 1))
  await shot(page, `save-${loadMode}-${saveMode}-${failNext}`)
  dumpLogs(logs, `save-${loadMode}-${saveMode}-${failNext}.log`)
  console.log('--- console'); console.log(logs.filter((l) => !l.includes('[vite]')).join('\n'))
  await browser.close()
})()
