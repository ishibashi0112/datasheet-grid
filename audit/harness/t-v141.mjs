// 追加(1.4.1): 1.4.1 で直した所見の実ブラウザでの確かめ。
//   - AP-11(2026-11-09 実アプリの総点検): custom エディタを開いたまま別のセル・列見出しを押すと、グリッドが編集を終えて
//     エディタを閉じ、キー操作が効く。onBlur で確定しない作り(ハーネスの既定)は打ちかけを書かない。onBlur でその場で /
//     50ms 後に ctx.commit する作り(window.__customEditorBlur = 'sync' / 'timeout')は、その値を編集していたセルに書き、
//     押したセルがアクティブのまま(1.4.0 までは遅れた確定がアクティブセルを編集していたセルへ戻していた)。
//   Solid 版は SSG_AUDIT_FRAMEWORK=solid HARNESS_BASE=http://127.0.0.1:5179/。
import { open, check, summary, waitIdle, unexpectedPageErrors, cell, header, events, clearEvents } from './pw.mjs';

const { page, close, pageErrors } = await open('basic');
await waitIdle(page, 300);

const editorOpen = () => page.evaluate(() => document.querySelector('[data-testid="custom-editor"]') !== null);
const shellFocused = () => page.evaluate(() => document.activeElement?.classList.contains('ssg-shell') === true);
const activeCell = () => page.evaluate(() => window.__grid.getActiveCell());
const customValue = (row) => page.evaluate((r) => window.__rows()[r].custom, row);
const nameCol = await page.evaluate(() => window.__grid.getColIndex('name'));

const openCustomEditor = async (row, text) => {
  await cell(page, row, 'custom').dblclick();
  await waitIdle(page, 200);
  const opened = await editorOpen();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  return opened;
};

for (const [mode, row] of [['none', 2], ['sync', 3], ['timeout', 4]]) {
  await page.evaluate((m) => {
    window.__customEditorBlur = m === 'none' ? undefined : m;
  }, mode);
  const before = await customValue(row);
  const opened = await openCustomEditor(row, `v-${mode}`);
  await clearEvents(page);
  await cell(page, row + 3, 'name').click();
  await waitIdle(page, 300);
  const closed = !(await editorOpen());
  const written = await customValue(row);
  const active = await activeCell();
  const expected = mode === 'none' ? before : `v-${mode}`;
  const commits = (await events(page, 'custom-commit')).map((event) => event.payload?.status);
  check(
    `AP-11(onBlur: ${mode}): 別のセルを押すとエディタが閉じ、${mode === 'none' ? '打ちかけは書かない' : '値を編集していたセルに書く'}・押したセルがアクティブのまま`,
    opened && closed && written === expected && active?.row === row + 3 && active?.col === nameCol &&
      (mode === 'none' ? commits.length === 0 : commits.length === 1 && commits[0] === 'committed'),
    { opened, closed, written, expected, active, nameCol, commits },
  );
  await page.keyboard.press('ArrowDown');
  await waitIdle(page, 120);
  const afterArrow = await activeCell();
  check(`AP-11(onBlur: ${mode}): 押した後に矢印キーが効き、フォーカスはグリッド`, afterArrow?.row === row + 4 && (await shellFocused()), {
    afterArrow,
    focused: await shellFocused(),
  });
}

// 列見出しを押したときも終える(onBlur で確定しない作り)。
{
  await page.evaluate(() => {
    window.__customEditorBlur = undefined;
  });
  const opened = await openCustomEditor(6, 'v-header');
  await header(page, 'name').locator('.ssg-header-label').first().click();
  await waitIdle(page, 300);
  const closed = !(await editorOpen());
  const selection = await page.evaluate(() => window.__grid.getSelection());
  await page.keyboard.press('Escape');
  await waitIdle(page, 120);
  check('AP-11: 列見出しを押してもエディタが閉じ、列が選ばれ、Escape が効く', opened && closed && selection?.type === 'col', {
    opened,
    closed,
    selection,
    afterEscape: await page.evaluate(() => window.__grid.getSelection()),
  });
}

// エディタの中を押してもエディタは閉じない(中の入力欄はクリックを受ける)。
{
  const opened = await openCustomEditor(7, 'v-inside');
  await page.locator('[data-testid="custom-editor"]').click();
  await waitIdle(page, 200);
  const stillOpen = await editorOpen();
  await page.keyboard.press('Enter');
  await waitIdle(page, 200);
  check('AP-11: エディタの中を押してもエディタは開いたまま(Enter で確定できる)', opened && stillOpen && (await customValue(7)) === 'v-inside', {
    opened,
    stillOpen,
    value: await customValue(7),
  });
}

check('想定外のエラーが無い', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
await close();
summary();