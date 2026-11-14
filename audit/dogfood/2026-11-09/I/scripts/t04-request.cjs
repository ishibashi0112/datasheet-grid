const fs = require('fs');
const { open, askBar, barText } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  // 手でフィルター: 担当の textSet で値を選ぶ(行から集めた値)→ その後 AI に refine
  await askBar(page, '関東の 10 万円以上');
  await askBar(page, 'さらに数量 10 以上だけ');
  await askBar(page, 'ノートかボールペン');
  const log = await page.evaluate(() => window.__askLog);
  fs.writeFileSync('requests.json', JSON.stringify(log, null, 2));
  // 行のデータが入っていないか: 顧客コード・メモ・担当名・金額・日付を探す
  const rows = await page.evaluate(() => window.__rows.slice(0, 20000));
  const reps = [...new Set(rows.map((r) => r.rep))];
  const customers = [...new Set(rows.map((r) => r.customer))];
  const memos = ['分納', '請求書再発行', '担当変更あり', '要確認', '見積から変更'];
  const amounts = [...new Set(rows.map((r) => String(r.amount)))].filter((a) => a.length >= 5);
  for (const e of log) {
    const text = e.system + '\n' + e.prompt + '\n' + JSON.stringify(e.schema);
    const hit = {
      reps: reps.filter((x) => text.includes(x)),
      customers: customers.filter((x) => text.includes(x)).slice(0, 5),
      memos: memos.filter((x) => text.includes(x)),
      amounts: amounts.filter((x) => text.includes(x)).slice(0, 10),
      dates: (text.match(/\d{4}-\d{2}-\d{2}/g) || []),
    };
    console.log(e.text, e.bodyBytes, 'bytes', JSON.stringify(hit));
  }
  console.log('--- prompt of 2nd ---\n' + log[1].prompt);
  console.log('--- prompt of 3rd ---\n' + log[2].prompt.split('\n').slice(-6).join('\n'));
  await browser.close();
})();
