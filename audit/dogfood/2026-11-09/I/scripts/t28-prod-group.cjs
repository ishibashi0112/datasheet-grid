// 本番: グループ化したときの見出しと、AI の流れ
const { open, askBar, barText, counts } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  await page.click('[data-testid=toggle-group]');
  await page.waitForTimeout(600);
  const groupTexts = () => page.evaluate(() => [...document.querySelectorAll('.ssg-body-row[data-pane="center"], .ssg-body-row')].map((r) => r.innerText.replace(/\n/g, ' | ')).filter((t) => /件/.test(t)).slice(0, 4));
  console.log('group rows', await groupTexts());
  await askBar(page, '関東の 10 万円以上');
  console.log('after ask', await counts(page), await groupTexts());
  await askBar(page, '例外を投げる');
  console.log('throw', (await barText(page)).split('\n').slice(7, 9).join(' / '));
  console.log('LOGS', logs.filter((l) => !/DevTools/.test(l)).join('\n'));
  await browser.close();
})();
