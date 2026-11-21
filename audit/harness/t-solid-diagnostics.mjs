// Solid 版だけ(段階 3-2): Solid の Vite プラグインの既定(vite dev で Performance パネルのトラックが入り、その計測
//   solid-js/attribution が描き直しの理由を記録する)で動かしたときに、Solid が console へ出す知らせ([EFFECT_RELAY_TEAR] /
//   [EFFECT_WRITES_OWN_SOURCE] など)が、docs/solid/README.md「開発ビルドで Solid が出す知らせ」に書いた既知のものだけかを見る。
//   回し方: `SSG_AUDIT_SOLID_TRACKS=1 pnpm run audit:dev:solid`(port 5180)を立て、
//   `SSG_AUDIT_FRAMEWORK=solid SSG_AUDIT_SOLID_TRACKS=1 node audit/harness/t-solid-diagnostics.mjs`。
//   ふつうのハーネス(トラックなし。port 5179)では知らせが出ないので、この確かめだけをここで行う。
//   知らせは 1 つの処理につき 1 ページで 1 回(EFFECT_RELAY_TEAR は同じ処理で 3 回目から)なので、それぞれの処理を通る操作をする。
import { open, check, skip, summary, cell, focusGrid, waitIdle, FRAMEWORK, SOLID_TRACKS } from './pw.mjs';

// 既知の知らせ(コードと effect の名前 = connectController / createEffect の name)。React 版も同じ描き直しをしている
//   (レイアウト effect / effect の中の setState。React は知らせない)。
const KNOWN = [
  { code: 'EFFECT_WRITES_OWN_SOURCE', effect: 'autoHeightMeasurer' },
  { code: 'EFFECT_RELAY_TEAR', effect: 'autoHeightMeasurer' },
  { code: 'EFFECT_WRITES_OWN_SOURCE', effect: 'activeRowFollow' },
  { code: 'EFFECT_RELAY_TEAR', effect: 'activeRowFollow' },
  { code: 'EFFECT_WRITES_OWN_SOURCE', effect: 'edit' },
  { code: 'EFFECT_RELAY_TEAR', effect: 'edit' },
  { code: 'EFFECT_RELAY_TEAR', effect: 'clampSelectionToRowCount' },
  { code: 'EFFECT_RELAY_TEAR', effect: 'reconcileColumnWidths' },
  { code: 'EFFECT_RELAY_TEAR', effect: 'scrollSync' },
  { code: 'EFFECT_RELAY_TEAR', effect: 'fillHandle' },
  { code: 'EFFECT_RELAY_TEAR', effect: 'serverSideRowModel' },
];

// console の 1 件から [CODE] と effect の名前を読む(知らせでなければ null)。
const parseDiagnostic = (text) => {
  const code = /^\[([A-Z][A-Z_]+)\] /.exec(text)?.[1];
  if (code === undefined) {
    return null;
  }
  const effect =
    code === 'EFFECT_RELAY_TEAR'
      ? /after effect "([^"]+)" relayed/.exec(text)?.[1]
      : code === 'EFFECT_WRITES_OWN_SOURCE'
        ? /^\[EFFECT_WRITES_OWN_SOURCE\] effect "([^"]+)"/.exec(text)?.[1]
        : undefined;
  return { code, effect: effect ?? null, head: text.split('\n')[0].slice(0, 240) };
};

if (FRAMEWORK !== 'solid' || !SOLID_TRACKS) {
  skip('solid-diagnostics: すべて', 'SSG_AUDIT_FRAMEWORK=solid と SSG_AUDIT_SOLID_TRACKS=1 のときだけ(Solid の開発用の計測を入れたサーバー)');
  summary();
  process.exit(0);
}

const seen = [];
const pageErrors = [];
const watch = (page, scenario) => {
  page.on('console', (message) => {
    if (message.type() !== 'warning' && message.type() !== 'error') {
      return;
    }
    const parsed = parseDiagnostic(message.text());
    if (parsed) {
      seen.push({ ...parsed, scenario, type: message.type() });
    }
  });
};
const openWatched = async (scenario, options) => {
  // open() の後に付けると読み込み中の知らせを取り逃すので、beforeGoto で付ける。
  const opened = await open(scenario, { ...options, beforeGoto: (page) => watch(page, scenario) });
  return {
    ...opened,
    close: async () => {
      // Solid の知らせ(上で数える)は除き、ページの例外とそれ以外の console の warning / error を集める。
      const others = opened.pageErrors.filter(
        (message) => !(message.startsWith('[console.') && parseDiagnostic(message.replace(/^\[console\.\w+\] /, '')) !== null),
      );
      pageErrors.push(...others.map((message) => `${scenario}: ${message}`));
      await opened.close();
    },
  };
};

// ---- basic: 編集・並べ替え・絞り込みで行が減る(選択を詰める)・列の差し替え・activeCellFollows: 'row'・編集中の並びの変化 ----
{
  const { page, close } = await openWatched('basic', { query: 'n=60' });
  await cell(page, 1, 'name').dblclick();
  await page.keyboard.type('あいう');
  await page.keyboard.press('Enter');
  await waitIdle(page, 150);
  // 下の方の行を選んでから絞り込む(選択が範囲の外になり、詰める)。3 回目から知らせになる。
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => window.__grid.selectCell(50, 2));
    await page.evaluate(() => window.__grid.applyState({ filters: { globalText: 'item-00000', columnFilters: {} } }));
    await waitIdle(page, 250);
    await page.evaluate(() => window.__grid.applyState({ filters: { globalText: '', columnFilters: {} } }));
    await waitIdle(page, 250);
  }
  // 列を減らして戻す(手で変えた幅 / 選択の列を合わせる)。
  await page.evaluate(() => {
    window.__originalColumns = window.__columns();
    window.__grid.applyState({ columnWidths: { note: 300 } });
  });
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => window.__grid.selectCell(0, 9));
    await page.evaluate(() => window.__setColumns(window.__originalColumns.filter((c) => c.key !== 'note')));
    await waitIdle(page, 200);
    await page.evaluate((i) => window.__setColumns(window.__originalColumns.map((c) => (c.key === 'note' ? { ...c, width: 200 + i } : c))), i);
    await waitIdle(page, 200);
  }
  // activeCellFollows: 'row'(並びが変わったらアクティブセルを行へ付け直す)。
  await page.evaluate(() => {
    window.__setProps({ activeCellFollows: 'row' });
    window.__grid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] });
  });
  await waitIdle(page, 250);
  await cell(page, 2, 'qty').click();
  await page.evaluate(() => {
    const id = window.__grid.getExportData({ scope: 'view' }).rows[2][0].value;
    window.__setRows(window.__rows().map((row) => (row.id === id ? { ...row, qty: -1000 } : row)));
  });
  await waitIdle(page, 250);
  // 編集中に並びが変わる(エディタを行へ付け直す)。
  await focusGrid(page);
  await page.evaluate(() => window.__grid.selectCell(3, 1));
  await page.keyboard.press('F2');
  await page.keyboard.type('x');
  await page.evaluate(() => {
    const id = window.__grid.getExportData({ scope: 'view' }).rows[3][0].value;
    window.__setRows(window.__rows().map((row) => (row.id === id ? { ...row, qty: 99999 } : row)));
  });
  await waitIdle(page, 250);
  await page.keyboard.press('Escape');
  await waitIdle(page, 150);
  await close();
}

// ---- auto-height: 行の高さの実測・末尾へ・編集で高さが変わる ----
{
  const { page, close } = await openWatched('autoheight', { query: 'n=3000' });
  await waitIdle(page, 300);
  await page.evaluate(() => window.__grid.scrollToBottom());
  await waitIdle(page, 400);
  await page.evaluate(() => window.__grid.scrollToRow(1500, { align: 'start' }));
  await waitIdle(page, 400);
  await close();
}

// ---- 合計行: 末尾で合計行を出す / 高くする(見える高さを測り直す)・フィルハンドルで埋める ----
{
  const { page, close } = await openWatched('basic', { query: 'n=200' });
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => window.__grid.scrollToBottom());
    await waitIdle(page, 150);
    await page.evaluate((i) => window.__setProps({ totalRow: { height: 36 + i * 10 } }), i);
    await waitIdle(page, 200);
    await page.evaluate(() => window.__setProps({ totalRow: false }));
    await waitIdle(page, 200);
  }
  await page.evaluate(() => {
    window.__setProps({ fillHandle: true });
    window.__grid.scrollToTop();
  });
  await waitIdle(page, 250);
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => window.__grid.selectRange({ start: { row: 0, col: 2 }, end: { row: 1, col: 2 } }));
    await waitIdle(page, 150);
    const handle = await page.evaluate(() => {
      const r = document.querySelector('.ssg-fill-handle')?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2 - 2, y: r.y + r.height / 2 - 2 } : null;
    });
    if (handle === null) {
      break;
    }
    const target = await cell(page, 5 + i, 'qty').boundingBox();
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
    await page.mouse.up();
    await waitIdle(page, 200);
  }
  await close();
}

// ---- ラベル行・グループ・SSRM: 開いてスクロールする ----
for (const scenario of ['label', 'grouping', 'ssrm']) {
  const { page, close } = await openWatched(scenario);
  await waitIdle(page, 300);
  // SSRM は並べ替えを 3 回切り替える(問い合わせが変わり、読み込んだブロックを捨てる)。
  if (scenario === 'ssrm') {
    for (const direction of ['desc', 'asc', 'desc']) {
      await page.evaluate((direction) => window.__grid.applyState({ sort: [{ columnKey: 'id', direction }] }), direction);
      await waitIdle(page, 400);
    }
  }
  for (const top of [2000, 6000, 0]) {
    await page.evaluate((top) => {
      document.querySelector('.ssg-scroll-container').scrollTop = top;
    }, top);
    await waitIdle(page, 400);
  }
  await close();
}

// effect の名前が読めない知らせ(名前の無い effect = connectController / createEffect に name を渡し忘れた)も未知として数える。
const unknown = seen.filter((d) => d.effect === null || !KNOWN.some((k) => k.code === d.code && k.effect === d.effect));
const errors = seen.filter((d) => d.type === 'error');
// 計測が入っていないサーバー(port 5179 など)へ向けると知らせが 1 つも出ず、上の 2 つが空のまま通ってしまうので、
//   必ず出る知らせ(auto-height の実測)が出たことも見る。
check(
  'solid-diagnostics: 計測が入っている(auto-height の実測の知らせが出た)',
  seen.some((d) => d.effect === 'autoHeightMeasurer'),
  seen.map((d) => d.head),
);
check('solid-diagnostics: Solid の知らせは既知のものだけ(docs/solid/README.md)', unknown.length === 0, unknown);
check('solid-diagnostics: error の知らせは無い', errors.length === 0, errors);
check('solid-diagnostics: ページの例外とほかの警告は無い', pageErrors.length === 0, pageErrors);
const tally = {};
for (const d of seen) {
  const key = `${d.code} / ${d.effect} (${d.scenario})`;
  tally[key] = (tally[key] ?? 0) + 1;
}
console.log('solid-diagnostics: 出た知らせ', JSON.stringify(tally, null, 1));
summary();