// 追加(本体分解 E-7): グリッドエンジンの束ねです(React 非依存)。E-1〜E-6 で切り出したリゾルバ(派生値計算)/
//   コマンド群 / 通知 / DOM コントローラを 1 つのインスタンスとして生成し、外部 store もここで作ります。
//   - 描画側(React シェル = SpreadsheetGrid.tsx / 将来の Solid アダプタ)は createGridEngine を 1 回だけ呼び、
//     レンダーごとにリゾルバへ入力を渡して派生値を得、各コマンド / コントローラへは update(args) で最新の
//     状態を渡します(React は useControllerLifecycle、Solid は createEffect で接続)。
//   - 派生値の計算順(列 → store → ペイン → 行パイプライン → 縦レイアウト → …)と、その間に挟まる非同期
//     コントローラ(グローバルフィルターの時間分割 / SSRM RowModel / 候補収集 / ポップオーバー)の接続は描画側が
//     担います。エンジンは「同じ入力なら同じ参照」を保証するリゾルバ群と、恒久安定なコマンド群を提供します。
//   - dispose はエンジンが持つ全コントローラの後始末(タイマー / リスナー / observer)をまとめて行います。
import { createGridStore, type GridStore } from '../model/gridStore';
import { createInitialGridUiState, gridUiReducer } from '../model/gridReducer';
import { gridActions } from '../model/gridActions';
import type { GridUiState } from '../model/gridTypes.unbound';
import { dropUnknownColumnKeys, migrateGridStatePatch } from '../logic/gridState';
import type { GridColumnState } from '../model/gridTypes.core';
import {
  createDetailIndexCacheHolder,
  createDetailKeysPruner,
  type DetailIndexCacheHolder,
  type DetailKeysPruner,
} from '../logic/detailRow';
import type { AutoHeightMeasurer } from '../controllers/autoHeightMeasurer';
import { createScrollSyncController, type ScrollSyncController } from '../controllers/scrollSyncController';
import { createRowEnterController, type RowEnterController } from '../controllers/rowEnterController';
import type { ChangeHighlightController } from '../controllers/changeHighlightController';
import type { SaveStatusController } from '../controllers/saveStatusController';
import type { FindController } from '../controllers/findController';
import {
  createInertAutoHeightMeasurer,
  createInertChangeHighlightController,
  createInertConditionalFormatStatsResolver,
  createInertDateRolloverStore,
  createInertSaveStatusController,
  createInertFindController,
  createInertImeInputController,
  createInertTotalRowCellsResolver,
  type GridCoreFeatures,
} from './features';
import type { ConditionalFormatStatsResolver } from '../logic/conditionalFormat';
import type { TotalRowCellsResolver } from '../logic/totalRow';
import { createDebouncedValueStore, type DebouncedValueStore } from '../controllers/debouncedValueStore';
import type { DateRolloverStore } from '../controllers/dateRolloverStore';
import { createAutoSizeOnDataTrigger, type AutoSizeOnDataTrigger } from '../controllers/columnAutosizeRunner';
import type { ImeInputController } from '../controllers/imeInputController';
import {
  createColumnResolver,
  createPaneLayoutResolver,
  type ColumnResolution,
  type ColumnResolutionInputs,
  type PaneLayoutInputs,
  type PaneLayoutResolution,
} from './columnLayout';
import { createRowPipelineResolver, type RowPipelineResolver, type ServerSideQueryResolution } from './rowPipeline';
import {
  createVerticalLayoutResolver,
  type VerticalLayoutInputs,
  type VerticalLayoutResolution,
} from './verticalLayout';
import { createColumnCommands, type ColumnCommands } from './columnCommands';
import { createRowSelectionCommands, type RowSelectionCommands } from './rowSelectionCommands';
import { createGridApi, type GridApi } from './gridApi';
import {
  createActiveCellNotifier,
  createCellEventNotifier,
  createDetailKeysNotifier,
  createHoverRowNotifier,
  createStateChangeNotifier,
  type ActiveCellNotifier,
  type CellEventNotifier,
  type DetailKeysNotifier,
  type HoverRowNotifier,
  type StateChangeNotifier,
} from './notifiers';

// serverSide query の debounce(キーストロークごとのキャッシュ破棄 + block 0 取り直しを抑止)。
export const SERVER_SIDE_QUERY_DEBOUNCE_MS = 300;

export type GridEngineInit<T> = {
  // 追加(差し込み式 段階 2): 機能セット(engine/features.ts)。無い機能は何もしない代役が受けます(全機能は
  //   engine/fullFeatures.ts の fullCoreFeatures)。
  features: GridCoreFeatures;
  // 初期 store 状態(初回の visibleColumns)を作るための列解決入力。
  columnInputs: ColumnResolutionInputs<T>;
  // 追加(段階 2 DU-12): 状態の初期値(initialState prop。マウント時だけ使う)。
  initialState?: unknown;
  // serverSide query の初期値(debounce ストアの seed。mount 時の queryKey と一致させる)。
  serverSide: {
    isServerSide: boolean;
    enableGlobalFilter: boolean;
    enableColumnFilter: boolean;
    enableSorting: boolean;
  };
};

export type GridEngine<T> = {
  store: GridStore;
  // 派生値リゾルバ(同じ入力なら同じ参照)。
  resolveColumns: (inputs: ColumnResolutionInputs<T>) => ColumnResolution<T>;
  resolvePaneLayout: (inputs: PaneLayoutInputs<T>) => PaneLayoutResolution<T>;
  rowPipeline: RowPipelineResolver<T>;
  resolveVerticalLayout: (inputs: VerticalLayoutInputs<T>) => VerticalLayoutResolution;
  // コマンド群(参照安定。update(args) で最新の状態を受ける)。
  // 変更(差し込み式 段階 5): 列フィルターのポップオーバーの派生値 / コマンド群(engine/filterPopoverCommands)は持たない
  //   (描画側のフィルターの機能が作る。機能を外した構成に持ち込まないため)。
  columnCommands: ColumnCommands<T>;
  rowSelectionCommands: RowSelectionCommands<T>;
  gridApi: GridApi<T>;
  // 外部通知。
  hoverRowNotifier: HoverRowNotifier;
  detailKeysNotifier: DetailKeysNotifier;
  stateChangeNotifier: StateChangeNotifier<T>;
  // 追加(G-1): セル操作の通知(クリック / ダブルクリック = レイアウト effect で接続、アクティブセル = passive)。
  cellEventNotifier: CellEventNotifier<T>;
  activeCellNotifier: ActiveCellNotifier<T>;
  // DOM / タイマーを持つコントローラ。
  autoHeightMeasurer: AutoHeightMeasurer<T>;
  scrollSync: ScrollSyncController;
  // 追加(motion-2 / M-8): SSRM のブロック到着で差し替わった行へ enter クラスを直付けする DOM コントローラ。
  rowEnter: RowEnterController;
  // 追加(motion-6 / M-2): rows の差分で値が変わったセルへフラッシュ / 数値トゥイーンを直付けする DOM コントローラ。
  changeHighlight: ChangeHighlightController<T>;
  // 追加(motion-7 / M-9): SSRM 書き戻しのセル単位の保存状態を data 属性で直付けする DOM コントローラ。
  saveStatus: SaveStatusController;
  // 追加(F-2): セル内検索(開閉 / クエリ / ヒット / カレント。走査は時間分割)。
  find: FindController<T>;
  // 追加(F-3): 条件付き書式の列ごとの min / max(ビュー行から集計。内容が同じなら前回の参照)。
  resolveConditionalFormatStats: ConditionalFormatStatsResolver<T>;
  // 追加(合計行 3A): 合計行のセル値(フィルター後のデータ行から集計。内容が同じなら前回の参照)。
  resolveTotalRowCells: TotalRowCellsResolver<T>;
  serverSideQueryStore: DebouncedValueStore<ServerSideQueryResolution>;
  // 追加(監査 L-15): 相対日付プリセットの基準日(日付が変わったら差し替わる)。
  dateRollover: DateRolloverStore;
  autoSizeOnData: AutoSizeOnDataTrigger<T>;
  // 追加(G-2): IME オンのままの直接入力(imeDirectInput)の入力受け。
  imeInput: ImeInputController;
  // 展開行の rowKey → view index キャッシュ(SSRM の query 変化で reset)。
  detailIndexCache: DetailIndexCacheHolder;
  // 追加(段階 2 DF-25): 展開中の行が rows から消えたら、そのキーを外す(clientSide)。
  detailKeysPruner: DetailKeysPruner<T>;
  dispose: () => void;
};

// 型だけの宣言です(ブラウザに process は無く、利用側のバンドラが process.env.NODE_ENV を文字列へ置き換える)。
declare const process: { env: { NODE_ENV?: string } };

// 追加(段階 2 DU-12): initialState から初期の UI 状態を作ります。applyState と同じ正規化(壊れた入力を捨てる + 今の列に
//   無い列の幅 / フィルター / ソートを捨てる)を通し、reducer の同じ action で畳み込みます。列メタ(columns)は使いません。
// 修正(段階 2 の見直し): initialState の columns(getState() の値をそのまま渡すと入っている)が columns prop と同じ並び / 表示 /
//   固定かどうか(両方にある列だけで比べる)。同じなら警告しません(getState() の値をそのまま渡せる、のとおりにする)。
const isSameColumnLayout = (
  saved: readonly GridColumnState[],
  columns: readonly { key: string; visible?: boolean; pinned?: 'left' | 'right' }[],
): boolean => {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const savedKeys = new Set(saved.map((entry) => entry.key));
  const savedShared = saved.filter((entry) => byKey.has(entry.key));
  const currentShared = columns.filter((column) => savedKeys.has(column.key));
  return (
    savedShared.length === currentShared.length &&
    savedShared.every((entry, index) => {
      const column = currentShared[index];
      return (
        column !== undefined &&
        column.key === entry.key &&
        (column.visible !== false) === (entry.visible !== false) &&
        (column.pinned ?? null) === (entry.pinned ?? null)
      );
    })
  );
};

// 追加(段階 2 の確かめ直し N2-4): 警告を出した initialState の値です。同じ値への警告は 1 回だけにします(React の StrictMode =
//   Next.js の開発時の既定では状態の初期化が 2 回呼ばれ、同じ警告が 2 回ずつ出ていた)。
const warnedInitialStates = /* @__PURE__ */ new WeakSet<object>();

const resolveInitialUiState = (
  initialState: unknown,
  columns: readonly { key: string; visible?: boolean; pinned?: 'left' | 'right' }[],
): GridUiState => {
  let state = createInitialGridUiState();
  if (initialState === undefined || initialState === null) {
    return state;
  }
  const { patch, dropped } = dropUnknownColumnKeys(
    migrateGridStatePatch(initialState),
    new Set(columns.map((column) => column.key)),
  );
  if (
    process.env.NODE_ENV !== 'production' &&
    !(typeof initialState === 'object' && warnedInitialStates.has(initialState))
  ) {
    if (typeof initialState === 'object') {
      warnedInitialStates.add(initialState);
    }
    if (dropped.length > 0) {
      console.warn(
        `[spreadsheet-grid] initialState: 今の列定義(columns)に無い列 ${dropped.map((key) => `\`${key}\``).join(', ')} の` +
          '列幅 / フィルター / 並べ替えを捨てました。',
      );
    }
    if (patch.columns !== undefined && !isSameColumnLayout(patch.columns, columns)) {
      console.warn(
        '[spreadsheet-grid] initialState の columns(列の並び / 表示 / 固定)が columns prop と違いますが、使いません。' +
          'columns prop で決めてください(マウントの後に変えるなら applyState)。',
      );
    }
  }
  if (patch.columnWidths) {
    state = gridUiReducer(state, gridActions.resetColumnWidths(patch.columnWidths));
  }
  if (patch.filters) {
    state = gridUiReducer(
      state,
      gridActions.setAllFilters({
        globalText: patch.filters.globalText ?? '',
        columnFilters: patch.filters.columnFilters ?? {},
      }),
    );
  }
  if (patch.sort) {
    state = gridUiReducer(state, gridActions.setSort(patch.sort));
  }
  return state;
};

export const createGridEngine = <T,>(init: GridEngineInit<T>): GridEngine<T> => {
  const resolveColumns = createColumnResolver<T>(init.features);
  const resolvePaneLayout = createPaneLayoutResolver<T>();
  const rowPipeline = createRowPipelineResolver<T>(init.features);
  const resolveVerticalLayout = createVerticalLayoutResolver<T>(init.features.autoHeight);

  // 変更(監査 RD-5 / M-03): 初期 state は列に依存しなくなりました(列幅 state は空で始まる)。
  // 変更(段階 2 DU-12): initialState があればその値で始めます(SSRM の最初の query とサーバーの描画にも効く)。
  const store = createGridStore(
    resolveInitialUiState(init.initialState, init.columnInputs.columns),
  );

  const initialUiState = store.getState();
  // 変更(差し込み式 段階 5): 機能セットに filtering が無ければ代役(見張らない)。
  const dateRollover = (init.features.filtering?.createDateRolloverStore ?? createInertDateRolloverStore)();
  // 修正(段階 2 の見直し): 最初の query のキーにも相対日付プリセットの範囲を入れます(シェルが最初の描画で作る query と
  //   同じキーにする。initialState に「今月」などを入れると、これまでは debounce の後にキーが変わって最初のブロックを
  //   取り直していた)。
  const resolveRelativeDateKey = init.features.filtering?.resolveRelativeDateFilterKey;
  const initialServerSideQuery = rowPipeline.resolveServerSideQuery({
    isServerSide: init.serverSide.isServerSide,
    globalFilterEnabled: init.serverSide.enableGlobalFilter,
    globalText: initialUiState.filters.globalText,
    columnFilterEnabled: init.serverSide.enableColumnFilter,
    columnFilters: initialUiState.filters.columnFilters,
    sortingEnabled: init.serverSide.enableSorting,
    sort: initialUiState.sort,
    relativeDateKey:
      init.serverSide.isServerSide && init.serverSide.enableColumnFilter && resolveRelativeDateKey
        ? resolveRelativeDateKey(init.columnInputs.columns, initialUiState.filters.columnFilters, dateRollover.getSnapshot())
        : undefined,
  });
  const serverSideQueryStore = createDebouncedValueStore(initialServerSideQuery, SERVER_SIDE_QUERY_DEBOUNCE_MS);

  // 変更(差し込み式 段階 4): 機能セットに autoHeight が無ければ代役(測らない)。
  const autoHeightMeasurer = (init.features.autoHeight?.createAutoHeightMeasurer ?? createInertAutoHeightMeasurer)<T>();
  const scrollSync = createScrollSyncController();
  const rowEnter = createRowEnterController();
  // 変更(差し込み式 段階 2): 機能セットに motionExtras が無ければ代役(変更セルを強調しない)。
  const changeHighlight =
    init.features.motionExtras?.createChangeHighlightController<T>() ?? createInertChangeHighlightController<T>();
  // 変更(差し込み式 段階 5): 機能セットに serverSide が無ければ代役(保存状態を表示しない)。
  const saveStatus = (init.features.serverSide?.createSaveStatusController ?? createInertSaveStatusController)();
  const find = init.features.find?.createFindController<T>() ?? createInertFindController<T>();
  const autoSizeOnData = createAutoSizeOnDataTrigger<T>();
  // 変更(差し込み式 段階 2): 機能セットに imeDirectInput が無ければ代役(何もしない)。
  const imeInput = init.features.imeDirectInput?.createImeInputController() ?? createInertImeInputController();

  return {
    store,
    resolveColumns,
    resolvePaneLayout,
    rowPipeline,
    resolveVerticalLayout,
    columnCommands: createColumnCommands<T>(),
    rowSelectionCommands: createRowSelectionCommands<T>(),
    gridApi: createGridApi<T>(init.features),
    hoverRowNotifier: createHoverRowNotifier(),
    detailKeysNotifier: createDetailKeysNotifier(),
    stateChangeNotifier: createStateChangeNotifier<T>(),
    cellEventNotifier: createCellEventNotifier<T>(),
    activeCellNotifier: createActiveCellNotifier<T>(),
    autoHeightMeasurer,
    scrollSync,
    rowEnter,
    changeHighlight,
    saveStatus,
    find,
    // 変更(差し込み式 段階 2): 機能セットに conditionalFormat が無ければ代役(常に空)。
    resolveConditionalFormatStats:
      init.features.conditionalFormat?.createConditionalFormatStatsResolver<T>() ??
      createInertConditionalFormatStatsResolver<T>(),
    // 変更(差し込み式 段階 2): 機能セットに totalRow が無ければ代役(常に空)。
    resolveTotalRowCells:
      init.features.totalRow?.createTotalRowCellsResolver<T>() ?? createInertTotalRowCellsResolver<T>(),
    serverSideQueryStore,
    dateRollover,
    autoSizeOnData,
    imeInput,
    detailIndexCache: createDetailIndexCacheHolder(),
    detailKeysPruner: createDetailKeysPruner<T>(),
    dispose: () => {
      autoHeightMeasurer.dispose();
      scrollSync.dispose();
    rowEnter.dispose();
    changeHighlight.dispose();
    saveStatus.dispose();
    find.dispose();
      serverSideQueryStore.dispose();
      dateRollover.dispose();
      imeInput.dispose();
    },
  };
};