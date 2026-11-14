const { open, askBar, barText, state, counts } = require('./lib.cjs');
const CJK = /[　-〿぀-ヿ㐀-鿿＀-￯]/;
const jaInBar = (page) => page.evaluate((src) => {
  const re = new RegExp(src);
  const root = document.querySelector('.ssg-ask');
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3 && re.test(n.textContent)) out.push('text:' + n.textContent.trim());
    if (n.nodeType === 1) {
      for (const a of ['aria-label', 'title', 'placeholder', 'aria-description']) {
        const v = n.getAttribute(a);
        if (v && re.test(v)) out.push(`${a}:${v}`);
      }
      n.childNodes.forEach(walk);
    }
  };
  walk(root);
  return out;
}, CJK.source);
const tail = async (page) => (await barText(page)).split('\n').slice(7).join(' / ');
(async () => {
  const { browser, page, logs } = await open('?lang=en');
  console.log('initial bar:', JSON.stringify(await barText(page)));
  console.log(' ja in bar:', await jaInBar(page));
  const steps = ['Kanto, 100,000 yen or more', 'Also qty 10 or more', 'Last month, largest amount first', 'Unpaid ones', 'This month', 'search pen', 'notebooks or pens', 'except cancelled', 'memo urgent', 'best sellers', 'hide memo please', 'status is blank'];
  for (const s of steps) {
    await askBar(page, s);
    await page.waitForTimeout(300);
    const ja = await jaInBar(page);
    console.log(`■ ${s}: ${await tail(page)}${ja.length ? '\n   JA: ' + JSON.stringify(ja) : ''}`);
  }
  // 不正な答え(英語の理由)
  for (const s of ['範囲外', '型違い', '空の答え', 'null の答え', '例外']) {
    await askBar(page, s);
    await page.waitForTimeout(300);
    const ja = (await jaInBar(page)).filter((x) => !x.includes(s));
    console.log(`■ ${s}: ${await tail(page)}${ja.length ? '\n   JA: ' + JSON.stringify(ja) : ''}`);
  }
  // 考えている間
  await page.click('.ssg-ask-input');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('slow one');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('thinking:', await tail(page), JSON.stringify(await jaInBar(page)));
  await page.screenshot({ path: 'shots/13-en-thinking.png' });
  await page.keyboard.press('Escape');
  await askBar(page, 'This month');
  // 手で変える → 古い
  await page.evaluate(() => window.__grid.applyState({ filters: { globalText: 'x' } }));
  await page.waitForTimeout(1300);
  console.log('stale:', await tail(page));
  // プロンプトの日付のプリセット名
  console.log('prompt date line:', await page.evaluate(() => window.__askLog.at(-1).prompt.split('\n').find((l) => l.startsWith('- date'))));
  console.log('prompt region line:', await page.evaluate(() => window.__askLog.at(-1).prompt.split('\n').find((l) => l.startsWith('- region'))));
  // グリッドの上部 / 下部バーに日本語が残っていないか
  const gridJa = await page.evaluate((src) => {
    const re = new RegExp(src);
    const bars = [...document.querySelectorAll('.ssg-root [class*="bar"]')];
    return bars.map((b) => b.innerText).filter((t) => re.test(t)).map((t) => t.slice(0, 100));
  }, CJK.source);
  console.log('grid bars with JA:', gridJa);
  await askBar(page, 'Kanto, 100,000 yen or more');
  await page.screenshot({ path: 'shots/13-en.png' });
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
