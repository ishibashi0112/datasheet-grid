// SpreadsheetGrid を実際に render し、命令的ハンドル(getState / applyState)と onStateChange の
//   「配線」を実行検証する結合テストです。純ロジック(logic/gridState.test.ts)では到達できない以下を、
//   実コンポーネントを通して確認します:
//   - getState がライブの uiState / columns を読んでスナップショット(v2: 列メタ含む)を返す。
//   - applyState が dispatch → reducer → 再レンダーを経て getState に反映される(往復)。
//   - applyState の列メタ(順序 / 可視 / ピン)が onColumnsChange 経由で controlled に反映される(往復)。
//   - onStateChange effect が「初回マウント非発火 / 状態変化(列メタ含む)で発火 / 同値では再発火しない」。
//   renderHook 系テストと同じく DOM を要するため、本ファイルのみ jsdom で回します。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, screen, fireEvent } from '@testing-library/react';
import { createRef, useState } from 'react';
import type { Ref } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { GRID_STATE_VERSION } from './logic/gridState';
import type {
  GridColumn,
  GridState,
  ServerSideDataSource,
  ServerSideGetRowsParams,
  SpreadsheetGridHandle,
} from './model/gridTypes';

// jsdom には ResizeObserver / Element.scrollTo が無い(SpreadsheetGrid がマウント時に new / 呼び出す)
//   ため、最小スタブを入れます。observe は no-op(コールバックを呼ばない)なので、これ起因の setState は
//   発生せず、テストの決定性を保てます。
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      ResizeObserverStub;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
});

afterEach(() => {
  cleanup();
});

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 160 },
  { key: 'qty', title: 'Qty', width: 100 },
];

const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 10 },
  { id: 2, name: 'beta', qty: 20 },
  { id: 3, name: 'gamma', qty: 30 },
];

// テスト全体で使い回す「適用する状態」。columnWidths は 1 列だけ(resetColumnWidths がフル置換である
//   ことの確認も兼ねる)、フィルター(global + 列)とソートも含めます。
const appliedState: GridState = {
  version: GRID_STATE_VERSION,
  columnWidths: { id: 120 },
  filters: {
    globalText: 'be',
    columnFilters: { name: { kind: 'text', value: 'be' } },
  },
  sort: [{ columnKey: 'qty', direction: 'desc' }],
};

// 追加(v2): controlled-columns ハーネスです。列メタ(可視 / 順序 / ピン)は consumer 所有のため、
//   applyState の列メタ反映は onColumnsChange を通ります。ここで columns を useState で保持して
//   onColumnsChange へ繋ぎ、applyState → onColumnsChange → 再レンダー → getState の往復を検証します。
function ControlledGrid({
  gridRef,
  initialColumns,
  onStateChange,
}: {
  gridRef: Ref<SpreadsheetGridHandle<Row>>;
  initialColumns: GridColumn<Row>[];
  onStateChange?: (state: GridState) => void;
}) {
  const [cols, setCols] = useState(initialColumns);
  return (
    <SpreadsheetGrid
      ref={gridRef}
      columns={cols}
      onColumnsChange={setCols}
      rows={rows}
      onStateChange={onStateChange}
    />
  );
}

describe('SpreadsheetGrid 状態 API(結合)', () => {
  it('getState() が初期スナップショットを返す', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} />);

    const state = ref.current?.getState();
    expect(state).toBeDefined();
    expect(state?.version).toBe(GRID_STATE_VERSION);
    // 初期 columnWidths は非 flex 列の width から作られます(flex 列なし)。
    expect(state?.columnWidths).toEqual({ id: 80, name: 160, qty: 100 });
    expect(state?.filters).toEqual({ globalText: '', columnFilters: {} });
    expect(state?.sort).toEqual([]);
    // 追加(v2): 列メタは columns prop から配列順で抽出されます(visible/pinned 未指定は省略)。
    expect(state?.columns).toEqual([
      { key: 'id' },
      { key: 'name' },
      { key: 'qty' },
    ]);
  });

  it('applyState() が reducer 経由で反映され getState() に出る', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} />);

    act(() => {
      ref.current?.applyState(appliedState);
    });

    const after = ref.current?.getState();
    expect(after?.version).toBe(GRID_STATE_VERSION);
    // resetColumnWidths はフル置換なので、適用後は { id: 120 } のみ(他列のエントリは消える)。
    expect(after?.columnWidths).toEqual({ id: 120 });
    expect(after?.filters).toEqual({
      globalText: 'be',
      columnFilters: { name: { kind: 'text', value: 'be' } },
    });
    expect(after?.sort).toEqual([{ columnKey: 'qty', direction: 'desc' }]);
  });

  it('onStateChange は初回マウントで発火しない', () => {
    const onStateChange = vi.fn();
    render(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        onStateChange={onStateChange}
      />,
    );

    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('onStateChange は applyState の状態変化で最新 state を 1 回渡して発火する', () => {
    const onStateChange = vi.fn();
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={rows}
        onStateChange={onStateChange}
      />,
    );

    act(() => {
      ref.current?.applyState(appliedState);
    });

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenLastCalledWith({
      version: GRID_STATE_VERSION,
      columnWidths: { id: 120 },
      filters: {
        globalText: 'be',
        columnFilters: { name: { kind: 'text', value: 'be' } },
      },
      sort: [{ columnKey: 'qty', direction: 'desc' }],
      // 追加(v2): この applyState は列メタ非適用(onColumnsChange 未指定)なので columns prop は不変。
      //   snapshot には現 columns の抽出が載ります。
      columns: [{ key: 'id' }, { key: 'name' }, { key: 'qty' }],
    });
  });

  it('onStateChange は同値の applyState では再発火しない(構造等価で抑止)', () => {
    const onStateChange = vi.fn();
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={rows}
        onStateChange={onStateChange}
      />,
    );

    // 1 回目: 初期状態 → appliedState への変化で発火。
    act(() => {
      ref.current?.applyState(appliedState);
    });
    expect(onStateChange).toHaveBeenCalledTimes(1);

    // 2 回目: 同値を再適用。reducer は新規オブジェクト参照を入れる(columnWidths/filters の参照は変わる)が、
    //   isSameGridState が構造等価と判定するため再発火しない。
    act(() => {
      ref.current?.applyState(appliedState);
    });
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it('追加(v2): applyState の列メタ(順序 / 可視 / ピン)が onColumnsChange 経由で反映され getState に出る', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<ControlledGrid gridRef={ref} initialColumns={columns} />);

    const v2State: GridState = {
      version: GRID_STATE_VERSION,
      columnWidths: {},
      filters: { globalText: '', columnFilters: {} },
      sort: [],
      // qty を left 固定 + 先頭、id を非表示、name は既定。
      columns: [
        { key: 'qty', pinned: 'left' },
        { key: 'id', visible: false },
        { key: 'name' },
      ],
    };

    act(() => {
      ref.current?.applyState(v2State);
    });

    const after = ref.current?.getState();
    // reorderColumnsByPane で qty(left)が先頭、続いて center の id, name。visible/pinned も復元。
    expect(after?.columns).toEqual([
      { key: 'qty', pinned: 'left' },
      { key: 'id', visible: false },
      { key: 'name' },
    ]);
  });

  it('追加(v2): onColumnsChange 未指定なら applyState の列メタはスキップ(v1 と同一・列順不変)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    // onColumnsChange を渡さない(controlled でない)素の SpreadsheetGrid。
    render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} />);

    act(() => {
      ref.current?.applyState({
        version: GRID_STATE_VERSION,
        columnWidths: {},
        filters: { globalText: '', columnFilters: {} },
        sort: [],
        columns: [{ key: 'qty' }, { key: 'name' }, { key: 'id' }], // reorder 指示
      });
    });

    // onColumnsChange が無いので列メタは適用されず、列順は初期のまま。
    const after = ref.current?.getState();
    expect(after?.columns).toEqual([
      { key: 'id' },
      { key: 'name' },
      { key: 'qty' },
    ]);
  });

  it('追加(v2): onStateChange は列メタ変化(applyState の reorder)でも発火し、最新の列メタを渡す', () => {
    const onStateChange = vi.fn();
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <ControlledGrid
        gridRef={ref}
        initialColumns={columns}
        onStateChange={onStateChange}
      />,
    );

    act(() => {
      ref.current?.applyState({
        version: GRID_STATE_VERSION,
        columnWidths: {},
        filters: { globalText: '', columnFilters: {} },
        sort: [],
        columns: [{ key: 'qty' }, { key: 'name' }, { key: 'id' }], // reorder
      });
    });

    expect(onStateChange).toHaveBeenCalled();
    const last = onStateChange.mock.calls.at(-1)?.[0] as GridState;
    expect(last.columns).toEqual([
      { key: 'qty' },
      { key: 'name' },
      { key: 'id' },
    ]);
  });
});

// 追加(THEME-3): dimReadOnlyCells の root 修飾子配線を検証します。淡色表示そのもの(CSS)は
//   jsdom では検証できないため、「opt-in で ssg-root--dim-readonly が付く / 既定では付かない」
//   というクラス配線を固定します(セマンティッククラス .ssg-body-cell--readonly の常時付与は
//   GridBodyLayer 側の既存経路で不変)。
describe('THEME-3: dimReadOnlyCells(readonly 淡色表示の opt-in)', () => {
  it('既定(未指定)では root に ssg-root--dim-readonly が付かない', () => {
    const { container } = render(
      <SpreadsheetGrid columns={columns} rows={rows} />,
    );
    const root = container.querySelector('.ssg-root');
    expect(root).not.toBeNull();
    expect(root?.classList.contains('ssg-root--dim-readonly')).toBe(false);
  });

  it('dimReadOnlyCells で root に ssg-root--dim-readonly が付く', () => {
    const { container } = render(
      <SpreadsheetGrid columns={columns} rows={rows} dimReadOnlyCells />,
    );
    const root = container.querySelector('.ssg-root');
    expect(root?.classList.contains('ssg-root--dim-readonly')).toBe(true);
  });
});

// 追加(TH-DK-2): theme prop の root 修飾子配線を検証します。ダークプリセットそのもの(CSS の
//   トークン上書き)は jsdom では検証できないため、クラス配線だけを固定します。'auto' の
//   matchMedia 解決は useResolvedGridTheme.test.ts 側で検証済み(jsdom 素では light 扱い)。
describe('TH-DK-2: theme(カラーテーマ)', () => {
  it('既定(未指定)では root に ssg-theme-dark が付かない', () => {
    const { container } = render(
      <SpreadsheetGrid columns={columns} rows={rows} />,
    );
    const root = container.querySelector('.ssg-root');
    expect(root).not.toBeNull();
    expect(root?.classList.contains('ssg-theme-dark')).toBe(false);
  });

  it("theme='dark' で root に ssg-theme-dark が付く", () => {
    const { container } = render(
      <SpreadsheetGrid columns={columns} rows={rows} theme="dark" />,
    );
    expect(
      container.querySelector('.ssg-root')?.classList.contains(
        'ssg-theme-dark',
      ),
    ).toBe(true);
  });

  it("theme='auto' は matchMedia 非対応環境(jsdom 素)では light 扱い", () => {
    const { container } = render(
      <SpreadsheetGrid columns={columns} rows={rows} theme="auto" />,
    );
    expect(
      container.querySelector('.ssg-root')?.classList.contains(
        'ssg-theme-dark',
      ),
    ).toBe(false);
  });
});

// 追加(THEME-2): density プリセットの配線を検証します。root 修飾子と、rowHeight / headerHeight
//   既定値の解決(明示 prop 優先)を、ヘッダー行のインライン height で観測します(jsdom でも
//   インライン style は評価可能。寸法トークンの CSS 適用そのものは実機確認)。
describe('THEME-2: density(密度プリセット)', () => {
  const headerRowHeight = (container: HTMLElement): string => {
    const headerRow = container.querySelector('.ssg-header-row');
    return headerRow instanceof HTMLElement ? headerRow.style.height : '';
  };

  it('既定(standard)では density 修飾子なし・headerHeight は従来既定 40px', () => {
    const { container } = render(
      <SpreadsheetGrid columns={columns} rows={rows} />,
    );
    const root = container.querySelector('.ssg-root');
    expect(root).not.toBeNull();
    expect(root?.className).not.toContain('ssg-root--density-');
    expect(headerRowHeight(container)).toBe('40px');
  });

  it("density='compact' で root 修飾子が付き headerHeight 既定が 32px になる", () => {
    const { container } = render(
      <SpreadsheetGrid columns={columns} rows={rows} density="compact" />,
    );
    expect(
      container
        .querySelector('.ssg-root')
        ?.classList.contains('ssg-root--density-compact'),
    ).toBe(true);
    expect(headerRowHeight(container)).toBe('32px');
  });

  it('明示 headerHeight は density プリセットより常に優先される', () => {
    const { container } = render(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        density="compact"
        headerHeight={50}
      />,
    );
    expect(headerRowHeight(container)).toBe('50px');
  });
});

// 追加(FM-2): フィルターチップバー(showFilterChipBar)の配線テストです。
//   チップバーは列仮想化の外(トップバー直下)で描画されるため、jsdom の 0 列描画の制約を
//   受けません。フィルターは applyState で注入します(状態 API 経由 = 既存テストと同じ作法)。
describe('SpreadsheetGrid フィルターチップバー(FM-2・結合)', () => {
  // name 列に text フィルターを掛けた状態です(チップ要約は「"be" を含む」になります)。
  const chipState: GridState = {
    version: GRID_STATE_VERSION,
    columnWidths: {},
    filters: {
      globalText: '',
      columnFilters: { name: { kind: 'text', value: 'be' } },
    },
    sort: [],
  };

  it('showFilterChipBar=true + 有効フィルターでチップと「すべてクリア」を描画する', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={rows}
        showFilterChipBar
      />,
    );
    act(() => {
      ref.current?.applyState(chipState);
    });
    expect(screen.getByLabelText('Name のフィルターを編集')).toBeTruthy();
    expect(screen.getByText('"be" を含む')).toBeTruthy();
    expect(screen.getByText('すべてクリア')).toBeTruthy();
  });

  it('× でその列のフィルターがクリアされ、0 件になるとバーごと消える', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={rows}
        showFilterChipBar
      />,
    );
    act(() => {
      ref.current?.applyState(chipState);
    });
    fireEvent.click(screen.getByLabelText('Name のフィルターをクリア'));
    expect(ref.current?.getState().filters.columnFilters).toEqual({});
    // 0 件 → バーごと非表示(チップも「すべてクリア」も無くなります)。
    expect(screen.queryByText('すべてクリア')).toBeNull();
    expect(screen.queryByLabelText('Name のフィルターを編集')).toBeNull();
  });

  it('既定(showFilterChipBar 未指定 = false)では有効フィルターがあっても描画しない', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} />);
    act(() => {
      ref.current?.applyState(chipState);
    });
    expect(screen.queryByText('すべてクリア')).toBeNull();
    expect(screen.queryByLabelText('Name のフィルターを編集')).toBeNull();
  });
});

// 追加(FM-3): フィルター管理パネル導線(ハンドル API / Filters chip クリック)の配線テストです。
//   パネルは portal(body 直下)+ gridRoot 右上アンカーで、jsdom の 0 矩形でもビューポート
//   margin へクランプした layout が計算されるため、描画有無を検証できます。
// 変更(UP-1): パネルは統合ツールパネル(タブ切替)になり、旧タイトル「フィルター管理」は
//   消えました。「フィルタータブのコンテンツが表示されている」ことの目印には、フィルター
//   タブ固有の要素(「フィルターを追加する列を選択」<select>)を使います。
describe('SpreadsheetGrid フィルター管理パネル導線(FM-3・結合)', () => {
  it('handle.openFilterManager() でパネルが開き、closeFilterManager() で閉じる', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} />);
    expect(screen.queryByLabelText('フィルターを追加する列を選択')).toBeNull();
    act(() => {
      ref.current?.openFilterManager();
    });
    expect(screen.getByLabelText('フィルターを追加する列を選択')).toBeTruthy();
    act(() => {
      ref.current?.closeFilterManager();
    });
    expect(screen.queryByLabelText('フィルターを追加する列を選択')).toBeNull();
  });

  it('enableColumnFilter=false では openFilterManager() は何もしない', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={rows}
        enableColumnFilter={false}
      />,
    );
    act(() => {
      ref.current?.openFilterManager();
    });
    expect(screen.queryByLabelText('フィルターを追加する列を選択')).toBeNull();
  });

  it('既定トップバーの Filters chip クリックでパネルがトグルする(pointerdown で閉じ戻らない)', () => {
    render(<SpreadsheetGrid columns={columns} rows={rows} />);
    const chip = screen.getByLabelText('フィルター管理パネルを開閉');
    // 実イベント順(pointerdown → click)で開きます。
    fireEvent.pointerDown(chip);
    fireEvent.click(chip);
    expect(screen.getByLabelText('フィルターを追加する列を選択')).toBeTruthy();
    // もう一度同じ順で押すと閉じます(chip の onPointerDown stopPropagation により、
    //   「pointerdown の outside-close → click の再オープン」で開いたままにならないこと)。
    fireEvent.pointerDown(chip);
    fireEvent.click(chip);
    expect(screen.queryByLabelText('フィルターを追加する列を選択')).toBeNull();
  });

  it('enableColumnFilter=false では Filters chip はクリック可能にならない(span のまま)', () => {
    render(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        enableColumnFilter={false}
      />,
    );
    expect(
      screen.queryByLabelText('フィルター管理パネルを開閉'),
    ).toBeNull();
  });
});

// 追加(batch 8): ハンドル refreshServerSide() の配線検証です。フックのソフトリフレッシュ挙動
//   そのものは useServerSideRowModel.test.ts が正本で、ここでは「ハンドル → hook.refresh 委譲」と
//   「clientSide での警告付き no-op」だけを実コンポーネント越しに確認します。
//   jsdom では仮想化窓が空(requestRange 未到達)のため、refresh() の block 0 ブートストラップ
//   フォールバックで再取得を観測します。
describe('SpreadsheetGrid refreshServerSide(結合)', () => {
  it('serverSide では getRows の再取得が起きる(キャッシュ破棄 + 取り直し)', async () => {
    const calls: ServerSideGetRowsParams[] = [];
    const dataSource: ServerSideDataSource<Row> = {
      getRows: (params) => {
        calls.push(params);
        return Promise.resolve({
          rows: rows.slice(params.startIndex, params.endIndex),
          totalRowCount: rows.length,
        });
      },
    };
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid ref={ref} columns={columns} dataSource={dataSource} />);
    // 件数未知 → mount で block 0 をブートストラップ(1 回目)。
    await act(async () => {
      await Promise.resolve();
    });
    expect(calls.length).toBe(1);

    act(() => {
      ref.current?.refreshServerSide();
    });
    await act(async () => {
      await Promise.resolve();
    });
    // キャッシュ破棄後に block 0 が取り直される(2 回目)。
    expect(calls.length).toBe(2);
    expect(calls[1]).toMatchObject({ startIndex: 0 });
  });

  it('clientSide(rows)では警告付き no-op', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ref = createRef<SpreadsheetGridHandle<Row>>();
      render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} />);
      act(() => {
        ref.current?.refreshServerSide();
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('refreshServerSide');
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// 追加(batch 9): SSRM エラーバー(getRows 失敗の再試行 UI)の配線検証です。失敗追跡・retry の
//   挙動そのものは useServerSideRowModel.test.ts が正本で、ここでは「失敗 → バー表示 →
//   再試行 → 回復 → バー消滅」の UI 往復と、onServerSideLoadError prop・閉じるボタンを
//   実コンポーネント越しに確認します。
describe('SpreadsheetGrid SSRM エラーバー(結合)', () => {
  // getRows の reject → catch → setState のマイクロタスク連鎖を流します。
  const flushMicrotasks = async (): Promise<void> => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('getRows 失敗でエラーバーが表示され、再試行で回復すると消える', async () => {
    let failMode = true;
    const calls: ServerSideGetRowsParams[] = [];
    const onServerSideLoadError = vi.fn();
    const dataSource: ServerSideDataSource<Row> = {
      getRows: (params) => {
        calls.push(params);
        if (failMode) {
          return Promise.reject(new Error('boom'));
        }
        return Promise.resolve({
          rows: rows.slice(params.startIndex, params.endIndex),
          totalRowCount: rows.length,
        });
      },
    };
    render(
      <SpreadsheetGrid
        columns={columns}
        dataSource={dataSource}
        onServerSideLoadError={onServerSideLoadError}
      />,
    );
    // 件数未知 → mount で block 0 をブートストラップ → reject → バー表示。
    await flushMicrotasks();
    expect(calls.length).toBe(1);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('行の取得に失敗しました');
    expect(alert.textContent).toContain('1 ブロック');
    expect(onServerSideLoadError).toHaveBeenCalledTimes(1);
    expect(onServerSideLoadError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onServerSideLoadError.mock.calls[0][1]).toMatchObject({
      startIndex: 0,
    });

    // 再試行 → 失敗ブロックのみ再 fetch(成功)→ バー消滅。
    failMode = false;
    fireEvent.click(screen.getByText('再試行'));
    await flushMicrotasks();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(calls.length).toBe(2);
  });

  it('エラーバーは × で閉じられる', async () => {
    const dataSource: ServerSideDataSource<Row> = {
      getRows: () => Promise.reject(new Error('boom')),
    };
    render(<SpreadsheetGrid columns={columns} dataSource={dataSource} />);
    await flushMicrotasks();
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('エラー通知を閉じる'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});