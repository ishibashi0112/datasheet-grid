// 追加(1.3.0 / Solid 版の品質の段 2): 1.3.0 で直した所見の実ブラウザでの確かめ(Shadow DOM は t-shadow.mjs)。
//   - IME の入力受け: PageDown の後(先読みの行へ移ってからスクロールが来る)も、待機中の入力受けがアクティブセルに重なる
//   - S9-02: 範囲の選択を Escape で外した後の Ctrl+C はアクティブセルの 1 セル
//   - S7-03 / S8-04: 編集していた行が絞り込みから外れたら、打ちかけをその行へ確定し、フォーカスはグリッドに残る
//   - RV5-3: エディタを開いたまま別のセルを押してすぐ打った文字が、そのセルのエディタに残る
//   Solid 版は SSG_AUDIT_FRAMEWORK=solid HARNESS_BASE=http://127.0.0.1:5179/。
import { open, check, skip, summary, waitIdle, unexpectedPageErrors, cell, cellText, SUPPORTS } from './pw.mjs';

const { page, close, pageErrors } = await open('basic');
await waitIdle(page, 300);

const shellFocused = () => page.evaluate(() => document.activeElement?.classList.contains('ssg-shell') === true);
const editorValue = () =>
  page.evaluate(() => document.querySelector('.ssg-cell-editor-input')?.value ?? null);

// ── IME の入力受け(PageDown)──
{
  await page.evaluate(() => window.__setProps({ imeDirectInput: true }));
  await waitIdle(page, 300);
  await cell(page, 2, 'name').click();
  await waitIdle(page, 200);
  const offsets = [];
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('PageDown');
    await waitIdle(page, 300);
    offsets.push(
      await page.evaluate(() => {
        const ime = document.querySelector('[data-ssg-ime-input]')?.getBoundingClientRect();
        const id = document.querySelector('.ssg-shell')?.getAttribute('aria-activedescendant');
        const active = id ? document.getElementById(id)?.getBoundingClientRect() : undefined;
        return ime && active ? Math.round(Math.abs(ime.top - active.top) + Math.abs(ime.left - active.left)) : null;
      }),
    );
  }
  check('IME の入力受け: PageDown の後も待機中の入力受けがアクティブセルに重なる', offsets.every((d) => d !== null && d <= 1), { offsets });
  await page.evaluate(() => window.__setProps({ imeDirectInput: false }));
  await page.keyboard.press('ControlOrMeta+Home');
  await waitIdle(page, 300);
}

// ── S9-02: Escape の後の Ctrl+C ──
if (SUPPORTS.clipboardSeed) {
  await cell(page, 1, 'name').click();
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Escape');
  await waitIdle(page, 150);
  await page.evaluate(() => navigator.clipboard.writeText('(前の中身)'));
  const selection = await page.evaluate(() => window.__grid.getSelection());
  await page.keyboard.press('ControlOrMeta+c');
  await waitIdle(page, 200);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const active = await page.evaluate(() => window.__grid.getActiveCell());
  const expected = active ? await cellText(page, active.row, 'name') : null;
  check('S9-02: 範囲を Escape で外した後の Ctrl+C はアクティブセルの 1 セル', selection === null && copied === expected, {
    selection,
    active,
    copied,
    expected,
  });
} else {
  skip('S9-02: 範囲を Escape で外した後の Ctrl+C', 'クリップボードを読めないブラウザ');
}

// ── S7-03 / S8-04: 編集していた行が絞り込みから外れる ──
{
  const target = await page.evaluate(() => window.__rows()[0].name);
  await cell(page, 5, 'name').dblclick();
  await waitIdle(page, 150);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('打ちかけ');
  await page.evaluate((text) => window.__grid.applyState({ filters: { globalText: text } }), target);
  await waitIdle(page, 600);
  const written = await page.evaluate(() => window.__rows()[5].name);
  const focused = await shellFocused();
  check('S7-03 / S8-04: 絞り込みから外れた行へ打ちかけを確定し、フォーカスはグリッドに残る', written === '打ちかけ' && focused, {
    written,
    focused,
    editor: await editorValue(),
  });
  await page.evaluate(() => window.__grid.applyState({ filters: { globalText: '' } }));
  await waitIdle(page, 600);
}

// ── RV5-3: 開いたまま別のセルを押してすぐ打つ ──
{
  await cell(page, 0, 'name').dblclick();
  await waitIdle(page, 150);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('先の値');
  await cell(page, 2, 'name').click();
  await page.keyboard.type('xyz');
  await waitIdle(page, 200);
  const value = await editorValue();
  await page.keyboard.press('Enter');
  await waitIdle(page, 200);
  const names = await page.evaluate(() => [window.__rows()[0].name, window.__rows()[2].name]);
  check('RV5-3: 押してすぐ打った文字が、そのセルのエディタに残る', value === 'xyz' && names[0] === '先の値' && names[1] === 'xyz', {
    value,
    names,
  });
}

check('想定外のエラーが無い', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
await close();
summary();
