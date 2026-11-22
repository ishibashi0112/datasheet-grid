// React 版(`/lite` に同じ機能を差し込んだもの)と Solid 版の行のグループ化 / ラベル行を同じ操作で動かして、DOM と通知と
//   命令的 API の結果が同じかを見る(段階 2-4。サーバーサイドの行モデルは serverSide.parity.test.tsx)。
import { beforeAll, describe, it } from 'vitest';
import { createElement } from 'react';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type ParityContext } from './harness';

beforeAll(async () => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
  // React 版はツールパネルと列フィルターの部品を遅れて読み込むので、先に読んでおく(開いた直後に同じ DOM を比べるため)。
  const reactLite = (await import(/* @vite-ignore */ new URL('../../../react/src/lite.ts', import.meta.url).pathname)) as {
    preloadGridPopups: () => Promise<void>;
  };
  await reactLite.preloadGridPopups();
});

const pointer = { button: 0, pointerId: 1, isPrimary: true };

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);

const focused = () => document.activeElement ?? document.body;

const key = async (ctx: ParityContext, init: KeyboardEventInit & { key: string }) => {
  await ctx.act(() => {
    fireEvent.keyDown(focused(), init);
  });
};

const press = async (ctx: ParityContext, target: Element) => {
  await ctx.act(() => {
    fireEvent.pointerDown(target, pointer);
    fireEvent.pointerUp(window, pointer);
    fireEvent.click(target, { detail: 1 });
  });
};

describe('行のグループ化(grouping)', () => {
  type Row = { id: number; region: string | null; category: string; name: string; qty: number; price: number; note: string };
  const REGIONS = ['関東', '関西', null, '九州'];
  const CATEGORIES = ['果物', '野菜'];
  const makeRows = (count: number): Row[] =>
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      region: REGIONS[i % REGIONS.length] as string | null,
      category: CATEGORIES[Math.floor(i / 4) % CATEGORIES.length] as string,
      name: `品目 ${i + 1}`,
      qty: (i * 7) % 50,
      price: 100 + (i % 5) * 1234.5,
      note: i % 3 === 0 ? `メモ ${i}` : '',
    }));
  const groupedColumns = [
    { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
    { key: 'region', title: '地域', width: 100, rowGroup: true, filterType: 'set' },
    { key: 'category', title: '分類', width: 100, rowGroup: true },
    { key: 'name', title: '品名', width: 120, filterType: 'text' },
    { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' }, aggFunc: 'sum', filterType: 'number' },
    { key: 'price', title: '単価', width: 60, align: 'right', aggFunc: 'avg' },
    { key: 'note', title: 'メモ', width: 160, pinned: 'right', aggFunc: 'count' },
  ];
  // グループ行の開閉のボタン(自動グループ列のセルの中)。
  const toggleOf = (ctx: ParityContext, row: number) => {
    const button = ctx.cell(row, '__ssg_group__').querySelector<HTMLButtonElement>('.ssg-group-toggle');
    if (!button) {
      throw new Error(`[${ctx.framework}] 開閉のボタンがありません: ${row}`);
    }
    return button;
  };

  it.each([
    ['あり', ['grouping']],
    ['なし(rowGroup の列もそのまま)', []],
  ])('グループ行の表示・開閉(ボタン / ダブルクリック / Enter・Space)・集計・ホバー・命令的 API(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      allowMissingFeatures: ['grouping'],
      watch: ['onStateChange'],
      props: () => ({ rows: makeRows(16), columns: groupedColumns, rowKeyGetter: (row: Row) => row.id, height: 360 }),
      steps: async (ctx) => {
        ctx.snapshot('最初');
        ctx.log('getGroupRows', call(ctx, 'getGroupRows'));
        if (features.length === 0) {
          return;
        }
        ctx.track('最初のグループ行の自動グループ列のセル', () => ctx.container.querySelector('[data-ssg-group-row] [data-ssg-col-key="__ssg_group__"]'));
        // 開閉のボタンで閉じる(2 段目のグループごと隠れる)。
        await press(ctx, toggleOf(ctx, 0));
        ctx.snapshot('ボタンで最初のグループを閉じた');
        // 行のダブルクリックで開く。
        await ctx.act(() => {
          fireEvent.dblClick(ctx.cell(0, 'qty'));
        });
        ctx.snapshot('ダブルクリックで開いた');
        // グループ行のセルを押すとアクティブセル。Enter / Space で開閉。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(1, 'name'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await key(ctx, { key: 'Enter' });
        ctx.snapshot('2 段目のグループで Enter');
        await key(ctx, { key: ' ' });
        ctx.snapshot('もう一度 Space');
        // ホバー(行番号の欄 / セル)。
        await ctx.act(() => {
          ctx.hover(ctx.cell(0, 'name'));
        });
        ctx.snapshot('グループ行にホバー');
        // 命令的 API。
        await ctx.act(() => {
          call(ctx, 'collapseAllGroups');
        });
        ctx.snapshot('すべて閉じた');
        ctx.log('getGroupRows(すべて閉じた)', call(ctx, 'getGroupRows'));
        await ctx.act(() => {
          call(ctx, 'expandAllGroups');
        });
        const groups = call(ctx, 'getGroupRows') as { groupKey: string }[];
        await ctx.act(() => {
          call(ctx, 'setGroupCollapsed', groups[2]?.groupKey, true);
        });
        ctx.snapshot('3 つ目のグループだけ閉じた');
        ctx.log('getState', call(ctx, 'getState'));
        // 上へ行を足す・値を変えると集計が変わる(行は同じ要素のまま)。
        await ctx.setProps({ rows: [{ id: 99, region: '関東', category: '果物', name: '新', qty: 1000, price: 1, note: 'x' }, ...makeRows(16)] });
        ctx.snapshot('行を足した');
      },
    });
  });

  it('行の選択のチェックボックスの表・空のグループ・aggFunc の関数と書式・文言(localeText)', async () => {
    await expectParity({
      features: ['grouping'],
      props: () => ({
        rows: makeRows(10),
        columns: groupedColumns.map((column) =>
          column.key === 'qty'
            ? { ...column, aggFunc: (values: unknown[]) => values.length * 2, valueFormatter: ({ value }: { value: unknown }) => `${String(value)} 個` }
            : column,
        ),
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        enableRowSelection: true,
        // 行が現れたときのフェードイン(animateRows)の印は、React 版は行の className が変わると描き直しで外れ、Solid 版は
        //   animationend まで残る(どちらも見た目は同じ。jsdom には animationend が無いので、ここでは比べない)。
        animateRows: false,
        localeText: { blank: '(なし)', groupRowCount: '{count} 行', expandGroup: '開く {group}', collapseGroup: '閉じる {group}' },
      }),
      steps: async (ctx) => {
        ctx.snapshot('最初');
        // 見出しの全選択はデータ行だけを数える。
        await ctx.act(() => {
          const corner = ctx.container.querySelector<HTMLElement>('.ssg-corner-cell');
          if (!corner) {
            throw new Error(`[${ctx.framework}] 角がありません`);
          }
          fireEvent.pointerDown(corner, pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.log('getSelectedRowCount', call(ctx, 'getSelectedRowCount'));
        ctx.snapshot('全選択');
      },
    });
  });

  it('グループ化中のソート・フィルター・ツールパネル・列メニュー(グループ化 / 外す)・includeGroupingInState', async () => {
    const latestColumns: Record<string, unknown[]> = {};
    await expectParity({
      features: ['grouping', 'filtering', 'columnMenu', 'toolPanel'],
      watch: ['onColumnsChange', 'onStateChange', 'onFiltersChange'],
      props: (framework) => ({
        rows: makeRows(16),
        columns: groupedColumns.map((column) => (column.key === 'category' ? { ...column, rowGroup: false } : column)),
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        includeGroupingInState: true,
        onColumnsChange: (next: unknown[]) => {
          latestColumns[framework] = next;
        },
      }),
      steps: async (ctx) => {
        ctx.snapshot('最初(地域でグループ化)');
        // 見出しの Shift + 押すで数量の並び(グループは集計の順)。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.header('qty'), { ...pointer, shiftKey: true });
          fireEvent.pointerUp(window, { ...pointer, shiftKey: true });
        });
        ctx.snapshot('数量で並べた');
        // 上部バーの検索でグループ元の列の値に当たる。
        await ctx.act(() => {
          const input = ctx.container.querySelector<HTMLInputElement>('.ssg-bar-input');
          fireEvent.input(input as HTMLInputElement, { target: { value: '関西' } });
        });
        ctx.snapshot('関西で検索');
        await ctx.act(() => {
          const input = ctx.container.querySelector<HTMLInputElement>('.ssg-bar-input');
          fireEvent.input(input as HTMLInputElement, { target: { value: '' } });
        });
        // ツールパネルの列のタブ(グループ元の列は印)と並び替えのタブ(グループ元の列を選べる)。
        const tab = (label: string) =>
          Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-toolpanel [role="tab"]')).find((el) =>
            el.textContent?.startsWith(label),
          );
        await ctx.act(() => {
          call(ctx, 'openFilterManager');
        });
        await ctx.act(() => {
          fireEvent.click(tab('列') as HTMLElement, { detail: 1 });
        });
        ctx.snapshot('列のタブ');
        await ctx.act(() => {
          fireEvent.click(tab('並び替え') as HTMLElement, { detail: 1 });
        });
        ctx.snapshot('並び替えのタブ');
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'Escape' });
        });
        // 列メニューの「この列でグループ化」(onColumnsChange で受けた列へ差し替える)。
        const openMenu = async (columnKey: string) => {
          await ctx.act(() => {
            const button = ctx.header(columnKey).querySelector<HTMLButtonElement>('.ssg-icon-btn');
            if (!button) {
              throw new Error(`[${ctx.framework}] ⋮ がありません: ${columnKey}`);
            }
            fireEvent.pointerDown(button, { ...pointer, pointerType: 'mouse' });
            fireEvent.pointerUp(button, { ...pointer, pointerType: 'mouse' });
            fireEvent.click(button, { detail: 1 });
          });
        };
        const clickItem = async (label: string) => {
          await ctx.act(() => {
            const item = Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((el) =>
              el.textContent?.includes(label),
            );
            if (!item) {
              throw new Error(`[${ctx.framework}] 項目がありません: ${label}`);
            }
            fireEvent.click(item, { detail: 1 });
          });
        };
        await openMenu('category');
        ctx.snapshot('分類の列メニュー');
        await clickItem('この列でグループ化');
        await ctx.setProps({ columns: latestColumns[ctx.framework] });
        ctx.snapshot('分類でもグループ化した');
        ctx.log('getState', call(ctx, 'getState'));
        await openMenu('name');
        await clickItem('グループ化を外す');
        await ctx.setProps({ columns: latestColumns[ctx.framework] });
        ctx.snapshot('グループ化を外した');
      },
    });
  });
});

describe('ラベル行(labelRow)', () => {
  type Row = { id: string; kind?: 'label'; name: string; qty: number; note: string };
  // [S1] 3 行 / [S2] 4 行 / [S3] 0 行 / [S4] 2 行。
  const makeRows = (): Row[] => {
    const sections: [string, number][] = [
      ['s1', 3],
      ['s2', 4],
      ['s3', 0],
      ['s4', 2],
    ];
    const rows: Row[] = [];
    let n = 0;
    for (const [id, count] of sections) {
      rows.push({ id, kind: 'label', name: `セクション ${id.slice(1)}`, qty: 0, note: '' });
      for (let i = 0; i < count; i += 1) {
        n += 1;
        rows.push({ id: `${id}-${i + 1}`, name: `品目 ${n}`, qty: (n * 37) % 100, note: n % 2 === 0 ? `メモ ${n}` : '' });
      }
    }
    return rows;
  };
  const columns = [
    { key: 'id', title: 'ID', width: 80, pinned: 'left', editable: false },
    { key: 'name', title: '品名', width: 140, filterType: 'set' },
    { key: 'qty', title: '数量', width: 90, align: 'right', editor: { type: 'number', min: 0 }, filterType: 'number' },
    { key: 'note', title: 'メモ', width: 140, pinned: 'right' },
  ];
  const isLabelRow = (row: Row) => row.kind === 'label';
  const getLabel = (row: Row) => row.name;
  const labelRowOf = (ctx: ParityContext, rowIndex: number, pane = 'center') => {
    const element = ctx.container.querySelector<HTMLElement>(`[data-pane="${pane}"][data-ssg-label-row][data-row-index="${rowIndex}"]`);
    if (!element) {
      throw new Error(`[${ctx.framework}] ラベル行がありません: ${rowIndex}`);
    }
    return element;
  };

  it.each([
    ['あり', ['labelRow', 'export']],
    ['なし(ラベル行もデータ行のまま)', ['export']],
  ])('帯と中身・行番号・下部バー・キー操作・ホバー・セクションの中の並び替え・エクスポート・検査(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      allowMissingFeatures: ['labelRow'],
      // 1 回の操作で別々の通知(並べ替えでの onStateChange と onActiveCellChange)が呼ばれるときの順番は React 版と違うことがある
      //   (docs/solid/README.md の「残した違い」)ので、状態は getState で見る。
      watch: ['onActiveCellChange'],
      props: () => ({
        rows: makeRows(),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 400,
        labelRow: { isLabelRow, getLabel },
        // 行が現れたときのフェードイン(animateRows)の印は、React 版は行の className が変わると描き直しで外れ、Solid 版は
        //   animationend まで残る(グループ化の検査と同じ理由で比べない)。
        animateRows: false,
      }),
      steps: async (ctx) => {
        ctx.snapshot('最初');
        // データ行のセルを押して ↓ でラベル行をまたぐ。
        await press(ctx, ctx.cell(2, 'name'));
        ctx.snapshot('品目 2 を押した');
        await key(ctx, { key: 'ArrowDown' });
        ctx.snapshot('↓');
        await key(ctx, { key: 'ArrowDown' });
        ctx.snapshot('もう一度 ↓');
        await key(ctx, { key: 'ArrowDown', shiftKey: true });
        ctx.snapshot('Shift + ↓');
        // セルにホバー → ラベル行へ動かすと行のホバーが消える。
        await ctx.act(() => {
          ctx.hover(ctx.cell(5, 'qty'));
        });
        ctx.snapshot('セルにホバー');
        if (features.includes('labelRow')) {
          await ctx.act(() => {
            ctx.hover(labelRowOf(ctx, 4));
          });
          ctx.snapshot('ラベル行にホバー');
        }
        // 見出しの Shift + 押すで数量の並び(ラベル行の位置は動かず、セクションの中で並ぶ)。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.header('qty'), { ...pointer, shiftKey: true });
          fireEvent.pointerUp(window, { ...pointer, shiftKey: true });
        });
        ctx.snapshot('数量で並べた');
        ctx.log('getState', call(ctx, 'getState'));
        ctx.log('getExportData', call(ctx, 'getExportData'));
        ctx.log('getExportData(includeLabelRows)', call(ctx, 'getExportData', { includeLabelRows: true }));
        ctx.log('getExportData(raw, includeLabelRows)', call(ctx, 'getExportData', { scope: 'raw', includeLabelRows: true }));
        ctx.log('getInvalidCells', call(ctx, 'getInvalidCells'));
        // 全体を選ぶ(角)と下部バーの件数。
        await ctx.act(() => {
          const corner = ctx.container.querySelector<HTMLElement>('.ssg-corner-cell');
          if (!corner) {
            throw new Error(`[${ctx.framework}] 角がありません`);
          }
          fireEvent.pointerDown(corner, pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.snapshot('全体を選んだ');
        // 行を足す(ラベル行の件数が変わる)。
        await ctx.setProps({
          rows: [...makeRows(), { id: 's5', kind: 'label', name: 'セクション 5', qty: 0, note: '' }, { id: 's5-1', name: '新', qty: 1, note: '' }],
        });
        ctx.snapshot('行を足した');
      },
    });
  });

  it('render / height / className(関数)/ sortMode / keepEmptySections / 列フィルターの候補 / 機能を切ったときの列メニュー', async () => {
    const reactRender = (ctx: { label: string; sectionRowCount: number | undefined; rowIndex: number; rowKey: unknown; sourceRowIndex: number }) =>
      createElement(
        'b',
        { className: 'my-label', 'data-key': String(ctx.rowKey) },
        `${ctx.label} (${String(ctx.sectionRowCount)}) #${ctx.rowIndex} @${ctx.sourceRowIndex}`,
      );
    const solidRender = (ctx: { label: string; sectionRowCount: number | undefined; rowIndex: number; rowKey: unknown; sourceRowIndex: number }) => (
      <b class="my-label" data-key={String(ctx.rowKey)}>
        {`${ctx.label} (${String(ctx.sectionRowCount)}) #${ctx.rowIndex} @${ctx.sourceRowIndex}`}
      </b>
    );
    await expectParity({
      features: ['labelRow', 'filtering', 'columnMenu', 'export'],
      watch: ['onFiltersChange', 'onSortChange'],
      props: (framework) => ({
        rows: makeRows(),
        columns: columns.map((column) => (column.key === 'name' ? { ...column, rowGroup: false } : column)),
        rowKeyGetter: (row: Row) => row.id,
        height: 400,
        onColumnsChange: () => {},
        animateRows: false,
        labelRow: {
          isLabelRow,
          getLabel,
          render: framework === 'react' ? reactRender : solidRender,
          height: 44,
          className: (row: Row) => (row.id === 's2' ? 'is-second' : 'is-label'),
          sortMode: 'follow',
          keepEmptySections: true,
          // 列ごとのセルの配列(足りない列は空、余りは捨てる)。
          exportText: (row: Row) => [row.id, `【${row.name}】`],
        },
      }),
      steps: async (ctx) => {
        ctx.snapshot('最初');
        // 列メニュー(ラベル行がある表ではグループ化の項目を出さない)。
        await ctx.act(() => {
          const button = ctx.header('name').querySelector<HTMLButtonElement>('.ssg-icon-btn');
          if (!button) {
            throw new Error(`[${ctx.framework}] ⋮ がありません`);
          }
          fireEvent.pointerDown(button, { ...pointer, pointerType: 'mouse' });
          fireEvent.pointerUp(button, { ...pointer, pointerType: 'mouse' });
          fireEvent.click(button, { detail: 1 });
        });
        ctx.snapshot('品名の列メニュー');
        // フィルター…(set の候補はデータ行の値だけ)。
        await ctx.act(() => {
          const item = Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((el) =>
            el.textContent?.includes('フィルター…'),
          );
          if (!item) {
            throw new Error(`[${ctx.framework}] フィルター… がありません`);
          }
          fireEvent.click(item, { detail: 1 });
        });
        ctx.snapshot('品名のフィルター');
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'Escape' });
        });
        // 並び(follow: 全体の順のまま、各セクションの最初の行の前にラベル行)。
        await ctx.act(() => {
          call(ctx, 'applyState', { sort: [{ columnKey: 'qty', direction: 'desc' }] });
        });
        ctx.snapshot('数量の降順(follow)');
        // 絞り込み(空のセクションも出す)。
        await ctx.act(() => {
          call(ctx, 'applyState', { filters: { globalFilterText: '', columnFilters: { qty: { kind: 'number', operator: 'gte', value: 50 } } } });
        });
        ctx.snapshot('数量 50 以上(keepEmptySections)');
        ctx.log('getExportData(includeLabelRows)', call(ctx, 'getExportData', { includeLabelRows: true }));
        // sortMode: 'hide'(並べている間はラベル行を出さない)・className を文字列に・高さを戻す。
        await ctx.setProps({
          labelRow: { isLabelRow, getLabel, sortMode: 'hide', className: 'plain-label' },
        });
        ctx.snapshot('hide');
        await ctx.act(() => {
          call(ctx, 'applyState', { sort: [], filters: { globalFilterText: '', columnFilters: {} } });
        });
        ctx.snapshot('並びと絞り込みを外した(hide でも出る)');
        // labelRow を外すとふつうのデータ行に戻る。
        await ctx.setProps({ labelRow: undefined });
        ctx.snapshot('labelRow を外した');
      },
    });
  });

  // render の本体で読んだ値(ここではラベルと行のキー)が変わらなければ、ほかのデータ行を書き換えても中身を作り直さない
  //   (React 版はメモの行の再描画で同じ要素を使い回す。中の入力欄のフォーカスや打ちかけの文字が消えない)。
  it('ラベル行の中身(render)は、ほかのデータ行を書き換えても作り直さない', async () => {
    await expectParity({
      features: ['labelRow'],
      props: (framework) => ({
        rows: makeRows(),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 400,
        animateRows: false,
        labelRow: {
          isLabelRow,
          getLabel,
          render:
            framework === 'react'
              ? ({ label, rowKey }: { label: string; rowKey: unknown }) =>
                  createElement('b', { className: 'my-label' }, `${label} ${String(rowKey)}`)
              : ({ label, rowKey }: { label: string; rowKey: unknown }) => {
                  const text = `${label} ${String(rowKey)}`;
                  return <b class="my-label">{text}</b>;
                },
        },
      }),
      steps: async (ctx) => {
        ctx.track('S1 の中身', () => ctx.container.querySelector('[data-pane="center"][data-ssg-label-row][data-row-index="0"] .my-label'));
        ctx.snapshot('最初');
        await ctx.setProps({ rows: ctx.rows().map((row) => ((row as Row).id === 's2-1' ? { ...(row as Row), qty: 99 } : row)) });
        ctx.snapshot('S2 のデータ行を書き換えた');
      },
    });
  });

  it('縦スクロールの固定(sticky)と、上へ見せる行を帯の下に合わせる', async () => {
    const manyRows: Row[] = [];
    for (let s = 1; s <= 6; s += 1) {
      manyRows.push({ id: `s${s}`, kind: 'label', name: `セクション ${s}`, qty: 0, note: '' });
      for (let i = 1; i <= 5; i += 1) {
        manyRows.push({ id: `${s}-${i}`, name: `row ${s}-${i}`, qty: i, note: '' });
      }
    }
    await expectParity({
      features: ['labelRow'],
      props: () => ({
        rows: manyRows,
        columns,
        rowKeyGetter: (row: Row) => row.id,
        rowHeight: 30,
        headerHeight: 40,
        height: 300,
        animateRows: false,
        labelRow: { isLabelRow, getLabel, sticky: true },
      }),
      steps: async (ctx) => {
        const scroller = ctx.container.querySelector<HTMLElement>('.ssg-scroll-container');
        if (!scroller) {
          throw new Error('スクロールの器がありません');
        }
        const scrollTo = async (top: number) => {
          await ctx.act(() => {
            scroller.scrollTop = top;
            scroller.dispatchEvent(new Event('scroll'));
          }, 60);
        };
        ctx.snapshot('先頭(固定なし)');
        await scrollTo(45);
        ctx.snapshot('セクション 1 の途中');
        ctx.track('固定した帯(中央)', () => ctx.container.querySelector('[data-pane="center"][data-ssg-sticky-label] .ssg-label-row-content'));
        await scrollTo(160);
        ctx.snapshot('次のラベルが押し上げる');
        await scrollTo(190);
        ctx.snapshot('セクション 2 に交代');
        // ホバー(固定した帯の上では行のホバーを出さない)。
        await ctx.act(() => {
          ctx.hover(ctx.cell(8, 'name'));
        });
        await ctx.act(() => {
          const sticky = ctx.container.querySelector('[data-pane="center"][data-ssg-sticky-label]');
          if (!sticky) {
            throw new Error(`[${ctx.framework}] 固定した帯がありません`);
          }
          ctx.hover(sticky);
        });
        ctx.snapshot('固定した帯にホバー');
        // ↑ で帯の裏に入る行へ: 帯の下に合わせる(scrollTo の呼び出しを控える。jsdom の scrollHeight は 0 で、スクロールできる
        //   量が 0 に詰められるので、器の scrollHeight を足す)。
        const calls: number[] = [];
        Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => 10000 });
        scroller.scrollTo = ((options: ScrollToOptions) => {
          calls.push(options.top ?? Number.NaN);
        }) as typeof scroller.scrollTo;
        await ctx.act(() => {
          call(ctx, 'selectCell', 8, 1);
          ctx.shell().focus();
        });
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'ArrowUp' });
        });
        ctx.log('↑ の後', [call(ctx, 'getActiveCell'), calls.at(-1)]);
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'Home', ctrlKey: true });
        });
        ctx.log('Ctrl+Home の後', [call(ctx, 'getActiveCell'), calls.at(-1)]);
        await ctx.act(() => {
          call(ctx, 'scrollToRow', 9, { align: 'start' });
        });
        await ctx.act(() => {
          call(ctx, 'scrollToRow', 6, { align: 'start' });
        });
        ctx.log('scrollTo の位置', calls);
        await scrollTo(0);
        ctx.snapshot('先頭へ戻した');
      },
    });
  });
});