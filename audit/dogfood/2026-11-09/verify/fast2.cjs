const { chromium } = require('playwright');
function keyEvents(ch) {
  if (ch === '\n') return [
    { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
    { type: 'char', key: 'Enter', text: '\r', unmodifiedText: '\r' },
    { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }];
  const vk = ch.charCodeAt(0);
  return [{ type: 'keyDown', key: ch, code: `Digit${ch}`, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk },
          { type: 'keyUp', key: ch, code: `Digit${ch}`, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }];
}
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1100, height: 700 } });
  const cdp = await page.context().newCDPSession(page);
  for (const gap of [5, 10, 20, 40]) {
    let ok = 0; const fails = [];
    for (let it = 0; it < 6; it++) {
      await page.goto('http://127.0.0.1:5421/?s=fast'); await page.waitForSelector('.ssg-body-row[data-pane="center"]');
      await page.locator('.ssg-body-cell[data-ssg-col-key="code"]').first().click();
      const vals = Array.from({ length: 6 }, (_, i) => `${4900 + it * 10 + i}`);
      const sends = [];
      for (const ch of vals.map((v) => v + '\n').join('')) { for (const ev of keyEvents(ch)) sends.push(cdp.send('Input.dispatchKeyEvent', ev)); await new Promise((r) => setTimeout(r, gap)); }
      await Promise.all(sends); await page.waitForTimeout(400);
      const got = await page.evaluate(() => window.__rows.slice(0, 7).map((r) => r.code));
      if (vals.every((v, i) => got[i] === v)) ok++; else fails.push(got.join(','));
    }
    console.log('gap', gap, 'ok', ok, '/6', fails.slice(0, 2));
  }
  await b.close();
})();
