const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5421/';
const only = process.argv[2];

const cell = (page, row, colKey) =>
  page.locator(`.ssg-body-row[data-pane="center"][aria-rowindex="${row + 2}"] [data-ssg-col-key="${colKey}"], [data-pane] .ssg-body-row[aria-rowindex="${row + 2}"] [data-ssg-col-key="${colKey}"]`).first();

async function open(browser, scenario) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}?s=${scenario}`);
  await page.waitForSelector('.ssg-body-row');
  return { ctx, page, logs };
}

async function clickCellText(page, text) {
  await page.locator('.ssg-body-cell', { hasText: new RegExp(`^${text}$`) }).first().click();
}

async function paste(page, text) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(150);
}

const tests = {
  async date(browser) {
    const { page, ctx } = await open(browser, 'date');
    await page.locator('.ssg-body-cell[data-ssg-col-key="d"]').first().click();
    await paste(page, '11/2\n1/15\n2026/2/30\nNov 1\n2026年11月1日\n2026/11/01');
    const rows = await page.evaluate(() => window.__rows.map((r) => r.d));
    await ctx.close();
    return rows;
  },
  async shiftArrowPaste(browser) {
    const { page, ctx } = await open(browser, 'paste');
    await clickCellText(page, 'b1');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    const sel = await page.evaluate(() => ({ a: window.grid.current.getActiveCell(), s: window.grid.current.getSelection() }));
    await paste(page, 'X\nY\nZ');
    const b = await page.evaluate(() => window.__rows.map((r) => r.b).slice(0, 7));
    await ctx.close();
    return { sel, b };
  },
  async headerPaste(browser) {
    const { page, ctx } = await open(browser, 'paste');
    await clickCellText(page, 'c4');
    await page.locator('[role=columnheader][data-ssg-col-key="a"] .ssg-header-label').first().click();
    await page.keyboard.press('Control+C');
    await page.waitForTimeout(100);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    await page.locator('[role=columnheader][data-ssg-col-key="b"] .ssg-header-label').first().click();
    const active = await page.evaluate(() => window.grid.current.getActiveCell());
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(150);
    const b = await page.evaluate(() => window.__rows.map((r) => r.b));
    await ctx.close();
    return { clipLines: clip.split(/\r?\n/).length, active, b };
  },
  async selectAllFilter(browser) {
    const { page, ctx } = await open(browser, 'selall');
    await page.evaluate(() => window.grid.current.applyState({ filters: { columnFilters: { f: { kind: "text", value: "apple" } } } }));
    await page.waitForTimeout(300);
    const visible = await page.locator('.ssg-body-row[data-pane="center"]').count();
    await page.locator('.ssg-corner-cell').first().click();
    const during = await page.evaluate(() => ({ keys: window.grid.current.getSelectedRowKeys(), count: window.grid.current.getSelectedRowCount() }));
    await page.evaluate(() => window.grid.current.applyState({ filters: { columnFilters: {} } }));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ keys: window.grid.current.getSelectedRowKeys(), count: window.grid.current.getSelectedRowCount() }));
    await page.click('#del');
    await page.waitForTimeout(200);
    const remaining = await page.evaluate(() => window.__rows.length);
    await ctx.close();
    return { visible, during, after, remaining };
  },
  async groupPaste(browser) {
    const { page, ctx } = await open(browser, 'grouppaste');
    await clickCellText(page, 'a1');
    await paste(page, 'X\nY\nZ');
    const v = await page.evaluate(() => window.__rows.map((r) => `${r.team}:${r.v}`));
    await ctx.close();
    return v;
  },
  async fastType(browser) {
    const out = [];
    for (const gap of [5, 10, 30]) {
      const { page, ctx } = await open(browser, 'fast');
      await page.locator('.ssg-body-cell[data-ssg-col-key="code"]').first().click();
      const cdp = await ctx.newCDPSession(page);
      const send = async (key, text) => {
        const base = key === 'Enter' ? { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 } : { key, code: `Digit${key}`, text, windowsVirtualKeyCode: key.charCodeAt(0) };
        await cdp.send('Input.dispatchKeyEvent', { type: key === 'Enter' ? 'rawKeyDown' : 'keyDown', ...base });
        if (key === 'Enter') await cdp.send('Input.dispatchKeyEvent', { type: 'char', ...base, text: '\r' });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      };
      const vals = ['4900', '4901', '4902', '4903', '4904', '4905'];
      for (const v of vals) {
        for (const ch of v) { await send(ch, ch); await new Promise((r) => setTimeout(r, gap)); }
        await send('Enter'); await new Promise((r) => setTimeout(r, gap));
      }
      await page.waitForTimeout(500);
      out.push({ gap, codes: await page.evaluate(() => window.__rows.slice(0, 6).map((r) => r.code)) });
      await ctx.close();
    }
    return out;
  },
  async ctxStartEditing(browser) {
    const { page, ctx } = await open(browser, 'ctx');
    await page.locator('.ssg-body-cell', { hasText: /^a2$/ }).first().click({ button: 'right' });
    await page.locator('.ssg-menu-item', { hasText: 'edit' }).click();
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ started: window.__started, editor: !!document.querySelector('.ssg-cell-editor input, .ssg-cell-editor textarea'), focus: document.activeElement?.className }));
    await ctx.close();
    return r;
  },
  async customOutside(browser) {
    const { page, ctx } = await open(browser, 'custom');
    await page.locator('.ssg-body-cell', { hasText: /^a1$/ }).first().dblclick();
    await page.waitForTimeout(200);
    await page.locator('.ssg-body-cell', { hasText: /^b5$/ }).first().click();
    await page.waitForTimeout(200);
    const editorOpen = await page.evaluate(() => !!document.querySelector('.ssg-cell-editor input'));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ editorOpenAfterKeys: !!document.querySelector('.ssg-cell-editor input'), active: window.grid.current.getActiveCell() }));
    await ctx.close();
    return { editorOpen, ...r };
  },
  async removedColFilter(browser) {
    const { page, ctx } = await open(browser, 'removedcol');
    await page.evaluate(() => window.grid.current.applyState({ filters: { columnFilters: { e: { kind: "text", value: "e1" } } } }));
    await page.waitForTimeout(300);
    const before = await page.locator('.ssg-body-row[data-pane="center"]').count();
    await page.click('#toggle');
    await page.waitForTimeout(300);
    const mid = { rows: await page.locator('.ssg-body-row[data-pane="center"]').count(), state: await page.evaluate(() => Object.keys(window.grid.current.getState().columnFilters ?? {})), bar: await page.locator('.ssg-top-bar, .ssg-topbar').first().innerText().catch(() => '') };
    await page.click('#toggle');
    await page.waitForTimeout(300);
    const after = await page.locator('.ssg-body-row[data-pane="center"]').count();
    await ctx.close();
    return { before, mid, after };
  },
};

(async () => {
  const browser = await chromium.launch();
  for (const [name, fn] of Object.entries(tests)) {
    if (only && only !== name) continue;
    try {
      console.log(name, JSON.stringify(await fn(browser)));
    } catch (e) {
      console.log(name, 'ERROR', e.message.split('\n')[0]);
    }
  }
  await browser.close();
})();
