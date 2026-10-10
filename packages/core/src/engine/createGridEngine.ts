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
import { createInitialGridUiState } from '../model/gridReducer';
import { createDetailIndexCacheHolder, type DetailIndexCacheHolder } from '../logic/detailRow';
import { createAutoHeightMeasurer, type AutoHeightMeasurer } from '../controllers/autoHeightMeasurer';
import { createScrollSyncController, type ScrollSyncController } from '../controllers/scrollSyncController';
import { createRowEnterController, type RowEnterController } from '../controllers/rowEnterController';
import { createChangeHighlightController, type ChangeHighlightController } from '../controllers/changeHighlightController';
import { createSaveStatusController, type SaveStatusController } from '../controllers/saveStatusController';
import { createFindController, type FindController } from '../controllers/findController';
import {
  createConditionalFormatStatsResolver,
  type ConditionalFormatStatsResolver,
} from '../logic/conditionalFormat';
import { createDebouncedValueStore, type DebouncedValueStore } from '../controllers/debouncedValueStore';
import { createAutoSizeOnDataTrigger, type AutoSizeOnDataTrigger } from '../controllers/columnAutosizeRunner';
import { createImeInputController, type ImeInputController } from '../controllers/imeInputController';
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
import {
  createFilterPopoverCommands,
  createFilterPopoverDerivedResolver,
  type FilterPopoverCommands,
  type FilterPopoverDerived,
  type FilterPopoverDerivedInputs,
} from './filterPopoverCommands';
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
  // 初期 store 状態(初回の visibleColumns)を作るための列解決入力。
  columnInputs: ColumnResolutionInputs<T>;
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
  resolveFilterPopoverDerived: (inputs: FilterPopoverDerivedInputs<T>) => FilterPopoverDerived;
  // コマンド群(参照安定。update(args) で最新の状態を受ける)。
  columnCommands: ColumnCommands<T>;
  filterPopoverCommands: FilterPopoverCommands<T>;
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
  serverSideQueryStore: DebouncedValueStore<ServerSideQueryResolution>;
  autoSizeOnData: AutoSizeOnDataTrigger<T>;
  // 追加(G-2): IME オンのままの直接入力(imeDirectInput)の入力受け。
  imeInput: ImeInputController;
  // 展開行の rowKey → view index キャッシュ(SSRM の query 変化で reset)。
  detailIndexCache: DetailIndexCacheHolder;
  dispose: () => void;
};

export const createGridEngine = <T,>(init: GridEngineInit<T>): GridEngine<T> => {
  const resolveColumns = createColumnResolver<T>();
  const resolvePaneLayout = createPaneLayoutResolver<T>();
  const rowPipeline = createRowPipelineResolver<T>();
  const resolveVerticalLayout = createVerticalLayoutResolver<T>();
  const resolveFilterPopoverDerived = createFilterPopoverDerivedResolver<T>();

  // 変更(監査 RD-5 / M-03): 初期 state は列に依存しなくなりました(列幅 state は空で始まる)。
  const store = createGridStore(createInitialGridUiState());

  const initialUiState = store.getState();
  const initialServerSideQuery = rowPipeline.resolveServerSideQuery({
    isServerSide: init.serverSide.isServerSide,
    globalFilterEnabled: init.serverSide.enableGlobalFilter,
    globalText: initialUiState.filters.globalText,
    columnFilterEnabled: init.serverSide.enableColumnFilter,
    columnFilters: initialUiState.filters.columnFilters,
    sortingEnabled: init.serverSide.enableSorting,
    sort: initialUiState.sort,
  });
  const serverSideQueryStore = createDebouncedValueStore(initialServerSideQuery, SERVER_SIDE_QUERY_DEBOUNCE_MS);

  const autoHeightMeasurer = createAutoHeightMeasurer<T>();
  const scrollSync = createScrollSyncController();
  const rowEnter = createRowEnterController();
  const changeHighlight = createChangeHighlightController<T>();
  const saveStatus = createSaveStatusController();
  const find = createFindController<T>();
  const autoSizeOnData = createAutoSizeOnDataTrigger<T>();
  const imeInput = createImeInputController();

  return {
    store,
    resolveColumns,
    resolvePaneLayout,
    rowPipeline,
    resolveVerticalLayout,
    resolveFilterPopoverDerived,
    columnCommands: createColumnCommands<T>(),
    filterPopoverCommands: createFilterPopoverCommands<T>(),
    rowSelectionCommands: createRowSelectionCommands<T>(),
    gridApi: createGridApi<T>(),
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
    resolveConditionalFormatStats: createConditionalFormatStatsResolver<T>(),
    serverSideQueryStore,
    autoSizeOnData,
    imeInput,
    detailIndexCache: createDetailIndexCacheHolder(),
    dispose: () => {
      autoHeightMeasurer.dispose();
      scrollSync.dispose();
    rowEnter.dispose();
    changeHighlight.dispose();
    saveStatus.dispose();
    find.dispose();
      serverSideQueryStore.dispose();
      imeInput.dispose();
    },
  };
};