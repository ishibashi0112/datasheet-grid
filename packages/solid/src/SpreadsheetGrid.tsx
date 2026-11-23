// Solid 2.0 版のシェル。React 版の GridShell.tsx を、同じ core(createGridEngine と各コントローラ)の上に Solid で
//   組み直したもの。DOM と class は React 版と同じなので、styles.css をそのまま使います。
//   段階 1 の範囲は React 版の機能なしの構成(`/lite` の createSpreadsheetGrid({ features: {} }))と同じで、
//   React 版と並べて DOM と通知を比べるテスト(src/parity/)で確かめます。
//
//   作り:
//   - 派生値は createMemo で、engine のリゾルバ(同じ入力なら同じ参照)を呼ぶだけ。React 版の useMemo の外皮と同じ並び。
//   - コントローラは connectController(primitives/controller.ts)で update を描画の段の effect から呼ぶ
//     (React 版の useControllerLifecycle。'effect' は React の passive effect)。
//   - store は primitives/gridStoreSignals.ts で signal にする(購読は onSettled の中)。
//   - 部品の本体では props を直接読まない(Solid 2.0 は本体での読み取りを警告する)。props は関数や memo の中で読む。
//   - React の onXxxCapture / onBlur / onFocus(子孫からも上がってくる)は、Solid では capture のリスナーを自分で付ける /
//     onFocusOut / onFocusIn にします。
import { For, Match, NoHydration, Show, Switch, createEffect, createMemo, createSignal, createUniqueId, isHydrating, latest, onCleanup, runWithOwner, untrack } from 'solid-js';
import type { Ref } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { isServer } from '@solidjs/web';
import type {
  CellCoord,
  CellDetailContext,
  EditorCommitDirection,
  GridLabelRow,
  GridRowKey,
  RowSelectionModel,
  SpreadsheetGridDerivedSummary,
} from '@ishibashi0112/spreadsheet-grid-core';
import { createGridEngine } from '@ishibashi0112/spreadsheet-grid-core/internal/engine/createGridEngine';
import type { GridColumn as UnboundGridColumn } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridTypes.unbound';
import type { AutosizeChipOf, AutosizeTotalRowText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/columnAutosize';
import { gridActions } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridActions';
import { buildSelectionSnapshot, selectGlobalFilter } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridSelectors';
import {
  buildColumnMeasurements,
  computeSinglePaneColumnExtent,
  getColumnPane,
  type ColumnPane,
  type PaneColumnEntry,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import { ROW_DRAG_HANDLE_COLUMN_KEY, moveArrayItem } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/rowReorder';
import {
  resolveSelectionBand,
  resolveSelectionBandSegments,
  resolveSelectionExtents,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/selectionOverlayGeometry';
import {
  isActiveCellRendered,
  placementRectInPane,
  resolveCellPlacement,
  resolveColumnHoverRect,
  resolvePaneBandRect,
  resolvePaneSegmentRects,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cellPlacement';
import { GRID_DENSITY_DIMENSIONS } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/density';
import { resolveGridHeightLayout } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/gridHeight';
import { resolveGridThemeClassName } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/theme';
import { MOTION_OFF_CLASS_NAME, resolveGridMotion } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/motion';
import { systemColorSchemeStore } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/systemColorSchemeStore';
import { reducedMotionStore } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/reducedMotionStore';
import { createLocaleTextResolver, formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import { EMPTY_TOTAL_ROW_CELLS } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/totalRow';
import {
  resolveSlotFromSignature,
  resolveSlotProps,
  resolveSlotMapFromSignature,
  serializeSlotValue,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/slotProps';
import {
  buildGridDerivedSummary,
  createDataColumnNamer,
  createDataRowNumberer,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/gridBarSummary';
import { isCheckboxChecked } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/checkboxEditor';
import {
  MAX_BODY_PX,
  physicalToLogicalScrollTop,
  resolvePageTargetRow,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/verticalGeometry';
import type { StickyTopInset } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/scrollTargets';
import {
  DEFAULT_DETAIL_ROW_HEIGHT,
  DETAIL_TOGGLE_COLUMN_KEY,
  isControlColumnKey,
  isDetailRowExpandable,
  isInsideDetailCardOf,
  isSyntheticColumnKey,
  resolveFirstDataColIndex,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/detailRow';
import { resolveDataRowNumber } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/labelRows';
import {
  createSelectedRowsInOrderCounter,
  getSelectAllState,
  resolveSelectAllState,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/rowSelection';
import { createDetailRowController } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/detailRowController';
import {
  registerPopupContainer,
  resolvePopupContainer,
} from '@ishibashi0112/spreadsheet-grid-core/internal/utils/popupContainer';
import { createCellCommands, writeCellValueTo } from '@ishibashi0112/spreadsheet-grid-core/internal/engine/cellCommands';
import { getCellValue } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
import { IME_INPUT_ATTRIBUTE, isImeComposingKeyEvent } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/domGuards';
import {
  createKeyboardController,
  resolveFirstDataCell,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/keyboardController';
import { createEditController } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/editController';
import {
  computeIsWholeGridSelected,
  createClipboardController,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/clipboardController';
import { createPointerInteractionsController } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/pointerInteractionsController';
import { createHistoryController } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/historyController';
import {
  createScrollScaleAnchor,
  createViewportSyncController,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/viewportSyncController';
import {
  acquireTooltipController,
  hideActiveCellTooltip,
  scheduleActiveCellTooltip,
  type TooltipController,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/tooltipController';
import {
  GRID_POPUP_SELECTOR,
  createEscapeClaimController,
  isClearableSelection,
  isEscapeClaimedByGrid,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/escapeClaimController';
import type {
  GridClassNames,
  GridColumn,
  SolidGridTypes,
  SpreadsheetGridProps,
  SpreadsheetGridSlotContext,
} from './model/gridTypes';
import { GridLocaleTextContext, mergeFeatureLocaleDefaults } from './context/localeText';
import { createUserCallbacks, runHandleCall } from './primitives/userCallback';
import { createPlainRows } from './primitives/storeRows';
import { createGridStoreSignals } from './primitives/gridStoreSignals';
import { createExternalStoreSignal } from './primitives/externalStore';
import { createGridViewSetters } from './primitives/viewSetters';
import { connectController } from './primitives/controller';
import { closeMountGateOnSettled, createMountGate, flushMountGate, onGridMounted, runInMountGate, type MountGate } from './primitives/mountGate';
import { createColumnVirtualizer } from './primitives/columnVirtualizer';
import type { SolidGridFeatures } from './features/types';
import { px, toSolidStyle } from './primitives/style';
import { createLiveObject } from './primitives/liveObject';
import { readEventKey } from './primitives/eventKey';
import { createSnapshotProps, revealServerFrame } from './primitives/serverSnapshot';
import { outsideGraphApply } from './primitives/effectApply';
import { GridHeaderRow } from './view/GridHeaderRow';
import {
  GridBodyLayer,
  type GridBodyLabelRowLayer,
  type GridBodyRowItem,
  type GridCellContentContext,
} from './view/GridBodyLayer';
import type { GridLabelRowRenderContent } from './view/GridBodyLabelRow';
import type { GridStickyLabelEntry } from './view/GridStickyLabelLayer';
import { Overlay, type OverlayRect } from './view/Overlay';
import { GridDetailLayer } from './view/GridDetailLayer';
import { DetailToggleButton } from './view/DetailToggleButton';
import { CheckboxCell } from './editors/CheckboxCell';
import { CellEditorLayer, type CellEditorSession } from './editors/CellEditorLayer';
import { GridPortalContext } from './context/portal';
import { DefaultGridTopBar } from './view/DefaultGridTopBar';
import { DefaultGridBottomBar } from './view/DefaultGridBottomBar';
import { createShellDevWarnings, warnHandleCallBeforeMount, warnMoveRowOnServerSide, withOpenToolPanelWarnings } from './devWarnings';

const EMPTY_ROWS: never[] = [];
const NEVER_EDITABLE = () => false;
const NO_COLUMNS: never[] = [];
const NO_COLUMN_FILTERS: Record<string, never> = {};
// 展開トグル列(合成列)の列定義の renderCell は印として置くだけで、ボタンは renderCellContent が描きます(読み上げの名前に
//   行見出しと同じ番号を入れるため。番号はラベル行を数えないので行の並びが要る。React 版の renderDetailToggleCell と同じ)。
const renderDetailToggleCell = (): JSX.Element => null;
const noop = () => {};
// 追加(段階 3-3 のレビュー): ref(solid-js の Ref)へハンドルを渡します。関数はそのまま呼び、配列は中の関数を順に呼ぶ
//   (@solidjs/web の applyRef と同じ。変数の ref はコンパイラが代入の関数に書き換えて渡す)。関数でない値は何もしない。
//   変更(段 3-1): ref の関数は部品の外(owner の無いところ)で呼びます。`ref={setGrid}`(signal の setter)で受けると、部品の
//   本体の中で signal へ書くことになり、Solid の開発ビルドが REACTIVE_WRITE_IN_OWNED_SCOPE で止めていました(DOM の要素の
//   ref は @solidjs/web が同じ書き込みを許す形で呼ぶので、`<div ref={setEl}>` は通る)。呼ぶ時点は今までどおり部品を作った
//   とき(利用者の最初の effect より前。S5-01)。
const applyHandleRef = <H,>(ref: Ref<H> | undefined, handle: H): void => {
  if (typeof ref === 'function') {
    runWithOwner(null, () => untrack(() => (ref as (value: H) => void)(handle)));
  } else if (Array.isArray(ref)) {
    for (const item of ref) applyHandleRef(item, handle);
  }
};

// 追加(0.1.0 の前の実アプリ点検 S5-01): ハンドルのメソッドを、呼ぶ前に before を走らせる形で包みます(1 回だけ作る。
//   同じメソッドはいつも同じ関数)。
const exposeHandle = <H extends object,>(handle: H, before: (method: string) => void): H => {
  const exposed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(handle)) {
    exposed[key] =
      typeof value === 'function'
        ? (...args: unknown[]) =>
            runHandleCall(() => {
              before(key);
              return (value as (...a: unknown[]) => unknown)(...args);
            })
        : value;
  }
  return exposed as H;
};

type MutableRef<V> = { current: V };

type EditorIdentity = { row: number; col: number; rowKey: GridRowKey | undefined; columnKey: string | undefined };
// identity が null = 編集を始めたときに行がまだ無かった(最初に取れた位置とキーを、セッションを変えずに覚える)。
type EditorSession = { id: number; identity: EditorIdentity | null };

// 利用側のバーへ渡す文脈のキー(SpreadsheetGridSlotContext のすべて。足りないと型で分かる)。
const SLOT_CONTEXT_KEYS = Object.keys({
  rows: true,
  columns: true,
  visibleColumns: true,
  filteredRows: true,
  globalFilterText: true,
  setGlobalFilterText: true,
  columnFilterValues: true,
  sortState: true,
  activeCell: true,
  selection: true,
  derivedSummary: true,
  globalFilterStatus: true,
  globalFilterProgress: true,
  selectionAggregates: true,
} satisfies Record<keyof SpreadsheetGridSlotContext<unknown>, true>) as (keyof SpreadsheetGridSlotContext<unknown>)[];
// 追加(段 3-3 / S1-21): バーの文脈の derivedSummary も項目ごとに読んだときに引く(1 つの値のままだと、本体で並びの要約だけを
//   読んでも、アクティブセルの番地など要約のどれかが変わるたびにバーを作り直していた)。
const DERIVED_SUMMARY_KEYS = Object.keys({
  rowSummaryText: true,
  columnSummaryText: true,
  filterSummaryText: true,
  sortSummaryText: true,
  activeCellLabel: true,
  selectionLabel: true,
  selectionStatsText: true,
  selectedColumnsText: true,
  selectionStats: true,
  hasGlobalFilter: true,
  globalFilterPreview: true,
  activeColumnFilterCount: true,
  hasAnyFilter: true,
  hasSorting: true,
  sortedColumnLabel: true,
} satisfies Record<keyof SpreadsheetGridDerivedSummary, true>) as (keyof SpreadsheetGridDerivedSummary)[];

// シェルの本体です。機能セット(features)は createSpreadsheetGrid が渡します(全部入りは下の SpreadsheetGrid)。
export function GridShell<T extends object>(props: SpreadsheetGridProps<T>, features: SolidGridFeatures): JSX.Element {
  // 追加(段 3-5): サーバーでは、行を空にした骨組み(ハイドレーションする)を隠し、そのすぐ後に行を入れた写し(ハイドレーション
  //   しない)を描きます(primitives/serverSnapshot)。サーバーサイドの行モデル(dataSource)はサーバーで行を読まないので写さない。
  const serverSnapshot = isServer && untrack(() => props.dataSource == null);
  // 追加(0.1.0 の前の実アプリ点検 S5-01): 本体の間だけ、描き終わった後の最初の処理の登録先をこのグリッドの待ち行列にします。
  const mountGate = createMountGate();
  const frame = runInMountGate(mountGate, () => GridShellBody(props, features, mountGate, serverSnapshot ? 'hiddenFrame' : 'normal'));
  // NoHydration はクライアントでも同じ位置に置く(利用者の部品の中の id の並びをサーバーとそろえる)。クライアントでは何も描かない。
  const snapshot = (
    <NoHydration>
      {serverSnapshot
        ? (() => {
            const snapshotGate = createMountGate();
            return runInMountGate(snapshotGate, () => GridShellBody(createSnapshotProps(props), features, snapshotGate, 'snapshot'));
          })()
        : null}
    </NoHydration>
  );
  return [frame, snapshot] as unknown as JSX.Element;
}

// 'normal' = ふつうの描画 / 'hiddenFrame' = サーバーで隠して描く骨組み / 'snapshot' = サーバーだけで描く行を入れた写し(段 3-5)。
type GridShellMode = 'normal' | 'hiddenFrame' | 'snapshot';

function GridShellBody<T extends object>(
  props: SpreadsheetGridProps<T>,
  features: SolidGridFeatures,
  mountGate: MountGate,
  mode: GridShellMode,
): JSX.Element {
  // ── props(既定値つきの読み取り。本体では読まず、関数 / memo の中で読む。既定値は React 版の GridShell と同じ) ──
  // サーバーサイドの行モデル(機能 features/serverSide。dataSource を渡したとき。無い構成では createSpreadsheetGrid が
  //   dataSource を外すので clientSide)。dataSource があるときは rows を空として扱う(ドキュメントどおり「無視」。React 版と同じ)。
  const serverSideFeature = features.serverSide;
  const isServerSide = createMemo(() => props.dataSource != null);
  // 利用側の通知は、グリッドの書き込みとは別のフレームで呼ぶ(primitives/userCallback。段階 4 の測り直し S4-21)。
  const { wrap: inOwnTick, call: callInOwnTick } = createUserCallbacks();
  // 変更(段階 4 の測り直し S4-21 / S5-21): rows は effect で写した値を読みます。Solid 2.0 では、利用者が通知の中で rows を
  //   書いて action を始めると(ふつうの signal + action で保存する形)、その rows は action が終わるまで保留され、行を非同期の
  //   createMemo で持つと、取り直しの間は保留中になります。グリッドの計算が props.rows を直接読むと、それを読む計算が全部
  //   待たされ、グリッドが止まっていました(画面は古いまま、保存中の 2 回目の編集が前の行へ入った・取り直しの間はスクロールも
  //   アクティブセルも動かなかった)。React 版では setRows はすぐ描かれ、取り直しの間(use + transition)も前の行のまま
  //   操作できます。それに合わせ、effect が latest()(保留中でも今の値)で読んで写し、グリッドはその写しを読みます。effect の
  //   中の書き込みは利用者の取引に入らないので、グリッドは止まりません。写す前(最初の値が届くまで)は props.rows をそのまま
  //   読みます(<Loading> の中で最初の行を待つ形と、サーバーで描くときはこれまでどおり)。
  // 変更(段階 4 の測り直し S8-01 / S2-22): サーバーで描くときと、クライアントのハイドレーションの間は、行を空として描き、
  //   描き終わった後(onGridMounted)に行へ切り替えます。Solid のハイドレーションはサーバーの要素をそのまま使い、クライアントで
  //   違う値になった文字・属性・行を直さないので、サーバーとブラウザでタイムゾーンや今日が違うと(日付の条件・Date の値の
  //   書式)、固定列に別の行の文字が残り、そのセルの編集が別の行に入り、件数もサーバーのまま残っていました。React 版は
  //   食い違いをクライアントで描き直して直します。行に依らない骨組み(見出し・上下のバーの条件の表示)だけをサーバーで描き、
  //   行・件数・合計は、切り替えた後のふつうの描画で出します(どちらの側でも同じ結果になる)。サーバーで描かない描き方では
  //   最初から true です。最初に登録するので、コントローラの最初の update より前に切り替えの書き込みが入ります。
  // 変更(段 3-5): サーバーは、この骨組みを隠して、すぐ後に行を入れた写し(mode 'snapshot'。サーバーだけ)を描きます。
  //   ブラウザでは描き終わった後の最初に写しを外して骨組みを見せ(primitives/serverSnapshot)、行へ切り替えます。
  const [hydrated, setHydrated] = createSignal(mode === 'snapshot' || (!isServer && !isHydrating()), { name: 'hydrated' });
  if (!untrack(hydrated)) {
    onGridMounted(() => {
      // 利用者が style で渡した display はサーバーで display: none に上書きしているので、見せるときに戻す(段 3-9 のレビュー)。
      revealServerFrame(gridRootRef.current?.parentElement, untrack(() => rootStyle().display));
      setHydrated(true);
    });
  }
  const [relayedRows, setRelayedRows] = createSignal<{ value: T[] | undefined } | null>(null);
  createEffect(
    () => latest(() => props.rows) as T[] | undefined,
    {
      effect: (value) => {
        setRelayedRows({ value });
      },
      // 行の読み込みの失敗(非同期の memo の取り直しの失敗など)は、利用側の <Errored> へそのまま渡します(段階 4 の測り直し
      //   S7-02。行を JSX で読んだときと同じ。受けないと、effect ごとに同じエラーが console へ出ていた)。
      error: (error) => {
        throw error;
      },
    },
    { name: 'relayRows' },
  );
  // 変更(段 3-2 / S1-01): store(createStore)の rows は、グリッドの計算にプロキシではなく中身を渡します(primitives/storeRows)。
  const plainRows = createPlainRows<T>(() => {
    const relayed = relayedRows();
    return (relayed ? relayed.value : props.rows) as readonly T[] | undefined;
  });
  const rows = createMemo(() => {
    if (props.dataSource != null || !hydrated()) {
      return EMPTY_ROWS as T[];
    }
    return (plainRows() ?? EMPTY_ROWS) as T[];
  });
  const columns = createMemo(() => props.columns as unknown as UnboundGridColumn<T>[]);
  const density = () => props.density ?? 'standard';
  const rowHeight = () => props.rowHeight ?? GRID_DENSITY_DIMENSIONS[density()].rowHeight;
  // 列見出しの行の高さ。本体の上端(headerHeight)は列見出し + 上の固定行(下の「合計行と固定行」)。
  const columnHeaderHeight = () => props.headerHeight ?? GRID_DENSITY_DIMENSIONS[density()].headerHeight;
  const rowHeaderWidth = () => props.rowHeaderWidth ?? 56;
  const readOnly = () => props.readOnly ?? false;
  const enableRangeSelection = () => props.enableRangeSelection ?? true;
  const enableSorting = () => props.enableSorting ?? true;
  // 手動ソート / 手動フィルター: 並びと状態の通知はそのままで、行の並べ替え / 絞り込みはしない(利用側が rows を並べて渡す)。
  const manualSorting = () => props.manualSorting ?? false;
  const manualFiltering = () => props.manualFiltering ?? false;
  // グローバルフィルター(上部バーの検索欄)と列フィルター(機能 features/filtering。無い構成では createSpreadsheetGrid が
  //   どちらも false にする)。
  const globalFilterEnabled = () => props.enableGlobalFilter ?? true;
  const columnFilterEnabled = () => props.enableColumnFilter ?? true;
  const enableRowHover = () => props.enableRowHover ?? true;
  const enableColumnResize = () => props.enableColumnResize ?? true;
  // サーバーサイドは対象外(React 版と同じ)。
  const activeRowFollowEnabled = () => (props.activeCellFollows ?? 'position') === 'row' && !isServerSide();
  // 行の選択(チェックボックス)。全選択の既定は enableRowSelection && multiple(React 版と同じ)。
  const enableRowSelection = () => props.enableRowSelection ?? false;
  const rowSelectionMode = () => props.rowSelectionMode ?? 'multiple';
  const enableSelectAllRows = () =>
    props.enableSelectAllRows ?? (enableRowSelection() && rowSelectionMode() === 'multiple');
  // 展開行(Master/Detail)。detailRow の指定が無ければ機能は休眠します。
  // memo(renderCell の ctx.detail の getter が読むので、props がまとめて新しくなったとき(スプレッドで渡す書き方)に、
  //   値が同じでもそれを本体で読むセルを作り直さないように)。
  const detailRowEnabled = createMemo(() => props.detailRow != null);
  const detailToggleColumnActive = () => props.detailRow != null && props.detailRow.showToggleColumn !== false;
  const columnInputs = () => ({
    columns: columns(),
    isServerSide: isServerSide(),
    // 行ドラッグ(機能 rowDrag)。機能が無い構成では createSpreadsheetGrid が false にする。
    enableRowDrag: props.enableRowDrag ?? false,
    hasRowsChange: props.onRowsChange != null,
    detailToggleColumnActive: detailToggleColumnActive(),
    renderDetailToggleCell: renderDetailToggleCell as unknown as NonNullable<UnboundGridColumn<T>['renderCell']>,
  });

  // ── 文言(既定の表に、機能セットの各機能の文言の既定を重ねる。React 版と同じ) ──
  const resolveLocaleText = createLocaleTextResolver(mergeFeatureLocaleDefaults(features));
  const localeTexts = createMemo(() => resolveLocaleText(props.localeText));

  // ── 合計行と固定行(機能。無ければ高さ 0 = 今までどおり) ──
  //   合計行は列の aggFunc をフィルター後のデータ行で集計し、表の下端に sticky で固定する。固定行は表示だけの行(選択 / 編集 /
  //   キー操作に入らない)。本体の上端(headerHeight)は列見出し + 上の固定行、下端に固定する高さ(footerHeight)は下の固定行 +
  //   合計行として、今までの幾何(スクロール / 行を見せる位置 / ヒットテスト / 選択の枠)へそのまま通す(React 版と同じ)。
  const totalRowFeature = features.totalRow;
  const TotalRow = totalRowFeature?.TotalRow;
  const PinnedRows = features.pinnedRows?.PinnedRows;
  const totalRowOptions = createMemo(() =>
    typeof props.totalRow === 'object' && props.totalRow !== null ? props.totalRow : null,
  );
  const totalRowEnabled = createMemo(
    () => (props.totalRow === true || totalRowOptions() !== null) && totalRowFeature !== undefined,
  );
  const totalRowLabel = () => totalRowOptions()?.label ?? localeTexts().totalRowLabel;
  const totalRowHeight = createMemo(() => (totalRowEnabled() ? Math.max(0, totalRowOptions()?.height ?? rowHeight()) : 0));
  const pinnedTop = createMemo(() =>
    PinnedRows && props.pinnedTopRows && props.pinnedTopRows.length > 0 ? props.pinnedTopRows : null,
  );
  const pinnedBottom = createMemo(() =>
    PinnedRows && props.pinnedBottomRows && props.pinnedBottomRows.length > 0 ? props.pinnedBottomRows : null,
  );
  const pinnedTopCount = () => pinnedTop()?.length ?? 0;
  const pinnedBottomCount = () => pinnedBottom()?.length ?? 0;
  const headerHeight = createMemo(() => columnHeaderHeight() + pinnedTopCount() * rowHeight());
  const footerHeight = createMemo(() => totalRowHeight() + pinnedBottomCount() * rowHeight());
  // 下の固定行を合計行の下に置く('belowTotal')。合計行が無ければいつもどおり。高さは同じで、並び(描く順・sticky の bottom・
  //   aria-rowindex・エクスポート)だけ変わる。
  const pinnedBelowTotal = createMemo(
    () => props.pinnedBottomRowsPlacement === 'belowTotal' && pinnedBottom() !== null && totalRowEnabled(),
  );
  // ドラッグのヒットテストと上の自動スクロールの帯に渡す、上端に固定する高さ(上の固定行があるときだけ)。
  const stickyTopHeight = () => (pinnedTopCount() > 0 ? headerHeight() : 0);

  // ── エンジン(1 回だけ作る) ──
  const engine = createGridEngine<T>({
    features,
    initialState: untrack(() => props.initialState),
    columnInputs: untrack(columnInputs),
    serverSide: {
      isServerSide: untrack(isServerSide),
      enableGlobalFilter: untrack(globalFilterEnabled),
      enableColumnFilter: untrack(columnFilterEnabled),
      enableSorting: untrack(enableSorting),
    },
  });
  onCleanup(() => engine.dispose());
  const store = engine.store;
  const dispatch = store.dispatch;
  const { state: ui, view } = createGridStoreSignals(store);
  // view スライスの大きさとスクロールの位置は値ごとの memo で読みます(view() はホバーやスクロールのたびに新しいオブジェクトに
  //   なるので、そのまま読むとペインの幅の計算や縦のレイアウトがホバーのたびに走り直し、見えているすべてのセルの effect まで
  //   走っていた。React 版の useMemo の依存と同じ)。
  const viewportWidth = createMemo(() => view().viewportWidth);
  const viewportHeight = createMemo(() => view().viewportHeight);
  const viewScrollTop = createMemo(() => view().scrollTop);
  const viewSetters = createGridViewSetters(store);
  const { setHoveredColumnIndex, setIsCornerHovered, setEditorInitialValue } = viewSetters;

  // ── DOM の参照(コントローラは { current } を受ける) ──
  const gridRootRef: MutableRef<HTMLDivElement | null> = { current: null };
  const scrollContainerRef: MutableRef<HTMLDivElement | null> = { current: null };
  const bodyScrollRef: MutableRef<HTMLDivElement | null> = { current: null };
  const leftPaneScrollRef: MutableRef<HTMLDivElement | null> = { current: null };
  const rightPaneScrollRef: MutableRef<HTMLDivElement | null> = { current: null };
  const tableExitRef: MutableRef<HTMLSpanElement | null> = { current: null };
  const pointerClientRef: MutableRef<{ x: number; y: number } | null> = { current: null };
  const autoScrollFrameRef: MutableRef<number | null> = { current: null };
  const editorActionGuardRef: MutableRef<boolean> = { current: false };
  const cellDoubleClickRef: MutableRef<(cell: CellCoord, event: MouseEvent) => void> = { current: noop };

  // ── ポップアップの置き場(ツールチップ / エディタのポップアップ。core utils/popupContainer) ──
  //   開いたとき(イベントや部品の本体)に 1 回読んで決めるものなので追跡しない(部品の本体で props を読むと Solid 2.0 の開発時の
  //   警告 STRICT_READ_UNTRACKED になる。別視点のレビュー)。
  const getPopupContainer = () =>
    resolvePopupContainer(
      gridRootRef.current,
      untrack(() => props.popupContainer) ?? 'auto',
    );
  // エディタのポップアップへ渡す文脈(トークンを写す元 = シェル、描く場所)。
  const portalContext = { source: () => gridRootRef.current, container: getPopupContainer };
  onGridMounted(() => {
    const shell = gridRootRef.current;
    return registerPopupContainer([shell, shell?.closest('.ssg-root')], getPopupContainer);
  });

  // ── 列 ──
  const columnResolution = createMemo(() => engine.resolveColumns(columnInputs()));
  const visibleColumns = () => columnResolution().visibleColumns;
  const orderedColumns = () => columnResolution().orderedColumns;
  // 行のグループ化(機能 features/grouping。無い構成では列の解決がいつも無効にする)。rowGroup の列(columns の順 = 階層の順)と
  //   aggFunc の列は全列の定義から(表示の影響を受けない)。
  const rowGroupingActive = () => columnResolution().rowGroupingActive;
  const groupColumns = () => columnResolution().groupColumns;
  const aggColumns = () => columnResolution().aggColumns;
  // グループ化している間のグループ元の列(表示から外れているが、絞り込み / 並び替え / 検索の対象)。していなければ空。
  const activeGroupColumns = createMemo((): UnboundGridColumn<T>[] => (rowGroupingActive() ? groupColumns() : NO_COLUMNS));
  const resolvedRowKeyGetter = createMemo(() => props.rowKeyGetter ?? ((_row: T, index: number) => index));
  const selectionSnapshot = createMemo(() => buildSelectionSnapshot(ui().selection));
  const paneResolution = createMemo(() =>
    engine.resolvePaneLayout({
      orderedColumns: orderedColumns(),
      columnWidths: ui().columnWidths,
      viewportWidth: viewportWidth(),
      rowHeaderWidth: rowHeaderWidth(),
    }),
  );
  const paneLayout = () => paneResolution().paneLayout;

  // 列の定義が変わったら列幅の状態を合わせる(React 版の useEffect と同じ。手で変えた幅は残す)。
  let previousColumnsForWidths: UnboundGridColumn<T>[] | null = null;
  //   変更(段 3-6): 書く値は前の列とグリッドの store の今の幅で決まる(primitives/effectApply)。
  createEffect(
    columns,
    outsideGraphApply((next: UnboundGridColumn<T>[]) => {
      dispatch(gridActions.reconcileColumnWidths(previousColumnsForWidths, next));
      previousColumnsForWidths = next;
    }),
    { name: 'reconcileColumnWidths' },
  );

  // ── ラベル行(機能 features/labelRow。無い構成では createSpreadsheetGrid が labelRow を外す) ──
  //   labelRow の各項目は値ごとの memo にする(labelRow のオブジェクトをインラインで渡しても各段が揺れない。React 版と同じ)。
  const labelRowFeature = features.labelRow;
  const labelIsLabelRow = createMemo(() => props.labelRow?.isLabelRow);
  const labelGetLabel = createMemo(() => props.labelRow?.getLabel);
  const labelRender = createMemo(() => props.labelRow?.render);
  const labelRowClassName = createMemo(() => props.labelRow?.className);
  const labelRowHeightOption = createMemo(() => props.labelRow?.height);
  const labelSortMode = createMemo(() => props.labelRow?.sortMode ?? 'section');
  const labelSticky = createMemo(() => props.labelRow?.sticky === true);
  const labelExportText = createMemo(() => props.labelRow?.exportText);
  const labelKeepEmptySections = createMemo(() => props.labelRow?.keepEmptySections ?? false);
  const labelRowEnabled = createMemo(
    () => labelIsLabelRow() != null && labelGetLabel() != null && labelRowFeature !== undefined,
  );
  const StickyLabelLayer = labelRowFeature?.StickyLabelLayer;

  // ── 行(clientSide だけ) ──
  // ラベル行の配置(rows / 述語が変わったときだけ 1 パス)。
  //   サーバーサイドでは rows が空なので見ない(ラベル行は行モデルのラッパが述語で見分ける。下の rowModel)。
  const labelLayout = createMemo(() =>
    engine.rowPipeline.resolveLabelRowLayout(rows(), isServerSide() ? undefined : labelIsLabelRow()),
  );
  // 列フィルターの候補(set / textSet の rows からの自動収集)はデータ行だけから集める(ラベル行の値や、ラベル行の空の値による
  //   「(空白)」を混ぜない。React 版の DF-12)。ラベル行が無ければ rows のまま。
  const filterCandidateRows = createMemo(() => {
    const layout = labelLayout();
    const currentRows = rows();
    if (!layout) {
      return currentRows;
    }
    const labels = layout.labelIndexes;
    const dataRows: T[] = [];
    let next = 0;
    for (let index = 0; index < currentRows.length; index += 1) {
      if (next < labels.length && labels[next] === index) {
        next += 1;
        continue;
      }
      dataRows.push(currentRows[index] as T);
    }
    return dataRows;
  });
  // ラベル行があるときはラベル行を除いた恒等の並び(データ行だけ)。
  const baseOrder = createMemo(() => engine.rowPipeline.resolveBaseOrder(rows().length, labelLayout()));
  // フィルター(機能 features/filtering)。グローバルフィルターの適用(大きな表は時間分割)と相対日付プリセットの基準日。
  //   列フィルターの段は行パイプライン(エンジンが機能から作る)が掛ける。無い構成では恒等の並びのまま(React 版と同じ)。
  const globalFilterText = createMemo(() => selectGlobalFilter(ui()));
  const columnFilters = createMemo(() => ui().filters.columnFilters);
  const filterSortColumns = createMemo(() => columnResolution().filterSortColumns);
  // グローバルフィルターの対象の列。グループ化している間はグループ元の列(自動グループ列に値が出ている列)も含める(React 版の
  //   DU-05。グループ化した「関東」で探して 0 件にならない)。
  const globalFilterColumns = createMemo(() => {
    const groups = activeGroupColumns();
    return groups.length > 0 ? [...visibleColumns(), ...groups] : visibleColumns();
  });
  const filterOrder =
    features.filtering?.createFilterOrder<T>({
      rows,
      baseOrder,
      visibleColumns: globalFilterColumns,
      // 相対日付プリセットの範囲の解決は、フィルター / ソートの対象の列(非表示列を含む)で見る(React 版と同じ)。
      effectiveColumns: filterSortColumns,
      globalFilterText,
      globalFilterMatch: () => props.globalFilterMatch ?? 'value',
      globalFilterEnabled,
      columnFilterEnabled,
      columnFilters,
      manualFiltering,
      isServerSide,
      dateRollover: engine.dateRollover,
    }) ?? null;
  const filteringAvailable = filterOrder !== null;
  const globalFilteredOrder = filterOrder ? filterOrder.globalFilteredOrder : baseOrder;
  const globalFilterStatus = filterOrder ? filterOrder.globalFilterStatus : () => 'idle' as const;
  const globalFilterProgress = filterOrder ? filterOrder.globalFilterProgress : () => 1;
  const relativeDateKey = filterOrder ? filterOrder.relativeDateKey : () => '';
  const orderResolution = createMemo(() =>
    engine.rowPipeline.resolveOrder({
      rows: rows(),
      labelLayout: labelLayout(),
      filterSortColumns: filterSortColumns(),
      columnFilters: columnFilters(),
      globalFilteredOrder: globalFilteredOrder(),
      sort: ui().sort,
      rowDragAvailable: columnResolution().rowDragAvailable,
      manualFiltering: manualFiltering(),
      manualSorting: manualSorting(),
      relativeDateKey: relativeDateKey(),
    }),
  );
  // 手動フィルターで rows が 0 件のとき、フィルターが載っていれば「一致する行がありません」を出す(絞り込みは外部で済んで
  //   いるため、rows.length === 0 だけでは区別できない。React 版と同じ)。
  const filterConditionsActive = () =>
    globalFilterText().trim().length > 0 || Object.keys(columnFilters()).length > 0;
  const manualFilterActive = () => manualFiltering() && filterConditionsActive();
  // 行ドラッグの合成列があるか(ガイド線を描くか)と、いま動かせるか(表示順が rows の順のとき = ソート / フィルターなし)。
  const rowDragAvailable = () => columnResolution().rowDragAvailable;
  const rowDragOperable = () => orderResolution().rowDragOperable;
  const clientRowModel = createMemo(() =>
    engine.rowPipeline.resolveClientSideRowModel({
      rows: rows(),
      order: orderResolution().order,
      rowGroupingActive: rowGroupingActive(),
      labelLayout: labelLayout(),
      labelSortMode: labelSortMode(),
      keepEmptySections: labelKeepEmptySections(),
      getLabel: labelGetLabel(),
      groupColumns: groupColumns(),
      aggColumns: aggColumns(),
      collapsedGroupKeys: ui().collapsedGroupKeys,
      rowKeyGetter: resolvedRowKeyGetter(),
      sort: ui().sort,
      // 手動ソートでは並べ替えていない(グループ / ラベル行の並びも同じ。React 版と同じ)。
      sortActive: !manualSorting() && ui().sort.length > 0,
      manualSorting: manualSorting(),
    }),
  );
  // ── サーバーサイドの行モデル(機能 features/serverSide) ──
  //   並び / 列フィルター / グローバルフィルターの状態から query を組み立て、debounce した query と安定したキーを行モデルの
  //   コントローラへ渡す(入力欄の文字はすぐ状態へ入り、サーバーへ送るのは打ち終わってから。React 版と同じ)。clientSide では
  //   空の query のまま。
  const liveServerSideQuery = createMemo(() =>
    engine.rowPipeline.resolveServerSideQuery({
      isServerSide: isServerSide(),
      globalFilterEnabled: globalFilterEnabled(),
      globalText: globalFilterText(),
      columnFilterEnabled: columnFilterEnabled(),
      columnFilters: columnFilters(),
      sortingEnabled: enableSorting(),
      sort: ui().sort,
      relativeDateKey: relativeDateKey(),
    }),
  );
  connectController(
    engine.serverSideQueryStore,
    () => ({ value: liveServerSideQuery(), enabled: isServerSide() }),
    'render',
    'serverSideQueryStore',
  );
  const serverSideQuerySnapshot = createExternalStoreSignal(engine.serverSideQueryStore, 'serverSideQueryStore');
  const serverSideQueryKey = createMemo(() => serverSideQuerySnapshot().queryKey);
  const serverSide = serverSideFeature?.createServerSide<T>(() => ({
    dataSource: props.dataSource,
    rowKeyGetter: resolvedRowKeyGetter(),
    query: serverSideQuerySnapshot().query,
    queryKey: serverSideQuerySnapshot().queryKey,
    refreshToken: props.serverSideRefreshToken,
    onLoadError: inOwnTick(props.onServerSideLoadError),
    onWriteError: inOwnTick(props.onServerSideWriteError),
    // 書き戻しのセル単位の保存状態(pending → ok | failed)を saveStatusController へ。
    onWriteStateChange: engine.saveStatus.handle,
  }));
  // 以降はすべてこの行モデル越しに読む。サーバーサイドでラベル行を使うときは述語のラッパ(ラベル行では getRow が undefined、
  //   getLabelRow が記述子)を被せる(React 版と同じ)。
  const rowModel = createMemo(() => {
    if (!isServerSide() || !serverSide) {
      return clientRowModel().rowModel;
    }
    const base = serverSide.rowModel();
    const isLabelRow = labelIsLabelRow();
    const getLabel = labelGetLabel();
    return isLabelRow && getLabel && labelRowFeature
      ? labelRowFeature.wrapRowModelWithLabelRows(base, isLabelRow, getLabel)
      : base;
  });
  // 編集できるか: サーバーサイドで書き戻し先(dataSource.updateRows)が無い間は、すべてのセルを編集できない(書き戻せない編集を
  //   開かせない。編集の始まり方のすべてと、セルの readOnly の表示がここでそろう。React 版と同じ)。
  const canEditCell = createMemo(() =>
    isServerSide() && !(serverSide?.canUpdateRows() ?? false) ? NEVER_EDITABLE : props.canEditCell,
  );
  // サーバーサイドのセルの書き込み口(書き戻し先があるときだけ。編集 / 貼り付け / 消去 / チェックボックスは rows を作り直す代わりに
  //   ここへ書く。楽観更新・ロールバック・失敗の通知はコントローラ)。
  const applyServerSideCellEdits = createMemo(() =>
    isServerSide() && serverSide?.canUpdateRows() ? serverSide.applyCellEdits : undefined,
  );
  const viewRowCount = createMemo(() => rowModel().getRowCount());
  const viewColCount = () => orderedColumns().length;
  const order = () => orderResolution().order;
  // グループのツリー(命令的 API の一括の開閉 / getGroupRows。グループ化していなければ null)と、グループ行を除くデータ行の数
  //   (行の選択の件数 / バーの件数。表示行の数 viewRowCount はグループ行込みで、仮想化・ヒットテスト・キー操作の範囲はそちら)。
  const groupTree = () => clientRowModel().groupTree;
  // ラベル行の表示順(ラベル行の view index の並びなど。ラベル行が無い / グループ化しているときは null)。
  const labelDisplay = () => clientRowModel().labelDisplay;
  const labelViewIndexes = createMemo(() => labelDisplay()?.labelViewIndexes);
  const leafRowCount = createMemo(() =>
    clientRowModel().groupedDisplay || clientRowModel().labelDisplay ? order().length : viewRowCount(),
  );
  // グループ行の開閉(開閉のボタン / 行のダブルクリック / アクティブセルの Enter・Space)。
  const handleGroupToggle = (groupKey: string) => dispatch(gridActions.toggleGroupCollapsed(groupKey));
  const groupingFeature = features.grouping;
  // 表示順(配列)が変わったときだけ作り直す(orderResolution は ui() を読むので、アクティブセルが動くたびに計算し直す。
  //   中の order の配列は同じなので、その参照で受ける。段 3-4 / S5-22)。
  const orderArray = createMemo(() => order());
  const getFilteredRows = createMemo(() => {
    const currentOrder = orderArray();
    const currentRows = rows();
    let cache: T[] | null = null;
    return () => (cache ??= Array.from(currentOrder, (sourceIndex) => currentRows[sourceIndex] as T));
  });

  // 表示行数 / 列数が減ったら選択を範囲内へ詰める(React 版の useEffect と同じ)。
  //   変更(段 3-6): 詰めた選択はグリッドの store の今の選択で決まる(reducer が読む。primitives/effectApply)。
  createEffect(
    () => [viewRowCount(), viewColCount()] as const,
    outsideGraphApply(([rowCount, colCount]: readonly [number, number]) => {
      dispatch(gridActions.clampSelectionToRowCount(rowCount, colCount));
    }),
    { name: 'clampSelectionToRowCount' },
  );

  // ── 縦のレイアウト(行の仮想化は core が計算する) ──
  //   auto-height(行の高さの実測)は機能(features.autoHeight)。無い構成では createSpreadsheetGrid が autoHeight を
  //   false にし、エンジンの実測は代役(測らない)、縦のレイアウトも auto-height を使わない(React 版と同じ)。
  //   実測の version(prefix の更新)/ nonce(中身の変化)を購読して、縦のレイアウトの計算し直しと測り直しのきっかけにします。
  const autoHeightSnapshot = createExternalStoreSignal(engine.autoHeightMeasurer, 'autoHeightStore');
  const vertical = createMemo(() =>
    engine.resolveVerticalLayout({
      isServerSide: isServerSide(),
      autoHeight: props.autoHeight ?? false,
      visibleColumns: visibleColumns(),
      viewRowCount: viewRowCount(),
      estimateRowHeight: props.estimateRowHeight ?? rowHeight(),
      rowHeight: rowHeight(),
      headerHeight: headerHeight(),
      viewportHeight: viewportHeight(),
      scrollTop: viewScrollTop(),
      rowModel: rowModel(),
      measuredHeights: engine.autoHeightMeasurer.measuredHeights,
      autoHeightVersion: autoHeightSnapshot().version,
      detailRowEnabled: detailRowEnabled(),
      expandedDetailRowKeys: ui().expandedDetailRowKeys,
      detailHeight: props.detailRow?.height ?? DEFAULT_DETAIL_ROW_HEIGHT,
      detailIsExpandable: props.detailRow?.isExpandable,
      detailIndexCacheRef: engine.detailIndexCache,
      labelDisplay: labelDisplay(),
      labelRowHeight: labelRowHeightOption(),
    }),
  );
  // 開発時の警告(React 版の GridShell.tsx と同じ条件と文言。本番では何もしない)。
  createShellDevWarnings({
    filteringAvailable: features.filtering !== undefined,
    isServerSide,
    groupColumnCount: () => groupColumns().length,
    rowGroupingActive,
    labelRowEnabled,
    autoHeight: () => props.autoHeight ?? false,
    hasAutoHeightColumn: () => vertical().hasAutoHeightColumn,
    viewRowCount,
    detailRowEnabled,
    detailExtraCount: () => vertical().detailExtras.length,
    detailActive: () => vertical().detailActive,
    globalFilterText,
    columnFilterCount: () => Object.keys(columnFilters()).length,
  });
  // ラベル行の縦スクロールの固定(labelRow.sticky)。scrollTop(論理)から今のセクションのラベル行と押し上げる量を求めて、各ペインの
  //   固定の層へ渡します。固定の帯がヘッダーの直下で行を隠す高さ(stickyTopInset)は、アクティブセルの追従と scrollToRow /
  //   scrollToCell が上へ見せる行を帯の裏に置かないために使います(React 版と同じ)。
  const stickyLabelIndexes = createMemo(() => {
    const indexes = labelViewIndexes();
    return labelSticky() && labelRowFeature && indexes && indexes.length > 0 ? indexes : null;
  });
  const stickyLabelEntry = createMemo((): GridStickyLabelEntry<T> | null => {
    const indexes = stickyLabelIndexes();
    if (!indexes || !labelRowFeature) {
      return null;
    }
    const resolution = labelRowFeature.resolveStickyLabel(
      indexes,
      vertical().rowMetrics,
      physicalToLogicalScrollTop(viewScrollTop(), vertical().verticalScaleFactor),
    );
    if (!resolution) {
      return null;
    }
    const model = rowModel();
    const descriptor = model.getLabelRow?.(resolution.labelViewIndex);
    if (!descriptor) {
      return null;
    }
    return {
      labelRow: descriptor,
      rowIndex: resolution.labelViewIndex,
      rowKey: model.getRowKey(resolution.labelViewIndex) ?? resolution.labelViewIndex,
      height: resolution.height,
      pushOffset: resolution.pushOffset,
    };
  });
  const stickyTopInset = createMemo((): StickyTopInset | undefined => {
    const indexes = stickyLabelIndexes();
    const feature = labelRowFeature;
    if (!indexes || !feature) {
      return undefined;
    }
    const rowMetrics = vertical().rowMetrics;
    return {
      visibleAt: (logicalScrollTop) => {
        const resolution = feature.resolveStickyLabel(indexes, rowMetrics, logicalScrollTop);
        return resolution ? Math.max(resolution.height - resolution.pushOffset, 0) : 0;
      },
      // 上端が rowTop の行を可視域の先頭に置いたときの帯(その行が属するセクションのラベル。行がラベル行なら無し)。
      coveringRowAt: (rowTop) => feature.resolveStickyLabel(indexes, rowMetrics, rowTop)?.height ?? 0,
    };
  });
  // 条件付き書式の機能(機能セットは作ったときに決まる)と、列ごとの min / max(ビューの行から。中身が同じなら同じ参照)。
  const conditionalFormatFeature = features.conditionalFormat;
  const conditionalFormatStats = createMemo(() => engine.resolveConditionalFormatStats(rowModel(), orderedColumns()));
  // 合計行のセルの値(フィルター後のデータ行 = order から集計)と見出しを出す列。中身が同じなら同じ参照(React 版と同じ)。
  const totalRowCells = createMemo(() =>
    totalRowEnabled()
      ? engine.resolveTotalRowCells({
          rows: rows(),
          // サーバーサイドは values だけ(rows が無いので集計しない。React 版と同じ)。
          order: isServerSide() ? null : order(),
          columns: orderedColumns(),
          values: totalRowOptions()?.values,
        })
      : EMPTY_TOTAL_ROW_CELLS,
  );
  const totalRowLabelColumnKey = createMemo(() =>
    totalRowFeature ? totalRowFeature.resolveTotalRowLabelColumnKey(orderedColumns(), totalRowCells()) : null,
  );
  // ── 列幅の自動調整(機能 features/columnAutosize) ──
  //   計測の時間分割ランナー(core)。合計行の表示(値と見出し / 見出しを出す列はその文言)・状態チップの枠・固定行も幅に
  //   収めます(React 版と同じ)。機能セットに無ければ境界のダブルクリックは通常のリサイズ、autoSizeColumns は false 扱い。
  const columnAutosizeFeature = features.columnAutosize;
  const totalRowAutosizeTexts = createMemo(() => {
    if (!totalRowEnabled() || !totalRowFeature) {
      return undefined;
    }
    const { formatTotalRowCellText, resolveTotalRowCaption } = totalRowFeature;
    const cells = totalRowCells();
    const labelColumnKey = totalRowLabelColumnKey();
    const texts = new Map<string, AutosizeTotalRowText>();
    for (const column of orderedColumns()) {
      const cell = cells.get(column.key);
      if (cell) {
        const text = formatTotalRowCellText(column, cell);
        texts.set(column.key, { text, caption: text !== '' ? resolveTotalRowCaption(cell.kind, localeTexts()) : undefined });
      } else if (column.key === labelColumnKey) {
        texts.set(column.key, { text: totalRowLabel() });
      }
    }
    return texts;
  });
  const pinnedAutosizeRows = createMemo(() =>
    pinnedTop() || pinnedBottom() ? [...(pinnedTop() ?? []), ...(pinnedBottom() ?? [])] : undefined,
  );
  // 状態チップ(conditionalFormat.chips)のセルをチップの枠(余白とアイコン)ごと測るための中身。セルの描画と同じ文脈で
  //   チップを決めます(選択などの状態は false)。条件付き書式の機能が無ければ渡しません(文字だけを測る)。
  const autosizeChipOf = createMemo((): AutosizeChipOf<T> | undefined => {
    const chipFeature = conditionalFormatFeature;
    if (!chipFeature) {
      return undefined;
    }
    const model = rowModel();
    const columnsNow = orderedColumns();
    const keyGetter = resolvedRowKeyGetter();
    const topCount = pinnedTopCount();
    return (row, column, viewIndex) => {
      const chips = column.conditionalFormat?.chips;
      if (!chips) {
        return null;
      }
      const colIndex = columnsNow.findIndex((candidate) => candidate.key === column.key);
      const value = getCellValue(row, column);
      // 固定行は負の index(-1 - 上 + 下の通し番号)で来るので、本体の rowModel を引かず、描くときと同じ文脈(固定行の中の
      //   位置・行キー・pinned)を作ります。
      if (viewIndex < 0) {
        const pinnedIndex = -1 - viewIndex;
        const pinned = pinnedIndex < topCount ? 'top' : 'bottom';
        const index = pinned === 'top' ? pinnedIndex : pinnedIndex - topCount;
        const spec = chipFeature.resolveChipSpec<T>(chips, {
          row,
          rowIndex: index,
          sourceRowIndex: index,
          rowKey: keyGetter(row, index),
          colIndex,
          value,
          column,
          isActive: false,
          isSelected: false,
          isEditing: false,
          readOnly: true,
          pinned,
        });
        return spec ? { label: spec.label, icon: spec.icon !== false } : null;
      }
      const spec = chipFeature.resolveChipSpec<T>(chips, {
        row,
        rowIndex: viewIndex,
        sourceRowIndex: model.getSourceIndex(viewIndex) ?? viewIndex,
        rowKey: model.getRowKey(viewIndex) ?? viewIndex,
        colIndex,
        value,
        column,
        isActive: false,
        isSelected: false,
        isEditing: false,
        readOnly: false,
      });
      return spec ? { label: spec.label, icon: spec.icon !== false } : null;
    };
  });
  const columnAutosize = columnAutosizeFeature?.createColumnAutosize<T>(() => ({
    rowModel: rowModel(),
    gridRootRef,
    columnWidths: paneResolution().effectiveColumnWidths,
    dispatch,
    totalRowTexts: totalRowAutosizeTexts(),
    chipOf: autosizeChipOf(),
    pinnedRows: pinnedAutosizeRows(),
  }));
  const isAutosizing = () => columnAutosize?.isAutosizing() ?? false;
  // データを入れたときの列幅の自動調整(autoSizeColumns × rows の変化。core の宣言的なトリガー。React 版と同じくコミットの
  //   後 = 'effect' で測る)。
  connectController(
    engine.autoSizeOnData,
    () => ({
      mode: columnAutosize ? (props.autoSizeColumns ?? false) : false,
      isServerSide: isServerSide(),
      rows: rows(),
      visibleColumns: visibleColumns(),
      runAutosize: columnAutosize?.runAutosize ?? (() => Promise.resolve()),
      gridRootRef,
    }),
    'effect',
    'autoSizeOnData',
  );
  const totalRowSlotSignature = createMemo(() => serializeSlotValue(totalRowOptions()?.className));
  const totalRowSlot = createMemo(() => resolveSlotFromSignature<JSX.CSSProperties>(totalRowSlotSignature()));
  // エクスポートの includeTotalRow / includePinnedRows で出す行。
  const totalRowExport = createMemo(() =>
    totalRowEnabled() ? { cells: totalRowCells(), label: totalRowLabel() } : undefined,
  );
  const pinnedRowsExport = createMemo(() =>
    pinnedTop() || pinnedBottom()
      ? { top: pinnedTop() ?? [], bottom: pinnedBottom() ?? [], bottomAfterTotal: pinnedBelowTotal() }
      : undefined,
  );
  // スクロール位置インジケーター(機能 features/scrollHint。無い構成では常に null = ネイティブのスクロールバー)。表示行数が
  //   minRows 未満のあいだは待機(React 版と同じ)。
  const scrollHintFeature = features.scrollHint;
  const findFeature = features.find;
  const imeFeature = features.imeDirectInput;
  const resolvedScrollHint = createMemo(() =>
    scrollHintFeature ? scrollHintFeature.resolveScrollHintOptions<T, SolidGridTypes>(props.scrollHint) : null,
  );
  const activeScrollHint = createMemo(() => {
    const resolved = resolvedScrollHint();
    return resolved !== null && viewRowCount() >= resolved.minRows ? resolved : null;
  });
  const customScrollbar = createMemo(() => activeScrollHint()?.scrollbar === true);
  // auto-height が効いているか(真偽値だけの memo。すべてのセルが読むので、vertical の変化のたびに全セルを走らせない)。
  const autoHeightActive = createMemo(() => vertical().autoHeightActive);
  // 描く行(React 版の GridBodyLayer が virtualRowIndexes に無い行を飛ばすのと同じ)と、対応に使う rowKey。
  const bodyRows = createMemo((): GridBodyRowItem[] => {
    const { virtualRows, virtualRowIndexes } = vertical();
    const model = rowModel();
    const serverSideActive = isServerSide();
    const items: GridBodyRowItem[] = [];
    for (const virtualRow of virtualRows) {
      if (!virtualRowIndexes.has(virtualRow.index)) {
        continue;
      }
      // サーバーサイドでまだ届いていない行は読み込み中の行。キーはデータ行のキー(1 始まりの id など)とぶつからないよう
      //   名前空間を分ける(React 版と同じ `__ssg_skeleton__:<位置>`)。
      const skeleton =
        serverSideActive &&
        model.getRow(virtualRow.index) === undefined &&
        model.getLabelRow?.(virtualRow.index) === undefined;
      items.push({
        index: virtualRow.index,
        start: virtualRow.start,
        size: virtualRow.size,
        key: skeleton
          ? `__ssg_skeleton__:${virtualRow.index}`
          : String(model.getRowKey(virtualRow.index) ?? virtualRow.index),
        skeleton,
      });
    }
    return items;
  });

  // auto-height の測り方は core controllers/autoHeightMeasurer(描いたセルの器を測り、行高ストアへ入れ、上の行の高さが
  //   変わったら見ている行がずれないよう scrollTop を合わせる)。React 版はコミット後・描く前のレイアウト effect で update
  //   しますが、Solid では描画の段の effect が新しい行の DOM より先に走りうるので、DOM を書き終えた後の effect で呼びます
  //   (同じマイクロタスクの中 = 画面に出る前)。
  connectController(
    engine.autoHeightMeasurer,
    () => ({
      scrollContainerRef,
      autoHeightActive: vertical().autoHeightActive,
      minRowHeight: rowHeight(),
      rowHeightStore: vertical().rowHeightStore,
      rowMetrics: vertical().rowMetrics,
      rowModel: rowModel(),
      virtualRows: vertical().virtualRows,
      viewportHeight: view().viewportHeight,
      version: autoHeightSnapshot().version,
      nonce: autoHeightSnapshot().nonce,
    }),
    'effect',
    'autoHeightMeasurer',
  );

  // ── スクロールの同期(見える大きさ / scrollTop を view スライスへ) ──
  //   'effect' の時機で渡す(React 版のレイアウト effect と同じく DOM を書き終えた後)。合計行 / 下の固定行が出たり高くなったり
  //   したときの update は、末尾にいたら増えた後の scrollHeight で末尾へ留める(core の scrollSyncController)。render の時機
  //   だと DOM がまだ前の高さで、末尾から外れていた(段階 3-2)。
  connectController(engine.scrollSync, () => ({
    scrollContainerRef,
    setViewState: store.setViewState,
    onScroll: inOwnTick(props.onScroll),
    // 見える高さは下端に固定する行(合計行 / 下の固定行)に隠れるぶんを除く。
    footerHeight: footerHeight(),
  }), 'effect', 'scrollSync');

  // ── サーバーサイドの行モデルへの読み込みの依頼と、query が変わったときの後始末(React 版と同じ) ──
  //   query(debounce した queryKey)が変わったら先頭へスクロールを戻す(結果が総入れ替えになるので、同じ位置に別の行が来る
  //   違和感を避ける)。マウントのときは scrollTop がもう 0 なので何も変わらない。前に見たキーと比べ、本当に変わったときだけ。
  let lastServerSideQueryKey: string | null = null;
  createEffect(
    () => (isServerSide() ? serverSideQueryKey() : null),
    (key) => {
      if (key === null) {
        lastServerSideQueryKey = null;
        return;
      }
      const previousKey = lastServerSideQueryKey;
      lastServerSideQueryKey = key;
      if (previousKey === key) {
        return;
      }
      const element = scrollContainerRef.current;
      if (element) {
        element.scrollTop = 0;
      }
      // scroll イベントを待たずに view スライスも 0 へ(1 フレーム遅れないように)。
      store.setViewState({ scrollTop: 0 });
    },
    { name: 'serverSideQueryReset' },
  );
  // query が変わったら展開行をすべて閉じる(結果が総入れ替えになり、届いていない行があるのでキーから位置を探せず、古い位置の
  //   まま別の行の下にカードが残りうるため)。空から空は reducer が何もしない。
  let lastDetailQueryKey: string | null = null;
  createEffect(
    () => (isServerSide() && detailRowEnabled() ? serverSideQueryKey() : null),
    (key) => {
      if (key === null) {
        lastDetailQueryKey = null;
        return;
      }
      const previousKey = lastDetailQueryKey;
      lastDetailQueryKey = key;
      if (previousKey === key) {
        return;
      }
      engine.detailIndexCache.reset();
      dispatch(gridActions.setExpandedDetailRowKeys(new Set<GridRowKey>()));
    },
    { name: 'detailRowsQueryReset' },
  );
  // 描く窓(overscan 込み)の行を行モデルへ知らせる(届いていないブロックを読み込む。end は含まない)。queryKey も見るのは、
  //   query が変わってキャッシュを捨てた直後に窓が同じでも(先頭のまま件数も同じなど)読み込み直すため。
  const windowFirstRow = createMemo(() => vertical().windowFirstRow);
  const windowLastRow = createMemo(() => vertical().windowLastRow);
  createEffect(
    () => [isServerSide(), windowFirstRow(), windowLastRow(), serverSideQueryKey()] as const,
    ([serverSideActive, firstRow, lastRow]) => {
      if (!serverSideActive || !serverSide || lastRow < firstRow) {
        return;
      }
      serverSide.requestRange(firstRow, lastRow + 1);
    },
    { name: 'serverSideRequestRange' },
  );

  // ── 列の横の仮想化 ──
  const columnMeasurements = createMemo(() =>
    buildColumnMeasurements(visibleColumns(), paneResolution().effectiveColumnWidths),
  );
  // core の viewportSyncController は列の幅の表が変わると measure() を呼ぶ(React 版の描いた後の測り直し)。Solid 版は
  //   columnVirtualizer の items() の中で同じ流れで測り直すので、ここでは何もしない(primitives/columnVirtualizer の measureKey)。
  const measuredByColumnVirtualizer = { measure: () => {} };
  const centerEntries = () => paneLayout().center.entries;
  const columnVirtualizer = createColumnVirtualizer<HTMLDivElement>(() => {
    const entries = centerEntries();
    return {
      horizontal: true,
      count: entries.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: (index: number) => entries[index]?.paneLocalSize ?? entries[index]?.column.width ?? 120,
      overscan: 8,
      scrollMargin: paneResolution().leftPaneTotalWidth,
      // 列の幅が変わったら items() の中で測り直す(下の viewportSync には何もしない measure を渡す)。
      measureKey: columnMeasurements(),
    };
  });
  const centerRenderEntries = createMemo(() => {
    const entries = centerEntries();
    return columnVirtualizer
      .items()
      .map((item) => entries[item.index])
      .filter((entry): entry is PaneColumnEntry<T> => Boolean(entry));
  });
  // アクティブセルが描かれているか(core logic/cellPlacement。React 版と共用)。aria-activedescendant と、IME の入力受けを
  //   描かれたセルへ合わせ直す合図に使います。
  const activeCellRendered = createMemo(() =>
    isActiveCellRendered(ui().activeCell, vertical().virtualRowIndexes, rowModel(), [
      paneLayout().left.entries,
      centerRenderEntries(),
      paneLayout().right.entries,
    ]),
  );

  // ── モーション / 行の出入り(animateRows。React 版の engine.rowEnter と同じつなぎ) ──
  const prefersReducedMotion = createExternalStoreSignal(reducedMotionStore, 'reducedMotionStore');
  const resolvedMotion = () => resolveGridMotion(props.motion ?? 'auto', prefersReducedMotion());
  // 行の並び替えのアニメは auto-height(行の高さの実測で transform が動く)とサーバーサイド(ブロックが届くと行が差し替わる)では止める。
  //   サーバーサイドのスケルトンが本物の行へ差し替わったときは、モーションが on ならセルを上から順にフェードインする。
  const animateRowsActive = () =>
    (props.animateRows ?? true) && resolvedMotion() === 'on' && !autoHeightActive() && !isServerSide();
  connectController(engine.rowEnter, () => ({
    scrollContainerRef,
    skeletonEnter: isServerSide() && resolvedMotion() === 'on',
    mountEnter: animateRowsActive(),
  }), 'render', 'rowEnter');
  // 変わったセルのフラッシュ + 数値のトゥイーン(highlightChanges。機能 motionExtras。無い構成ではエンジンの代役で何もしない)。
  //   rows の参照が変わったとき、描いているセルのうち値が変わったものへ直付けする。コントローラは書き換わった DOM の文字を
  //   旧値へ戻してから補間するので、セルの文字を書き終えた後の effect で呼ぶ(React 版はコミット後のレイアウト effect)。
  //   サーバーサイドでは止める(React 版と同じ)。
  connectController(
    engine.changeHighlight,
    () => ({
      enabled: (props.highlightChanges ?? false) && !isServerSide() && resolvedMotion() === 'on',
      rows: rows(),
      rowKeyGetter: resolvedRowKeyGetter(),
      columns: visibleColumns(),
      scrollContainerRef,
    }),
    'effect',
    'changeHighlight',
  );
  // サーバーサイドの書き戻しのセル単位の保存状態(data-ssg-save + 保存中の印 + 失敗のチップ。showSaveStatus、既定 true)。
  //   状態はエンジンの saveStatus が行モデルの onWriteStateChange から受け、ここでは表示の有無と文言を渡す(React 版と同じ)。
  connectController(engine.saveStatus, () => ({
    scrollContainerRef,
    shellRef: gridRootRef,
    enabled: (props.showSaveStatus ?? true) && isServerSide(),
    failedText: localeTexts().saveFailedCell,
  }), 'render', 'saveStatus');

  // ── テーマ(OS の配色の外部 store も signal にする) ──
  const systemPrefersDark = createExternalStoreSignal(systemColorSchemeStore, 'systemColorSchemeStore');
  const themeClassName = () => resolveGridThemeClassName(props.theme ?? 'light', systemPrefersDark());
  const heightLayout = createMemo(() => resolveGridHeightLayout(props.height, props.maxHeight));

  // ── classNames(スロット)。中身の署名が同じなら同じ表(React 版の useResolvedGridSlots と同じ) ──
  const slotSignature = createMemo(() => serializeSlotValue(props.classNames));
  const slots = createMemo(() =>
    resolveSlotMapFromSignature<keyof GridClassNames, JSX.CSSProperties>(slotSignature()),
  );

  // ── アクティブセル / 編集中のセルの位置 ──
  //   位置の解決は core logic/cellPlacement(React 版と共用)。
  const activeCellPlacement = createMemo(() =>
    resolveCellPlacement(ui().activeCell, viewRowCount(), paneLayout(), vertical().rowMetrics),
  );
  const editingCellPlacement = createMemo(() =>
    resolveCellPlacement(ui().editingCell, viewRowCount(), paneLayout(), vertical().rowMetrics),
  );
  const editorAlignTop = createMemo(() => {
    const editing = ui().editingCell;
    const column = editing ? orderedColumns()[editing.col] : undefined;
    const placement = editingCellPlacement();
    return (
      column !== undefined &&
      placement !== null &&
      autoHeightActive() &&
      placement.rect.height > rowHeight() &&
      (column.verticalAlign ?? props.verticalAlign ?? (column.autoHeight === true ? 'top' : 'center')) === 'top'
    );
  });
  const selectionExtents = createMemo(() => resolveSelectionExtents(ui().selection, paneLayout(), viewRowCount()));
  const selectionBand = createMemo(() =>
    resolveSelectionBand(selectionExtents(), vertical().windowFirstRow, vertical().windowLastRow, vertical().rowMetrics),
  );
  // 展開行があるときは、選択の縦の帯を展開行の帯を避けた複数の矩形に分けます(無いときは 1 つ。React 版と同じ)。
  const selectionBandSegments = createMemo(() =>
    resolveSelectionBandSegments(
      vertical().detailActive,
      selectionExtents(),
      vertical().windowFirstRow,
      vertical().windowLastRow,
      vertical().rowMetrics,
      vertical().detailExtras,
    ),
  );
  const selectionRectsForPane = (pane: ColumnPane): (OverlayRect | null)[] =>
    resolvePaneSegmentRects(selectionExtents(), selectionBandSegments(), pane) ?? [
      resolvePaneBandRect(selectionExtents(), selectionBand(), pane),
    ];
  // コピー範囲の動く点線(showCopyRange。機能 motionExtras)。コピーした時点の見え方(ソート / フィルター / グループの開閉 /
  //   行数 / 列)と今を参照で比べ、変わっていれば描かない(React 版と同じ)。矩形の求め方は選択範囲と同じ。
  const motionExtrasFeature = features.motionExtras;
  const copiedSelection = createMemo(() => {
    const copied = view().copiedRange;
    if (!motionExtrasFeature || !(props.showCopyRange ?? true) || !copied) {
      return null;
    }
    const state = ui();
    return copied.view.sort === state.sort &&
      copied.view.filters === state.filters &&
      copied.view.collapsedGroupKeys === state.collapsedGroupKeys &&
      copied.view.viewRowCount === viewRowCount() &&
      copied.view.columns === orderedColumnKeys()
      ? copied.selection
      : null;
  });
  const copiedExtents = createMemo(() => resolveSelectionExtents(copiedSelection(), paneLayout(), viewRowCount()));
  const copiedBand = createMemo(() =>
    resolveSelectionBand(copiedExtents(), vertical().windowFirstRow, vertical().windowLastRow, vertical().rowMetrics),
  );
  const copiedBandSegments = createMemo(() =>
    resolveSelectionBandSegments(
      vertical().detailActive,
      copiedExtents(),
      vertical().windowFirstRow,
      vertical().windowLastRow,
      vertical().rowMetrics,
      vertical().detailExtras,
    ),
  );
  const copyRectsForPane = (pane: ColumnPane): OverlayRect[] => {
    if (copiedBandSegments()) {
      return resolvePaneSegmentRects(copiedExtents(), copiedBandSegments(), pane) ?? [];
    }
    const rect = resolvePaneBandRect(copiedExtents(), copiedBand(), pane);
    return rect ? [rect] : [];
  };
  // クロスヘア(hoverHighlight: 'cross'。機能 motionExtras。無い構成では 'row' に置き換わる): 本体のセルのホバーで列もホバーの
  //   列にし、その列の帯を描く(描いている窓の縦の範囲だけ)。
  const hoverCross = () => motionExtrasFeature !== undefined && props.hoverHighlight === 'cross';
  const columnHoverRectForPane = (pane: ColumnPane): OverlayRect | null =>
    hoverCross()
      ? resolveColumnHoverRect(
          view().hoveredColumnIndex,
          pane,
          paneLayout(),
          vertical().rowMetrics,
          vertical().windowFirstRow,
          vertical().windowLastRow,
        )
      : null;

  // ── ツールチップ(data-ssg-tooltip の委譲。core controllers/tooltipController) ──
  const gridDomId = createUniqueId();
  const activeCellDomId = `${gridDomId}-active-cell`;
  const cellEditorDomId = `${gridDomId}-cell-editor`;
  let tooltipController: TooltipController | null = null;
  onGridMounted(() => {
    const controller = acquireTooltipController(undefined, gridRootRef.current);
    tooltipController = controller;
    controller.setSlot(untrack(slots).tooltip);
    return () => {
      controller.dispose();
      tooltipController = null;
    };
  });
  createEffect(
    () => slots().tooltip,
    (slot) => {
      tooltipController?.setSlot(slot);
    },
    { name: 'tooltipSlot' },
  );
  // アクティブセルのツールチップ(エラー / メモ)。キーで動かしたときも出す(React 版と同じ条件)。
  const activeCellTooltipKey = createMemo(() => {
    const active = ui().activeCell;
    return active === null || ui().editingCell !== null ? null : `${active.row}:${active.col}`;
  });
  createEffect(activeCellTooltipKey, (key) => {
    if (key === null) {
      hideActiveCellTooltip(gridRootRef.current);
      return undefined;
    }
    return scheduleActiveCellTooltip(activeCellDomId, gridRootRef.current);
  }, { name: 'activeCellTooltip' });

  // ── ホバー ──
  connectController(engine.hoverRowNotifier, () => ({
    enableRowHover: enableRowHover(),
    isHoverControlled: props.hoveredRowIndex !== undefined,
    onHoveredRowChange: inOwnTick(props.onHoveredRowChange),
    setHoveredRowIndex: viewSetters.setHoveredRowIndex,
  }), 'render', 'hoverRowNotifier');
  const applyHoveredRowChange = engine.hoverRowNotifier.applyHoveredRowChange;
  const resolvedHoveredRowIndex = () =>
    !enableRowHover() ? null : props.hoveredRowIndex !== undefined ? props.hoveredRowIndex : view().hoveredRowIndex;

  // ── アクティブセルを動かしたときに見える範囲へスクロール(core の viewportSyncController) ──
  const viewportSync = createViewportSyncController<T>();
  const scaleAnchor = createScrollScaleAnchor();
  // 縮めたスクロールの率が変わったときに見ている行を保つ(core の createScrollScaleAnchor)。update の中でスクロールの上限を
  //   測ってスクロールを書くので、React 版のレイアウト effect と同じく DOM を書き終えた後の effect で渡す(段階 3-2)。
  //   React 版は描くたびに測り直すので、縦のレイアウトと見出し / 下端の固定行の高さが変わるたびに呼ぶ。
  connectController(
    {
      update: (verticalScaleFactor: number) => {
        scaleAnchor.update(scrollContainerRef.current, verticalScaleFactor, (scrollTop) => {
          engine.scrollSync.markApiScroll();
          store.setViewState({ scrollTop });
        });
      },
    },
    () => {
      headerHeight();
      footerHeight();
      return vertical().verticalScaleFactor;
    },
    'effect',
    'verticalScaleAnchor',
  );
  connectController(
    viewportSync,
    () => ({
      scrollElement: scrollContainerRef.current,
      columnVirtualizer: measuredByColumnVirtualizer,
      columnMeasurements: columnMeasurements(),
      totalScrollWidth: paneResolution().totalScrollWidth,
      physicalBodyHeight: vertical().physicalBodyHeight,
      headerHeight: headerHeight(),
      leftPaneWidth: paneResolution().leftPaneTotalWidth,
      rightPaneWidth: paneResolution().rightPaneTotalWidth,
      centerLeadingWidth: paneResolution().centerLeadingWidth,
      activeCellRect: activeCellPlacement()?.rect ?? null,
      isRowFollowMove: engine.activeRowFollow.isFollowMove,
      activeCellPinned: activeCellPlacement() !== null && activeCellPlacement()?.pane !== 'center',
      activeCell: ui().activeCell,
      verticalScaleFactor: vertical().verticalScaleFactor,
      footerHeight: footerHeight(),
      stickyTopInset: stickyTopInset(),
    }),
    'effect',
    'viewportSync',
  );

  // ── 行の選択(チェックボックス。React 版の GridShell と同じつなぎ) ──
  //   controlled の記述子(rowSelection が先、無ければ selectedRowKeys の糖衣)。
  const controlledRowSelectionModel = createMemo((): RowSelectionModel | undefined => {
    if (props.rowSelection !== undefined) {
      return props.rowSelection;
    }
    if (props.selectedRowKeys !== undefined) {
      return { type: 'include', rowKeys: props.selectedRowKeys };
    }
    return undefined;
  });
  // フィルターで隠れている行があるときのフィルター後のデータ行(見出しのチェックボックスは見えている行だけを選ぶ / 外す。
  //   1.0.1 / AP-03)。機能なしの構成ではフィルターが行に効かないので、ふつうは null。
  const filteredDataRows = createMemo(() =>
    !isServerSide() && order().length < baseOrder().length
      ? { rows: rows(), order: order(), rowKeyGetter: resolvedRowKeyGetter() }
      : null,
  );
  // 見出しの全選択のチェックの 3 状態(none / some / all)。選択・行・並びが同じ間は数え直さない(1.0.1 のレビュー RA-7)。
  const countSelectedRowsInOrder = createSelectedRowsInOrderCounter();
  const selectAllRowsState = createMemo(() => {
    const filtered = filteredDataRows();
    return filtered && enableRowSelection()
      ? resolveSelectAllState(
          countSelectedRowsInOrder(ui().rowSelection, filtered.rows, filtered.order, filtered.rowKeyGetter),
          filtered.order.length,
        )
      : getSelectAllState(ui().rowSelection, leafRowCount());
  });
  const rowSelectionCommands = engine.rowSelectionCommands;
  connectController(rowSelectionCommands, () => ({
    rowModel: rowModel(),
    rowSelectionState: ui().rowSelection,
    rowSelectionMode: rowSelectionMode(),
    onRowSelectionChange: inOwnTick(props.onRowSelectionChange),
    controlledRowSelectionModel: controlledRowSelectionModel(),
    leafRowCount: leafRowCount(),
    filteredDataRows: filteredDataRows(),
    // 追加(Solid 版 0.1.2 / S4-09): 選んだ行が rows から消えたら選択から外す(clientSide。React 版と同じ)。
    sourceRows: isServerSide() ? undefined : { rows: rows(), rowKeyGetter: resolvedRowKeyGetter() },
    dispatch,
  }), 'render', 'rowSelectionCommands');

  // ── 展開行(Master/Detail。React 版の GridShell と同じつなぎ) ──
  //   展開中の行のキーの変更の通知(初回 = マウント時の空集合は通知しない)と、rows から消えた行のキーを外す処理(DF-25)。
  connectController(
    engine.detailKeysNotifier,
    () => ({ expandedKeys: ui().expandedDetailRowKeys, onChange: inOwnTick(props.onExpandedDetailRowKeysChange) }),
    'effect',
    'detailKeysNotifier',
  );
  connectController(engine.detailKeysPruner, () => ({
    // サーバーサイドは rows がすべての行ではないので見ない(React 版と同じ)。
    enabled: detailRowEnabled() && !isServerSide(),
    rows: rows(),
    expandedKeys: ui().expandedDetailRowKeys,
    keyOf: resolvedRowKeyGetter(),
    setExpandedKeys: (keys: ReadonlySet<GridRowKey>) => dispatch(gridActions.setExpandedDetailRowKeys(keys)),
  }), 'render', 'detailKeysPruner');
  // 行だけで論理の全高の上限を超える表(約 50 万行〜)では展開行を描けないので、トグルを出さずキーでも開閉しない(AP-26)。
  //   どちらも memo(スクロールのたびに変わる縦のレイアウトから真偽だけを取り出す。renderCell の本体やトグル列の Show が
  //   ctx.detail.expandable を読んでも、スクロールで作り直さず、isExpandable を呼び直さないように)。
  const detailDrawable = createMemo(() => vertical().baseRowMetrics.totalBodyHeight <= MAX_BODY_PX);
  const hasDetailCards = createMemo(() => detailRowEnabled() && vertical().detailEntries.length > 0);
  // 開閉(閉じる前にカードの中のフォーカスを表へ戻す)と、カードと Tab の順は core controllers/detailRowController(React 版と共用)。
  const detailRows = createDetailRowController<T>();
  connectController(detailRows, () => ({
    rowModel: rowModel(),
    orderedColumns: orderedColumns(),
    hasCards: hasDetailCards(),
    drawable: detailDrawable(),
    isExpandable: props.detailRow?.isExpandable,
    detailIndexCache: engine.detailIndexCache,
    getUiState: store.getState,
    dispatch,
    scrollContainerRef,
    gridRootRef,
    tableExitRef,
    scrollCellIntoView: (cell: CellCoord) => {
      requestAnimationFrame(() => engine.gridApi.scrollToCellInternal(cell.row, cell.col, 'auto'));
    },
  }), 'render', 'detailRows');
  // カードの sticky の左オフセットと幅(ビューポートの中央の見える幅。列の合計がそれより狭ければ列の合計)。
  const detailCardStickyLeft = () => paneResolution().leftPaneTotalWidth + paneResolution().centerLeadingWidth;
  const detailCardWidth = () =>
    Math.max(
      Math.min(
        viewportWidth() - detailCardStickyLeft() - paneResolution().rightPaneTotalWidth,
        paneLayout().center.totalWidth,
      ),
      0,
    );
  const detailRender = createMemo(() => props.detailRow?.render);
  const detailCardSlotSignature = createMemo(() => serializeSlotValue(props.detailRow?.className));
  const detailCardSlot = createMemo(() => resolveSlotFromSignature<JSX.CSSProperties>(detailCardSlotSignature()));
  const collapseDetailRow = (rowKey: GridRowKey, viewIndex: number) => detailRows.setExpandedAt(rowKey, viewIndex, false);

  // ── ラベル行の描き方 ──
  //   中身は labelRow.render に LabelRowRenderContext を渡す(無ければ getLabel の文字を既定の見た目で)。中身は中央ペインにだけ描き、
  //   sticky の左と幅は展開行のカードと同じ値(React 版と同じ)。
  const renderLabelRowContent = createMemo((): GridLabelRowRenderContent<T> => {
    const render = labelRender();
    return render
      ? (ctx) => render(ctx)
      : (ctx) => (
          <span class="ssg-label-row-content--default ssg-label-row-default">
            <span class="ssg-label-row-text">{ctx.label}</span>
          </span>
        );
  });
  const resolveLabelRowSlot = (labelRow: GridLabelRow<T>) => {
    const className = labelRowClassName();
    return typeof className === 'function' ? className(labelRow.row) : className;
  };
  const labelRowLayerCenter = createMemo((): GridBodyLabelRowLayer<T> | undefined =>
    labelRowEnabled() && labelRowFeature
      ? {
          Row: labelRowFeature.BodyLabelRow,
          renderContent: renderLabelRowContent(),
          contentStickyLeft: detailCardStickyLeft(),
          contentWidth: detailCardWidth(),
          resolveRowSlot: resolveLabelRowSlot,
        }
      : undefined,
  );
  const labelRowLayerBand = createMemo((): GridBodyLabelRowLayer<T> | undefined =>
    labelRowEnabled() && labelRowFeature
      ? {
          Row: labelRowFeature.BodyLabelRow,
          renderContent: null,
          contentStickyLeft: 0,
          contentWidth: 0,
          resolveRowSlot: resolveLabelRowSlot,
        }
      : undefined,
  );
  const stickyLabelSlot = createMemo(() => {
    const entry = stickyLabelEntry();
    return resolveSlotProps<JSX.CSSProperties>(entry ? resolveLabelRowSlot(entry.labelRow) : undefined);
  });
  // 命令的 API(exportCsv / getExportData / getInvalidCells)へ渡すラベル行の設定(ラベル行の機能が無い構成ではラベル行をデータ行
  //   として扱うので渡さない)。
  const labelRowExport = createMemo(() => {
    const isLabelRow = labelIsLabelRow();
    const getLabel = labelGetLabel();
    return labelRowEnabled() && isLabelRow && getLabel
      ? { isLabelRow, getLabel, exportText: labelExportText() }
      : undefined;
  });

  // ── セルの通知(クリック / ダブルクリック / アクティブセル) ──
  connectController(engine.cellEventNotifier, () => ({
    rowModel: rowModel(),
    orderedColumns: orderedColumns(),
    onCellClick: inOwnTick(props.onCellClick),
    onCellDoubleClick: inOwnTick(props.onCellDoubleClick),
  }), 'render', 'cellEventNotifier');
  connectController(engine.activeRowFollow, () => ({
    enabled: activeRowFollowEnabled(),
    activeCell: ui().activeCell,
    selection: ui().selection,
    rowModel: rowModel(),
    dragging: (() => {
      const drag = ui().dragState;
      return drag?.type === 'selection' && drag.selectionKind !== 'col';
    })(),
    editing: ui().editingCell !== null,
    dispatch,
  }), 'render', 'activeRowFollow');
  connectController(
    engine.activeCellNotifier,
    () => ({
      activeCell: ui().activeCell,
      editingCell: ui().editingCell,
      rowModel: rowModel(),
      orderedColumns: orderedColumns(),
      onActiveCellChange: inOwnTick(props.onActiveCellChange),
      followsRow: activeRowFollowEnabled(),
      isRowFollowPending: engine.activeRowFollow.isFollowPending,
    }),
    'effect',
    'activeCellNotifier',
  );

  // 編集のコントローラはここで作ります(押したときに開いたままの custom エディタの編集を終える endEditLeftOpen をポインタへ渡す
  //   ため。1.4.1 / AP-11。最新の状態は下の「編集」で渡す)。
  const edit = createEditController<T>();

  // ── ポインタ(範囲選択 / 見出し / 行番号 / ダブルクリック) ──
  const pointer = createPointerInteractionsController<T>();
  connectController(pointer, () => ({
    gridRootRef,
    bodyScrollRef,
    onCellDoubleClickRef: cellDoubleClickRef,
    // 押してフォーカスをルートへ移した後、開いたままの custom エディタの編集を終える(1.4.1 / AP-11)。
    endEditLeftOpen: edit.endEditLeftOpen,
    scrollContainerRef,
    leftPaneScrollRef,
    rightPaneScrollRef,
    pointerClientRef,
    autoScrollFrameRef,
    uiState: ui(),
    // イベントの時点の状態は store から読む(core controllers/liveUiState)。
    getUiState: store.getState,
    dispatch,
    enableRangeSelection: enableRangeSelection(),
    enableSorting: enableSorting(),
    orderedColumns: orderedColumns(),
    resolveFirstDataCell: () => resolveFirstDataCell(rowModel(), visibleColumns()),
    filteredRowsLength: viewRowCount(),
    visibleColumnsLength: visibleColumns().length,
    paneLayout: paneLayout(),
    leftLeadingWidth: paneResolution().leftLeadingWidth,
    centerLeadingWidth: paneResolution().centerLeadingWidth,
    rightLeadingWidth: paneResolution().rightLeadingWidth,
    headerHeight: headerHeight(),
    footerHeight: footerHeight(),
    stickyTopHeight: stickyTopHeight(),
    rowMetrics: vertical().rowMetrics,
    verticalScaleFactor: vertical().verticalScaleFactor,
    setHoveredRowIndex: applyHoveredRowChange,
    setHoveredColumnIndex,
    enableRowHover: enableRowHover(),
    enableColumnHeaderHover: props.enableColumnHeaderHover ?? true,
    // クロスヘア(hoverHighlight: 'cross')は機能(motionExtras)。機能なしでは 'row' のまま。
    enableColumnHover: hoverCross(),
    enableRowSelection: enableRowSelection(),
    onGutterRowSelect: rowSelectionCommands.handleGutterRowSelect,
    onGutterRowSelectDrag: rowSelectionCommands.handleGutterRowSelectDrag,
  }), 'render', 'pointer');

  // ── 元に戻す(履歴) ──
  const history = createHistoryController<T>();
  connectController(history, () => ({
    rows: rows(),
    selection: ui().selection,
    activeCell: ui().activeCell,
    onRowsChange: inOwnTick(props.onRowsChange),
    dispatch,
    // サーバーサイドは rows を持たず戻す先が無いので無効(React 版と同じ)。
    enabled: (props.enableUndoRedo ?? true) && !readOnly() && !isServerSide(),
    limit: props.undoHistoryLimit ?? 100,
    onUndoRedoStateChange: inOwnTick(props.onUndoRedoStateChange),
    onAfterRestore: (activeCell: CellCoord | null) => {
      if (activeCell) {
        requestAnimationFrame(() => engine.gridApi.scrollToCellInternal(activeCell.row, activeCell.col, 'auto'));
      }
    },
    rowKeyGetter: props.rowKeyGetter,
  }), 'render', 'history');
  // onRowsChange が無いときは書き込まない(React 版の useGridHistoryController と同じ)。
  const handleRowsChange = () => (props.onRowsChange ? history.handleRowsChange : undefined);

  // ── セルの操作(編集の開始 / チェックボックス / 削除 / 全選択。core engine/cellCommands で React 版と共用)──
  const cells = createCellCommands<T>();
  const { selectEntireGrid, clearSelectedCells, tryStartEdit: tryStartEditCell } = cells;

  // ── コピー / 貼り付け ──
  const orderedColumnKeys = createMemo(() => orderedColumns().map((column) => column.key).join('\u0000'));
  const clipboard = createClipboardController<T>();
  connectController(clipboard, () => ({
    rows: rows(),
    rowModel: rowModel(),
    columns: columns(),
    visibleColumns: orderedColumns(),
    uiState: ui(),
    // イベントの時点の状態は store から読む(core controllers/liveUiState)。
    getUiState: store.getState,
    readOnly: readOnly(),
    canEditCell: canEditCell(),
    rowKeyGetter: resolvedRowKeyGetter(),
    onCopied: (selection: NonNullable<ReturnType<typeof store.getState>['selection']>) => {
      const state = store.getState();
      store.setViewState({
        copiedRange: {
          selection,
          view: {
            sort: state.sort,
            filters: state.filters,
            collapsedGroupKeys: state.collapsedGroupKeys,
            viewRowCount: untrack(viewRowCount),
            columns: untrack(orderedColumnKeys),
          },
        },
      });
    },
    createRow: props.createRow,
    createOverflowColumn: props.createOverflowColumn,
    onPasteSkipped: inOwnTick(props.onPasteSkipped),
    localeTexts: localeTexts(),
    pasteFillsSelection: props.pasteFillsSelection,
    onRowsChange: handleRowsChange(),
    onColumnsChange: inOwnTick(props.onColumnsChange),
    applyServerSideCellEdits: applyServerSideCellEdits(),
    isRowExportable: props.isRowExportable,
    dispatch,
  }), 'render', 'clipboard');
  const isWholeGridSelected = createMemo(() =>
    computeIsWholeGridSelected(ui().selection, viewRowCount(), visibleColumns().length),
  );

  // ── フィルハンドル(機能 features/fillHandle) ──
  //   選択範囲(無ければアクティブセル)の右下の四角を引いて、連続データ / セルのコピーで埋めます。書き込みは貼り付けと同じ規則
  //   (編集可否 / reject / ラベル行・グループ行を飛ばす)で、履歴付きの handleRowsChange へ流します。readOnly・書き込み先なしでは
  //   休眠(React 版と同じ)。機能セットに無ければ何も描かず、prop は何もしません。
  const fillHandleFeature = features.fillHandle;
  const fill = fillHandleFeature?.createFillHandle<T>({
    fillHandle: () => props.fillHandle,
    readOnly,
    isServerSide,
    rows,
    rowModel,
    orderedColumns,
    uiState: ui,
    serverSideQueryKey,
    serverSideRefreshToken: () => props.serverSideRefreshToken,
    canEditCell,
    dispatch,
    hitTest: pointer.getCellCoordFromClientPoint,
    scrollContainerRef,
    gridRootRef,
    footerHeight,
    stickyTopHeight,
    handleRowsChange,
    amendRowsChange: history.amendRowsChange,
    applyServerSideCellEdits,
    viewRowCount,
    paneLayout,
    vertical,
    viewportHeight,
    scrollTop: viewScrollTop,
    headerHeight,
  });

  const resolvePageRow = (fromRow: number, direction: 1 | -1): number => {
    const pageHeight = Math.max(viewportHeight() - headerHeight(), rowHeight());
    return resolvePageTargetRow(vertical().rowMetrics, fromRow, direction, pageHeight);
  };

  // ── セル内検索(機能 features/find) ──
  //   実体は engine.find(core controllers/findController。走査は時間分割)。スナップショットを signal で受け、既定のセルの
  //   描画でヒットを <mark> にし、右上に検索バーを出します。Ctrl / ⌘ + F はキー操作のコントローラ経由。機能セットに find が
  //   無ければ prop は何もせず(Ctrl / ⌘ + F も横取りしない)、engine.find は何もしない代役(常に閉じたまま)です(React 版と同じ)。
  const findEnabled = createMemo(() => props.find !== false && props.find !== undefined && findFeature !== undefined);
  const findOptions = createMemo(() => (typeof props.find === 'object' ? props.find : null));
  const findShortcut = createMemo(() => findEnabled() && (findOptions()?.shortcut ?? true));
  const findSnapshot = createExternalStoreSignal(engine.find, 'findStore');
  const FindBar = findFeature?.FindBar;
  // 本体の行が読むヒットの表とカレントの番号(どちらも値だけの memo。開閉や件数だけの変化では行へ伝えない)。
  const findIndex = createMemo(() => findSnapshot().index);
  const findCurrentIndex = createMemo(() => findSnapshot().currentIndex);
  connectController(engine.find, () => ({
    enabled: findEnabled(),
    rowModel: rowModel(),
    columns: orderedColumns(),
    caseSensitive: findOptions()?.caseSensitive ?? false,
    // 条件付き書式の機能が無ければチップもデータバーも描かれないので、値の文字を探す(React 版 1.0.2 / QB-1)。
    conditionalFormat: conditionalFormatFeature !== undefined,
    // カレントのヒットへ: クリックと同じ 1 セルの選択 + 見える位置へのスクロール(命令的 API と同じ経路)。
    onNavigate: (rowIndex: number, colIndex: number) => {
      engine.gridApi.handle.selectCell(rowIndex, colIndex, { scrollIntoView: true });
    },
    onChange: inOwnTick(props.onFindChange),
  }), 'render', 'find');
  const openFindFromShortcut = () => engine.find.open();
  const closeFindAndRefocus = () => {
    engine.find.close();
    gridRootRef.current?.focus({ preventScroll: true });
  };

  // ── 列フィルターのポップオーバー(機能 features/filtering) ──
  //   列メニューの「フィルター…」/ ツールパネルの ✎ とフィルターを追加 / チップのバーから開き、見出しの下に出します。中身(候補の
  //   収集・コマンド・描画)は機能の FilterPopoverHost。機能セットに無ければ開かない(React 版と同じ)。
  const filterPopover = features.filtering?.createFilterPopover<T>({
    visibleColumns,
    columnFilters,
    columnFilterEnabled,
    gridRootRef,
    isServerSide,
    rows,
    isLabelRow: () => (labelRowEnabled() ? labelIsLabelRow() : undefined),
    // グループ化している間のグループ元の列(表示から外れているが絞り込める。見出しの代わりに自動グループ列の下に開く)。
    groupColumns: activeGroupColumns,
  });
  const FilterPopoverHost = features.filtering?.FilterPopoverHost;
  const filteringFeature = features.filtering;

  // ── 列メニュー(機能 features/columnMenu) ──
  //   見出しの ⋮(マウスは pointerdown、タッチとキーボードは click で開く)/ 見出しの右クリック / アクティブセルの Alt+↓ で開き、
  //   項目の処理は engine の columnCommands。機能セットに無ければ ⋮ も見出しの右クリックも出さない(React 版と同じ)。
  const columnMenuFeature = features.columnMenu;
  const enableColumnMenu = () => props.enableColumnMenu ?? true;
  const columnMenu = columnMenuFeature?.createColumnMenu<T>({
    visibleColumns,
    enableColumnMenu,
    gridRootRef,
  });
  const columnMenuEnabled = () => enableColumnMenu() && columnMenu !== undefined;
  // 列フィルターを開いたまま ⋮ を押したら、フィルターを閉じてからメニューを開きます(⋮ の pointerdown は見出しの列の選択と
  //   ぶつからないよう伝播を止めるので、フィルターの「外を押したら閉じる」に届かない。React 版の 1.0.2 / C-09)。
  const openColumnMenuFromButton = columnMenu
    ? (column: GridColumn<T>, event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
        if (filterPopover && untrack(filterPopover.isOpen) && event.button === 0) {
          filterPopover.close();
        }
        columnMenu.openFromButton(column, event);
      }
    : undefined;
  // Alt+↓ でアクティブセルの列のメニューを開く(列の見出しのセルの下に出す)。見出しが描かれていない(横の仮想化で外れた)列や、
  //   ⋮ の無い列(合成列)では開かず、↓ のまま(React 版と同じ)。
  const openColumnMenuForCell = (col: number): boolean => {
    const column = untrack(orderedColumns)[col];
    const root = gridRootRef.current;
    if (!columnMenu || !column || !root || isSyntheticColumnKey(column.key)) {
      return false;
    }
    const header = Array.from(root.querySelectorAll<HTMLElement>('.ssg-header-cell[data-ssg-col-key]')).find(
      (cell) => cell.dataset.ssgColKey === column.key,
    );
    if (!header) {
      return false;
    }
    columnMenu.openFromKeyboard(column, header);
    return true;
  };

  // ── ツールパネル(機能 features/toolPanel。フィルター / 列 / 並び替えの 3 タブ) ──
  //   タブの可否は機能のフラグ(フィルター = enableColumnFilter / 列 = enableColumnMenu / 並び替え = enableSorting)。開く入口は
  //   列メニューの 3 項目・上部バーの絞り込みのチップ・ハンドルの openFilterManager。列メニューもフィルターも無い構成では入口が
  //   無いので作りません(React 版と同じ)。列フィルターのポップオーバーの中の押下では閉じず、ポップオーバーが開いている間の
  //   Escape はポップオーバーを閉じます(1 回目 = ポップオーバー / 2 回目 = パネル)。
  const toolPanelFeature =
    features.filtering !== undefined || features.columnMenu !== undefined ? features.toolPanel : undefined;
  const toolPanel = toolPanelFeature?.createToolPanel({
    canUseFilterTab: columnFilterEnabled,
    canUseColumnsTab: enableColumnMenu,
    canUseSortTab: enableSorting,
    gridRootRef,
    alliedRef: filterPopover?.panelRef,
    suppressEscape: () => filterPopover?.isOpen() ?? false,
    onSuppressedEscape: () => filterPopover?.close(),
  });
  // ツールパネルを開く関数(列メニューの項目とハンドルの openFilterManager)。開発時は、足りない機能で開けないときに警告する。
  const openToolPanel = withOpenToolPanelWarnings(toolPanel?.open, features);
  // 追加(段階 3-3): 列フィルターのポップオーバーとツールパネルの部品(別のチャンク)の読み込み(view/lazyPopups.ts)。読み込み前は
  //   null(部品を描かない)。使える機能なら描いた後の暇なときに先読みし、先読みの前に開かれたらその場で読み込みます。読み込みに
  //   失敗したら閉じます。条件は React 版と同じ: 列フィルターのポップオーバーを開く入口は列メニューとツールパネルだけなので、
  //   どちらも無い構成と、filterType のある列が無いときは先読みしない。
  const filterPopoverViews =
    filterPopover && filteringFeature
      ? filteringFeature.createFilterPopoverViews({
          needed: filterPopover.isOpen,
          prefetch: () =>
            columnFilterEnabled() &&
            (columnMenu !== undefined || toolPanel !== undefined) &&
            visibleColumns().some((column) => Boolean(column.filterType)),
          onLoadError: filterPopover.close,
        })
      : undefined;
  const toolPanelViews =
    toolPanel && toolPanelFeature
      ? toolPanelFeature.createToolPanelViews({
          needed: () => toolPanel.activeTab() !== null,
          prefetch: () => toolPanel.availableTabs().length > 0,
          onLoadError: toolPanel.close,
        })
      : undefined;
  // 既定の上部バーの絞り込みのチップでフィルターのタブを開け閉めします(別のタブを出しているときはフィルターのタブへ切り替える)。
  const toggleFilterManager = () => {
    if (!toolPanel) {
      return;
    }
    if (untrack(toolPanel.activeTab) === 'filter') {
      toolPanel.close();
    } else {
      toolPanel.open('filter');
    }
  };

  // ── 右クリックメニュー(機能 features/contextMenu) ──
  //   本体の右クリックはシェルの 1 つの委譲のハンドラ(onContextMenu)で受け、対象(セル / 行番号)を DOM から逆引きして
  //   getContextMenuItems の項目でメニューを開きます。開かない対象や項目が空ならブラウザの標準のメニューのまま(空のパネルは
  //   出さない)。キーボード(Shift+F10 / メニューキー)はアクティブセルのメニューをセルの左下に開き、先頭の項目へフォーカスを
  //   移します。どれも React 版の GridShell.tsx と同じ処理です。機能セットに無ければ enableContextMenu は false(標準のメニュー)。
  const contextMenuFeature = features.contextMenu;
  const contextMenu = contextMenuFeature?.createCellContextMenu<T>({ gridRootRef });
  const contextMenuActive = () =>
    contextMenu !== undefined && (props.enableContextMenu ?? false) && props.getContextMenuItems !== undefined;
  // グリッドのポップアップを出しているか(シェルの Tab の順・キー操作・貼り付けを止める。React 版の isAnyGridPopupOpen)。
  const isAnyGridPopupOpen = () =>
    (filterPopover?.isOpen() ?? false) ||
    (columnMenu?.isOpen() ?? false) ||
    (toolPanel ? toolPanel.activeTab() !== null : false) ||
    (contextMenu?.isOpen() ?? false);
  // キーボードで開こうとした時刻(ms)と開いたか。続けてブラウザが送る contextmenu(Shift+F10 / メニューキーの既定の動作)で、
  //   開いたときは標準のメニューを止め、開かなかった(項目が無い)ときは標準のメニューのままにします(項目をもう一度聞かない)。
  let keyboardContextMenu: { at: number; opened: boolean } | null = null;
  const openContextMenuForCell = (cell: CellCoord): boolean => {
    const root = gridRootRef.current;
    const columnsNow = untrack(orderedColumns);
    const column = columnsNow[cell.col];
    const getItems = props.getContextMenuItems;
    if (!contextMenuActive() || !contextMenuFeature || !contextMenu || !getItems || !root || !column) {
      return false;
    }
    // 展開行のカードの中の入れ子のグリッドのセルは数えません。セルが描かれていない(画面の外)ときは表の左上に出します。
    const cellEl = Array.from(
      root.querySelectorAll<HTMLElement>(`[data-row-index="${cell.row}"] [data-ssg-col-key]`),
    ).find((element) => element.dataset.ssgColKey === column.key && !isInsideDetailCardOf(root, element));
    const rect = (cellEl ?? root).getBoundingClientRect();
    const state = untrack(ui);
    const params = contextMenuFeature.buildCellContextMenuParams<T>({
      cell,
      clientX: rect.left,
      clientY: cellEl ? rect.bottom : rect.top,
      rowModel: untrack(rowModel),
      orderedColumns: columnsNow,
      selection: state.selection,
      activeCell: state.activeCell,
    });
    if (!params) {
      return false;
    }
    const items = getItems(params);
    if (!items || items.length === 0) {
      return false;
    }
    if (props.onContextMenuOpen) {
      callInOwnTick(props.onContextMenuOpen, params);
    }
    contextMenu.open(params, items, { focus: 'firstItem' });
    return true;
  };
  // キーの操作(keydown)から開くときの入口。開いたときは、続けて来るキーボードの contextmenu(右ボタン以外)を 1 秒の間に 1 回だけ
  //   window の capture で止めます(Windows のメニューキーは keyup で contextmenu を送り、フォーカスはもう表の外へ移っている)。
  const openContextMenuFromKeyboard = (cell: CellCoord): boolean => {
    const opened = openContextMenuForCell(cell);
    keyboardContextMenu = { at: performance.now(), opened };
    if (opened && typeof window !== 'undefined') {
      const stop = (): void => {
        window.removeEventListener('contextmenu', onContextMenu, true);
        window.removeEventListener('keydown', stop, true);
        window.removeEventListener('pointerdown', stop, true);
        window.clearTimeout(timer);
      };
      const onContextMenu = (event: MouseEvent): void => {
        stop();
        if (event.button !== 2) {
          event.preventDefault();
        }
      };
      const timer = window.setTimeout(stop, 1000);
      window.addEventListener('contextmenu', onContextMenu, true);
      window.addEventListener('keydown', stop, true);
      window.addEventListener('pointerdown', stop, true);
    }
    return opened;
  };
  const handleBodyContextMenu = (event: MouseEvent & { currentTarget: HTMLDivElement }) => {
    const getItems = props.getContextMenuItems;
    if (!contextMenuActive() || !contextMenuFeature || !contextMenu || !getItems) {
      return;
    }
    // キーボードから来た contextmenu(フォーカスを持つシェルか入力受けが対象で、右ボタンではない。Chrome は button が -1)。
    //   直前にキーで開いたなら標準のメニューを止めるだけ、keydown を経ずに来た(OS がキーを contextmenu に変える)ならここで
    //   開きます。検索欄などシェルの中の入力欄では標準のメニューのまま。
    const target = event.target instanceof Element ? event.target : null;
    const fromShellFocus = target !== null && (target === event.currentTarget || target.hasAttribute(IME_INPUT_ATTRIBUTE));
    if (event.button !== 2 && fromShellFocus) {
      const fromKeyboard = keyboardContextMenu;
      if (fromKeyboard && performance.now() - fromKeyboard.at < 1000) {
        if (fromKeyboard.opened) {
          event.preventDefault();
        }
        return;
      }
      const activeCell = untrack(ui).activeCell;
      if (activeCell && openContextMenuForCell(activeCell)) {
        event.preventDefault();
      }
      return;
    }
    const state = untrack(ui);
    const params = contextMenuFeature.buildBodyContextMenuParams<T>({
      event,
      rowModel: untrack(rowModel),
      orderedColumns: untrack(orderedColumns),
      selection: state.selection,
      activeCell: state.activeCell,
    });
    if (!params) {
      return;
    }
    const items = getItems(params);
    // 空(または未定義)なら標準のメニューへ(空のパネルは出さない)。
    if (!items || items.length === 0) {
      return;
    }
    // ここで初めて標準のメニューを止め、グリッドのメニューを開きます。
    event.preventDefault();
    if (props.onContextMenuOpen) {
      callInOwnTick(props.onContextMenuOpen, params);
    }
    contextMenu.open(params, items);
  };
  // 開いているメニュー(項目と位置と読み上げの名前)。閉じている間 / 位置が決まる前は null。
  const contextMenuView = createMemo(() => {
    const snapshot = contextMenu?.snapshot();
    if (!snapshot?.state || !snapshot.layout) {
      return null;
    }
    const texts = localeTexts() as unknown as { contextMenuRow: string; contextMenuCell: string };
    return {
      items: snapshot.state.items,
      layout: snapshot.layout,
      ariaLabel: snapshot.state.params.target.type === 'rowHeader' ? texts.contextMenuRow : texts.contextMenuCell,
    };
  });

  // ── キー操作 ──
  const keyboard = createKeyboardController<T>();
  connectController(keyboard, () => ({
    uiState: ui(),
    // 端の固定列へ移ったときに中央の横のスクロールを端へ戻す(S12-05。React 版と同じ)。
    scrollContainerRef,
    // イベントの時点の状態は store から読む(core controllers/liveUiState)。
    getUiState: store.getState,
    rowModel: rowModel(),
    visibleColumns: orderedColumns(),
    readOnly: readOnly(),
    canEditCell: canEditCell(),
    setEditorInitialValue,
    dispatch,
    handleCopy: clipboard.handleCopy,
    openFind: findShortcut() ? openFindFromShortcut : undefined,
    handleCellDoubleClick: tryStartEditCell,
    isWholeGridSelected: isWholeGridSelected(),
    selectEntireGrid,
    onUndo: history.undo,
    onRedo: history.redo,
    onClearSelection: clearSelectedCells,
    enableClearOnDelete: props.enableClearOnDelete ?? true,
    onToggleCheckboxCell: cells.toggleCheckbox,
    onToggleGroup: handleGroupToggle,
    onToggleDetailRow: detailRowEnabled() ? detailRows.toggleFromKeyboard : undefined,
    resolvePageRow,
    openColumnMenu: columnMenuEnabled() ? openColumnMenuForCell : undefined,
    openContextMenu: contextMenuActive() ? openContextMenuFromKeyboard : undefined,
    // 最終列の Tab: その行のカードが開いていればカードの最初の要素へ、無ければ表の直後の目印から既定の Tab(段階 2 C-N2 / F-10)。
    onTabPastLastColumn: detailRows.handleTabPastLastColumn,
  }), 'render', 'keyboard');

  // ── 編集(コントローラは上のポインタの前で作っている) ──
  connectController(edit, () => ({
    uiState: ui(),
    rows: rows(),
    visibleColumns: orderedColumns(),
    rowModel: rowModel(),
    setEditorInitialValue,
    onRowsChange: handleRowsChange(),
    applyServerSideCellEdits: applyServerSideCellEdits(),
    dispatch,
    gridRootRef,
    editorActionGuardRef,
    readOnly: readOnly(),
    canEditCell: canEditCell(),
    localeTexts: localeTexts(),
    followsRow: activeRowFollowEnabled(),
    getUiState: store.getState,
    rowKeyGetter: resolvedRowKeyGetter(),
  }), 'render', 'edit');
  connectController(cells, () => ({
    rows: rows(),
    rowModel: rowModel(),
    orderedColumns: orderedColumns(),
    uiState: ui(),
    getUiState: store.getState,
    readOnly: readOnly(),
    canEditCell: canEditCell(),
    handleRowsChange: handleRowsChange(),
    applyServerSideCellEdits: applyServerSideCellEdits(),
    startEditWithValue: edit.startEditWithValue,
    dispatch,
  }), 'render', 'cells');
  // ── IME オンのままの直接入力(機能 features/imeDirectInput) ──
  //   imeDirectInput が有効なときだけ、シェルの末尾の透明な入力受けへグリッドのフォーカスを置き、IME の変換をそこで始めます。
  //   変換が確定したら、確定した文字を初期値に通常の編集を始めます(startEditWithValue)。本体は core
  //   controllers/imeInputController(engine.imeInput)。入力受けの位置はセルの要素から測るので、セルを描いた後の 'effect' で
  //   update します(React 版はレイアウト effect)。機能セットに無ければ無効(engine.imeInput も代役)です。
  const imeDirectInputEnabled = createMemo(() => (props.imeDirectInput ?? false) && imeFeature !== undefined);
  connectController(
    engine.imeInput,
    () => {
      // 読むだけ(args には入れない): アクティブセルが描かれたら update し直します。コントローラは描かれていないセルへは
      //   入力受けを合わせられず、次の update で合わせ直す作りで、React 版は描くたびに update するので、画面の外へ跳んだ
      //   アクティブセル(Ctrl+End など)へもスクロールで描かれた後に合う。Solid 版はスクロールでは args が変わらないため。
      activeCellRendered();
      return {
        enabled: imeDirectInputEnabled(),
        gridRootRef,
        editing: ui().editingCell !== null,
        activeCell: ui().activeCell,
        resolveCell: (cell: CellCoord) => {
          const column = untrack(orderedColumns)[cell.col];
          return column ? { colKey: column.key, align: column.align } : null;
        },
        canStartEdit: (cell: CellCoord) =>
          imeFeature?.canStartImeEdit(
            {
              rowModel: untrack(rowModel),
              columns: untrack(orderedColumns),
              readOnly: untrack(readOnly),
              canEditCell: untrack(canEditCell),
            },
            cell,
          ) === true,
        startEdit: edit.startEditWithValue,
        // number の列は確定した文字を半角の数値の表記へ直して編集を始めます(読めない変換は捨てる)。
        resolveEditText: (cell: CellCoord, text: string) =>
          imeFeature ? imeFeature.resolveImeEditText(untrack(orderedColumns), cell, text) : text,
      };
    },
    'effect',
    'imeInput',
  );
  // 入力受けを外したら(imeDirectInput を false にした)コントローラから切り離します(React 版の ref の null)。
  createEffect(imeDirectInputEnabled, (enabled) => {
    if (!enabled) {
      engine.imeInput.attach(null);
    }
  }, { name: 'imeInputDetach' });

  // ダブルクリック: 利用側の onCellDoubleClick が preventDefault しなければ編集を始める(React 版と同じ)。
  cellDoubleClickRef.current = (cell, event) => {
    if (engine.cellEventNotifier.notifyCellDoubleClick(cell, event)) {
      return;
    }
    tryStartEditCell(cell);
  };

  // ── Escape をグリッドが使うとき、外側(ダイアログなど)へ渡さない(core controllers/escapeClaimController) ──
  //   機能なしの構成ではグリッドのポップアップ(列メニュー / フィルター / ツールパネル / 右クリックメニュー)が無い。
  const escapeClaim = createEscapeClaimController();
  connectController(escapeClaim, () => ({
    gridRootRef,
    isClaimedTarget: (target: Element, root: HTMLElement) => {
      const state = store.getState();
      if (!root.contains(target)) {
        const popupOpen = untrack(isAnyGridPopupOpen);
        if (target.closest(GRID_POPUP_SELECTOR) !== null) {
          return popupOpen || state.editingCell !== null;
        }
        // 右クリックメニューは開くときにフォーカスを外す(blurForPopover)ので、Escape の対象は body になる。その Escape は
        //   メニューを閉じるのに使う(React 版と同じ)。
        const ownerDocument = target.ownerDocument;
        return popupOpen && (target === ownerDocument.body || target === ownerDocument.documentElement);
      }
      if (target.closest('.ssg-cell-editor, [data-ssg-find-bar]') !== null) {
        return true;
      }
      if (target === root || target.hasAttribute('data-ssg-ime-input')) {
        // 1 セルのコピーの後の Escape も(コピー範囲の点線を消す。React 版と同じ)。
        return state.editingCell !== null || isClearableSelection(state.selection) || untrack(copiedSelection) !== null;
      }
      return false;
    },
  }), 'render', 'escapeClaim');
  const handleShellKeyDown = (event: KeyboardEvent) => {
    // ポップアップを出している間はグリッドのキー操作を止めます(React 版と同じ)。
    if (!untrack(isAnyGridPopupOpen)) {
      handleRootKeyDown(event);
    }
    if (isEscapeClaimedByGrid(event)) {
      event.stopPropagation();
    }
  };
  const handleRootKeyDown = (event: KeyboardEvent) => {
    keyboard.handleKeyDown({
      key: readEventKey(event),
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      isComposing: isImeComposingKeyEvent(event),
      target: event.target,
      preventDefault: () => event.preventDefault(),
    });
    // セルや見出しの中の要素で Tab を押し、表の中にもう止まる要素が無いときは表の外へ(カードがあるときだけ)。
    detailRows.handleRootKeyDownAfter(event);
  };

  // ── 列(並べ替え / 列幅のドラッグ。core engine/columnCommands) ──
  const columnCommands = engine.columnCommands;
  connectController(columnCommands, () => ({
    columns: columns(),
    visibleColumns: visibleColumns(),
    orderedColumns: orderedColumns(),
    columnWidths: paneResolution().effectiveColumnWidths,
    onColumnsChange: inOwnTick(props.onColumnsChange),
    dispatch,
    // 列を変えた後、アクティブセルを列のキーに付いていかせる(S12-01。React 版と同じ)。
    getUiState: store.getState,
    enableSorting: enableSorting(),
    sort: ui().sort,
    globalFilterText: selectGlobalFilter(ui()),
    closeColumnMenu: columnMenu?.close ?? noop,
    openToolPanel,
    openColumnFilterPopover: filterPopover?.open ?? noop,
    runAutosize: columnAutosize?.runAutosize,
  }), 'render', 'columnCommands');

  // ── 適用中のフィルターの一覧と、列へ移ってフィルターを開く処理(機能 features/filtering。ツールパネルのフィルターのタブと
  //   チップのバーが使う) ──
  const filterManagement = features.filtering?.createFilterManagement<T>({
    columns,
    orderedColumns,
    visibleColumns,
    columnFilters,
    scrollContainerRef,
    gridRootRef,
    paneLayout,
    leftPaneTotalWidth: () => paneResolution().leftPaneTotalWidth,
    centerLeadingWidth: () => paneResolution().centerLeadingWidth,
    rightPaneTotalWidth: () => paneResolution().rightPaneTotalWidth,
    openColumnFilterPopover: filterPopover?.open ?? noop,
    groupColumns: activeGroupColumns,
    localeTexts,
  });
  // ツールパネルの「列」タブへ渡す全列(見えていない列も。所属のペインは固定の指定から)。
  const columnChooserItems = createMemo(() =>
    columns().map((column) => ({
      key: column.key,
      title: column.title || column.key,
      visible: column.visible !== false,
      pane: getColumnPane(column),
      // グループ化している間のグループ元の列は表示を切り替えられない印(React 版の DF-22)。
      grouped: rowGroupingActive() && column.rowGroup === true ? true : undefined,
    })),
  );
  // ツールパネルの「並び替え」タブへ渡す、並び替えに選べる列(見えている列 + グループ化している間のグループ元の列 = グループ元の
  //   列のソートでグループごと並び替わる。合成列は除く。React 版と同じ)。
  const sortManagerColumns = createMemo(() =>
    [...visibleColumns(), ...activeGroupColumns()]
      .filter((column) => !isSyntheticColumnKey(column.key))
      .map((column) => ({ key: column.key, title: column.title || column.key })),
  );
  // タブのバッジ: フィルター = 適用中の列フィルターの数 + グローバル(文字があれば 1)/ 並び替え = 基準の数。
  const showGlobalFilterRow = () => globalFilterEnabled() && globalFilterText().trim().length > 0;
  const toolPanelTabs = createMemo(() =>
    (toolPanel?.availableTabs() ?? []).map((tab) => {
      const texts = localeTexts();
      if (tab === 'filter') {
        return {
          tab,
          label: texts.toolPanelFilters,
          badge: (filterManagement?.entries().length ?? 0) + (showGlobalFilterRow() ? 1 : 0),
        };
      }
      if (tab === 'sort') {
        return { tab, label: texts.toolPanelSort, badge: ui().sort.length };
      }
      return { tab, label: texts.toolPanelColumns };
    }),
  );

  // 列メニューのグループ化の入口。列のどれかに rowGroup を書いている(false を含む = グループ化を使う表)ときだけ出す(グループ化を
  //   使わない表のメニューは変えない)。列の定義は controlled なので onColumnsChange が要り、グループ化の機能・clientSide が条件
  //   ・ラベル行なし(React 版と同じ)。集計のある列(aggFunc)はグループ化の対象に出さない。
  const columnMenuGroupingAvailable = createMemo(
    () =>
      groupingFeature !== undefined &&
      !isServerSide() &&
      !labelRowEnabled() &&
      props.onColumnsChange !== undefined &&
      columns().some((column) => column.rowGroup !== undefined),
  );

  // ── 列見出しのドラッグによる並べ替え(機能 features/columnReorder。core controllers/columnHeaderDragController) ──
  //   onColumnsChange があるときだけ見出しに grip を出します(React 版と同じ)。ドラッグ中は状態を変えず、ドロップの縦線 /
  //   ゴースト / live 方式の追従はコントローラが DOM へ直接書きます。確定は columnCommands の applyColumnOrderAndPin。
  //   live 方式は motion が 'off' のときゴーストへ(React 版と同じ)。
  const columnReorder = features.columnReorder?.createColumnReorder<T>(() => ({
    enabled: Boolean(props.onColumnsChange),
    columns: columns(),
    paneLayout: paneLayout(),
    leftPaneScrollRef,
    rightPaneScrollRef,
    bodyScrollRef,
    scrollContainerRef,
    leftLeadingWidth: paneResolution().leftLeadingWidth,
    centerLeadingWidth: paneResolution().centerLeadingWidth,
    rightLeadingWidth: paneResolution().rightLeadingWidth,
    applyColumnOrderAndPin: columnCommands.applyColumnOrderAndPin,
    ghostSlot: slots().dragGhost,
    motion: resolvedMotion() === 'off' ? 'ghost' : (props.columnDragMotion ?? 'ghost'),
  }));
  const columnDragHandler = createMemo(() =>
    columnReorder && props.onColumnsChange ? columnReorder.onColumnDragHandlePointerDown : undefined,
  );
  // ドロップの縦線(各ペインに常設。表示と位置はコントローラが直接書く)。高さは見出しから合計行までを貫く(React 版と同じ)。
  const renderColumnDropIndicator = (pane: ColumnPane) =>
    columnReorder ? (
      <div
        ref={(element) => columnReorder.setIndicator(pane, element)}
        class="ssg-col-drop-indicator"
        style={{
          position: 'absolute',
          top: '0',
          height: px(headerHeight() + vertical().physicalBodyHeight + footerHeight()),
          transform: 'translateX(-1px)',
          'pointer-events': 'none',
          'z-index': 8,
          display: 'none',
        }}
      />
    ) : null;

  // ── 行の移動(ドラッグの確定 / 命令的 API の moveRow。React 版と同じくシェルに置く = 機能が無くても moveRow は動く) ──
  //   moveArrayItem が何もしない(同じ位置 / 範囲外)なら onRowsChange も onRowMove も呼びません。履歴(handleRowsChange)を
  //   通すので元に戻せます。動かしたら true(ドラッグで離したときのアクティブセルを決めるため)。
  const commitRowMove = (fromIndex: number, toIndex: number): boolean => {
    const onRowsChange = handleRowsChange();
    if (!onRowsChange) {
      return false;
    }
    const currentRows = rows();
    const next = moveArrayItem(currentRows, fromIndex, toIndex);
    if (next === currentRows) {
      return false;
    }
    const movedRow = currentRows[fromIndex] as T;
    const nextRows = next as T[];
    onRowsChange(nextRows);
    if (props.onRowMove) {
      callInOwnTick(props.onRowMove, {
        rowKey: resolvedRowKeyGetter()(movedRow, fromIndex),
        fromIndex,
        toIndex,
        rows: nextRows,
      });
    }
    return true;
  };
  const moveRowByKey = (rowKey: GridRowKey, toIndex: number) => {
    // clientSide(rows + onRowsChange)専用。サーバーサイドでは何もしない(開発時は警告する。React 版と同じ)。
    if (isServerSide()) {
      warnMoveRowOnServerSide();
      return;
    }
    const getKey = resolvedRowKeyGetter();
    const fromIndex = rows().findIndex((row, index) => getKey(row, index) === rowKey);
    if (fromIndex < 0) {
      return;
    }
    commitRowMove(fromIndex, toIndex);
  };
  // ドラッグで離したとき: 行のホバーを外し、離した行(動かした先)をアクティブセルにする。列は今のアクティブセルの列(無いか
  //   合成列なら先頭のデータ列)で、横の見える範囲に丸ごと無ければ、丸ごと見えている先頭のデータ列、それも無ければいちばん
  //   広く見えているデータ列(React 版の GridShell.tsx の commitRowMoveFromDrag と同じ判断。1.0.2 の RV-F3 / QA-6)。
  const commitRowMoveFromDrag = (fromIndex: number, toIndex: number) => {
    const moved = commitRowMove(fromIndex, toIndex);
    applyHoveredRowChange(null);
    const columnsNow = orderedColumns();
    const layout = paneLayout();
    const resolution = paneResolution();
    const isDataCol = (col: number) => {
      const column = columnsNow[col];
      return column !== undefined && !isControlColumnKey(column.key);
    };
    // 列の見えている幅と、丸ごと見えているか(固定ペインの列はいつも見えている)。
    const resolveColVisibility = (col: number): { visible: number; whole: boolean } => {
      const single = computeSinglePaneColumnExtent(layout, col);
      const scrollElement = scrollContainerRef.current;
      if (!single || single.pane !== 'center' || !scrollElement) {
        return single !== null ? { visible: single.extent.width, whole: true } : { visible: 0, whole: false };
      }
      const left = resolution.leftPaneTotalWidth + resolution.centerLeadingWidth + single.extent.start;
      const right = left + single.extent.width;
      const visibleLeft = scrollElement.scrollLeft + resolution.leftPaneTotalWidth;
      const visibleRight = scrollElement.scrollLeft + scrollElement.clientWidth - resolution.rightPaneTotalWidth;
      return {
        visible: Math.max(0, Math.min(right, visibleRight) - Math.max(left, visibleLeft)),
        whole: left >= visibleLeft && right <= visibleRight,
      };
    };
    const activeCol = store.getState().activeCell?.col;
    let col = activeCol !== undefined && isDataCol(activeCol) ? activeCol : resolveFirstDataColIndex(columnsNow);
    if (!resolveColVisibility(col).whole) {
      let widest = -1;
      let widestVisible = 0;
      let wholeCol = -1;
      for (let index = 0; index < columnsNow.length && wholeCol < 0; index += 1) {
        if (!isDataCol(index)) {
          continue;
        }
        const visibility = resolveColVisibility(index);
        if (visibility.whole) {
          wholeCol = index;
        } else if (visibility.visible > widestVisible) {
          widest = index;
          widestVisible = visibility.visible;
        }
      }
      if (wholeCol >= 0) {
        col = wholeCol;
      } else if (widest >= 0 && widestVisible > resolveColVisibility(col).visible) {
        col = widest;
      }
    }
    engine.gridApi.handle.selectCell(moved ? toIndex : fromIndex, col);
  };

  // ── 行ドラッグによる並べ替え(機能 features/rowDrag。core controllers/rowDragController) ──
  //   ハンドル列(合成列)は enableRowDrag で core の列の解決が足し、セルの中身はハンドルの部品(renderCellContent)。
  //   動かせるのは表示順が rows の順のときだけ(ソート / フィルター中はハンドルが淡色)。live 方式は motion が 'off' の
  //   ときゴーストへ(React 版と同じ)。
  const rowDragFeature = features.rowDrag;
  const rowDrag = rowDragFeature?.createRowDrag<T>({
    controller: () => ({
      enabled: rowDragOperable(),
      rowMetrics: vertical().rowMetrics,
      headerHeight: headerHeight(),
      footerHeight: footerHeight(),
      stickyTopHeight: stickyTopHeight(),
      verticalScaleFactor: vertical().verticalScaleFactor,
      windowBaseOffsetPx: vertical().overlayBaseOffset,
      scrollContainerRef,
      bodyScrollRef,
      gridRootRef,
      // 追加(1.4.1 / AP-11 のレビュー): フォーカスを移した後に、開いたままの custom エディタの編集を終える。
      endEditLeftOpen: edit.endEditLeftOpen,
      commitRowMove: commitRowMoveFromDrag,
      ghostSlot: slots().dragGhost,
      motion: resolvedMotion() === 'off' ? 'ghost' : (props.rowDragMotion ?? 'ghost'),
    }),
    rowModel,
    visibleColumns,
    canDropRow: () => props.canDropRow,
    rows,
    resolveRowKey: resolvedRowKeyGetter,
    hasRowKeys: () => props.rowKeyGetter !== undefined,
    dragRowLabel: () => (localeTexts() as unknown as { dragRowLabel: string }).dragRowLabel,
  });
  // 行ドロップの位置のガイド線(各ペインの本体の層。左端のペインはキャップ付き)。キャップの有無は class の中で読む(呼ぶ側の式で
  //   読むと、列幅などでペインの解決が変わるたびに要素ごと作り直し、コントローラが書いた位置が消えるため)。
  const renderRowDropIndicator = (pane: ColumnPane, cap: () => boolean) =>
    rowDrag ? (
      <Show when={rowDragAvailable()}>
        <div
          ref={(element) => rowDrag.setIndicator(pane, element)}
          class={['ssg-row-drop-indicator', { 'ssg-row-drop-indicator--cap': cap() }]}
        />
      </Show>
    ) : null;

  // ── 見出しの角 / 行番号 / 列見出しのホバー ──
  const handleCornerHeaderPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    if (event.button !== 0) {
      return;
    }
    if (viewRowCount() === 0 || visibleColumns().length === 0) {
      return;
    }
    gridRootRef.current?.focus({ preventScroll: true });
    // 追加(1.4.1 / AP-11 のレビュー): 開いたままの custom エディタの編集を終えます(セルを押したときと同じ)。
    edit.endEditLeftOpen();
    // 全選択のチェックがあるときは、角で行の選択の全選択 / 解除を切り替えます(表全体のセルの選択より先)。
    if (enableSelectAllRows()) {
      rowSelectionCommands.handleToggleSelectAllRows();
      return;
    }
    if (isWholeGridSelected()) {
      dispatch(gridActions.clearSelection());
      dispatch(gridActions.activateCell(null));
      return;
    }
    selectEntireGrid();
  };
  const handleRowHeaderPointerLeave = (rowIndex: number) => {
    applyHoveredRowChange((current) => (current === rowIndex ? null : current));
  };
  const handleColumnHeaderPointerLeave = (colIndex: number) => {
    setHoveredColumnIndex((current) => (current === colIndex ? null : current));
  };

  // ── 命令的 API(ハンドル) ──
  // args は render の時機で渡す(利用側のコールバック = effect の時機の通知の中でハンドルを読んでも、今の値を返すように)。
  //   末尾への合わせ直し(M-05。scrollToBottom() の後に auto-height の計測で総高が伸びたとき)だけは deferBottomPin で
  //   update から外し、下の effect(DOM の束縛 = スペーサーの高さを書き終えた後)で行う。Solid の render effect は DOM の
  //   束縛と同じ回に走るので、update の中で合わせ直すとブラウザが前の高さで止め、末尾に届かなかった(段階 3-2)。
  connectController(engine.gridApi, () => ({
    scrollContainerRef,
    dispatch,
    rowModel: rowModel(),
    viewRowCount: viewRowCount(),
    leafRowCount: leafRowCount(),
    groupTree: groupTree(),
    rowMetrics: vertical().rowMetrics,
    paneLayout: paneLayout(),
    orderedColumns: orderedColumns(),
    columns: columns(),
    onColumnsChange: inOwnTick(props.onColumnsChange),
    includeGroupingInState: props.includeGroupingInState ?? false,
    uiState: ui(),
    getUiState: store.getState,
    focusGrid: () => gridRootRef.current?.focus({ preventScroll: true }),
    beforeDetailRowsCollapse: detailRows.returnFocusFromCards,
    startEditCell: tryStartEditCell,
    headerHeight: headerHeight(),
    verticalScaleFactor: vertical().verticalScaleFactor,
    leftPaneTotalWidth: paneResolution().leftPaneTotalWidth,
    rightPaneTotalWidth: paneResolution().rightPaneTotalWidth,
    centerLeadingWidth: paneResolution().centerLeadingWidth,
    windowFirstRow: vertical().windowFirstRow,
    windowLastRow: vertical().windowLastRow,
    physicalBodyHeight: vertical().physicalBodyHeight,
    measuredRowHeights: autoHeightActive() || vertical().detailActive,
    deferBottomPin: true,
    rows: rows(),
    isServerSide: isServerSide(),
    serverSideRefresh: serverSide?.refresh ?? noop,
    serverSideRetryFailed: serverSide?.retryFailedBlocks ?? noop,
    resolvedRowKeyGetter: resolvedRowKeyGetter(),
    isRowExportable: props.isRowExportable,
    labelRowExport: labelRowExport(),
    localeTexts: localeTexts(),
    labelViewIndexes: labelViewIndexes(),
    totalRowExport: totalRowExport(),
    pinnedRowsExport: pinnedRowsExport(),
    footerHeight: footerHeight(),
    stickyTopInset: stickyTopInset(),
    activeToolPanelTab: toolPanel?.activeTab() ?? null,
    openToolPanel,
    closeToolPanel: toolPanel?.close ?? noop,
    find: { open: engine.find.open, close: engine.find.close, next: engine.find.next, prev: engine.find.prev },
    undoRows: history.undo,
    redoRows: history.redo,
    canUndoRows: history.canUndo,
    canRedoRows: history.canRedo,
    clearUndoHistory: history.clearHistory,
    applyRowsChange: props.onRowsChange ? history.applyRows : undefined,
    detailRowEnabled: detailRowEnabled(),
    detailIsExpandable: props.detailRow?.isExpandable,
    detailIndexCacheRef: engine.detailIndexCache,
    moveRowByKey,
    commitRowSelection: rowSelectionCommands.commitRowSelection,
    pendingRowSelection: rowSelectionCommands.pendingRowSelection,
    markApiScroll: () => {
      viewportSync.cancelFollow();
      return engine.scrollSync.markApiScroll();
    },
  }), 'render', 'gridApi');
  createEffect(
    () => vertical().physicalBodyHeight,
    () => {
      engine.gridApi.settleBottomPin();
    },
    { name: 'gridApiBottomPin' },
  );
  // 変更(0.1.0 の前の実アプリ点検 S5-01): ハンドルは部品を作った時点で ref へ渡します(DOM の ref と同じく、利用者の最初の
  //   createEffect / onSettled より前に入る。これまでは onSettled で渡していたので、そこでは undefined だった)。ハンドルの
  //   メソッドは、描き終わっていればグリッドの最初の処理(primitives/mountGate.ts)を先に済ませてから呼びます(React 版で
  //   利用者の useEffect から呼んだときと同じ状態にする)。部品の本体の中(ref の関数の中など)で呼んだときは、まだ描いて
  //   いないので先に済ませず、そのまま呼びます(コントローラの update の前なので、多くのメソッドは何もしない)。
  //   変更(段階 4 の測り直し S3-22): ref は untrack で読みます(props を作り直すオブジェクトの spread で渡すと、props が merge に
  //   なり、部品の本体で読むと開発時に Solid が STRICT_READ_UNTRACKED を出していた。ref は最初の 1 回だけ渡すもの)。
  //   変更(段階 4 の測り直し S4-23): 描く前(<Loading> の中で行を待っている間など。根の要素がまだ文書の中に無い)に状態を変える
  //   メソッドが呼ばれたら、何もしないことを開発時に 1 回知らせます(devWarnings の warnHandleCallBeforeMount)。
  const handleCallBeforeMountWarned = { current: false };
  applyHandleRef(untrack(() => props.ref), exposeHandle(engine.gridApi.handle, (method) => {
    if (mountGate.done) {
      return;
    }
    if (gridRootRef.current?.isConnected === true) {
      flushMountGate(mountGate);
    } else {
      warnHandleCallBeforeMount(handleCallBeforeMountWarned, method);
    }
  }));

  // ── 状態の通知(onStateChange / onFiltersChange / onSortChange) ──
  connectController(
    engine.stateChangeNotifier,
    () => ({
      columnWidths: ui().columnWidths,
      filters: ui().filters,
      sort: ui().sort,
      dragState: ui().dragState,
      columns: columns(),
      collapsedGroupKeys: ui().collapsedGroupKeys,
      includeGroupingInState: props.includeGroupingInState ?? false,
      onStateChange: inOwnTick(props.onStateChange),
      onFiltersChange: inOwnTick(props.onFiltersChange),
      onSortChange: inOwnTick(props.onSortChange),
    }),
    'effect',
    'stateChangeNotifier',
  );

  // React 版の onPointerMoveCapture / onPointerDownCapture / onKeyDownCapture。Solid 2.0 は oncapture: を無くしたので、
  //   capture のリスナーは自分で付けます(ref の中では onCleanup を使えないので、描き終わった後に付けて、外すのは
  //   onSettled の戻り値で)。
  onGridMounted(() => {
    const element = gridRootRef.current;
    if (!element) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      pointer.updateSelectionFromPointer(event.clientX, event.clientY);
    };
    // ポインタで操作を始めたら目印(キーボードで動かしたときだけフォーカスの枠を出す)。
    const onDown = () => element.setAttribute('data-ssg-pointer', '');
    const onKey = () => element.removeAttribute('data-ssg-pointer');
    element.addEventListener('pointermove', onMove, { capture: true });
    element.addEventListener('pointerdown', onDown, { capture: true });
    element.addEventListener('keydown', onKey, { capture: true });
    return () => {
      element.removeEventListener('pointermove', onMove, { capture: true });
      element.removeEventListener('pointerdown', onDown, { capture: true });
      element.removeEventListener('keydown', onKey, { capture: true });
    };
  });

  // ── 上下のバー(core logic/gridBarSummary の文字列。React 版の useGridBarContext と同じ) ──
  const columnNamer = createMemo(() =>
    createDataColumnNamer(orderedColumns(), {
      detail: localeTexts().detailColumnName,
      rowDrag: localeTexts().rowDragColumnName,
    }),
  );
  // 番地と行数はラベル行を飛ばして数えます(行見出しの番号とそろえる)。
  const rowNumberer = createMemo(() => createDataRowNumberer(labelViewIndexes()));
  const slotContextBase = createMemo(() => ({
    rows: rows(),
    columns: props.columns as GridColumn<T>[],
    visibleColumns: visibleColumns() as unknown as GridColumn<T>[],
    globalFilterText: globalFilterText(),
    columnFilterValues: columnFilters(),
    sortState: ui().sort,
    activeCell: ui().activeCell,
    selection: ui().selection,
  }));
  // フィルターの機能が無い構成ではフィルターが行に効かないので、状態にあっても「絞り込み: …」に数えない(React 版の
  //   filtersApplied)。
  const derivedSummary = createMemo((): SpreadsheetGridDerivedSummary => {
    const summary = buildGridDerivedSummary(
      filteringAvailable
        ? slotContextBase()
        : { ...slotContextBase(), globalFilterText: '', columnFilterValues: NO_COLUMN_FILTERS },
      // 件数はグループ行 / ラベル行を除くデータ行の数(slotContext.filteredRows と同じ)。分母(総データ行数)はラベル行を除く
      //   (ラベル行が無ければ rows の数)。サーバーサイドは rows が空なので、サーバーが返した今の条件での件数(React 版と同じ)。
      leafRowCount(),
      isServerSide() ? viewRowCount() : labelLayout()?.dataRowCount,
      columnNamer(),
      rowNumberer(),
      localeTexts(),
    );
    // サーバーで描くときとハイドレーションの間は行を空にしているので、件数(「行 0 / 0」)は出さない(上の hydrated)。
    return hydrated() ? summary : { ...summary, rowSummaryText: '' };
  });
  const setGlobalFilterText = (value: string) => dispatch(gridActions.setGlobalFilter(value));
  // 選択範囲の集計(機能 features/selectionAggregates。無い構成では常に null)。出す先が無いときは計算しない(大きな選択の
  //   走査を省く)。出す先 = 下部バー(既定 / renderBottomBar)か、自前の上部バー(renderTopBar)。既定の上部バーは集計を
  //   出さないので数えない(React 版と同じ)。
  const selectionAggregatesFeature = features.selectionAggregates;
  const selectionAggregates = selectionAggregatesFeature
    ? selectionAggregatesFeature.createSelectionAggregates<T>(() => ({
        enabled:
          (props.showSelectionAggregates ?? true) &&
          ((props.showBottomBar ?? true) || ((props.showTopBar ?? true) && props.renderTopBar !== undefined)),
        selection: ui().selection,
        viewRowCount: viewRowCount(),
        orderedColumns: orderedColumns(),
        rowModel: rowModel(),
      }))
    : () => null;
  const liveDerivedSummary = createLiveObject(DERIVED_SUMMARY_KEYS, derivedSummary);
  const slotContext = createMemo((): SpreadsheetGridSlotContext<T> => {
    const filteredRows = getFilteredRows();
    return {
      ...slotContextBase(),
      get filteredRows() {
        return filteredRows();
      },
      setGlobalFilterText,
      derivedSummary: liveDerivedSummary,
      globalFilterStatus: globalFilterStatus(),
      globalFilterProgress: globalFilterProgress(),
      selectionAggregates: selectionAggregates(),
    };
  });
  // 利用側のバー(renderTopBar / renderBottomBar)へ渡す文脈。値は読んだときに引く形にして、状態が変わるたびにはバーの関数を
  //   呼び直さない(呼び直すとバーの要素が作り直され、バーの入力欄のフォーカスと打ちかけの文字が消える。React は要素を
  //   使い回す)。JSX の中で読んだ値はその場で追従し、関数の本体で読んだ値(引数の分割代入も)はそれが変わったときに関数を
  //   呼び直す(renderCell と同じ。1 回だけ追跡せずに呼ぶと、React 版の書き方の分割代入の値が古いままだった = R1-1)。
  //   値はキーごとに memo で受けるので、変わらない値(setGlobalFilterText など)を本体で読んでも呼び直さない。
  const liveSlotContext = createLiveObject(SLOT_CONTEXT_KEYS, slotContext);
  //   関数は memo で受ける(親が props を広げ直しても、同じ関数ならバーを作り直さない)。
  const renderTopBarFn = createMemo(() => props.renderTopBar);
  const renderBottomBarFn = createMemo(() => props.renderBottomBar);
  const customTopBar = createMemo(() => {
    const render = renderTopBarFn();
    return render ? render(liveSlotContext) : undefined;
  });
  const customBottomBar = createMemo(() => {
    const render = renderBottomBarFn();
    return render ? render(liveSlotContext) : undefined;
  });
  const showTopBarSummary = () => props.showTopBarSummary ?? true;
  // 既定の上部バーの検索欄は showTopBarFilter かつグローバルフィルターが有効なとき(無効な機能の入力欄は出さない)。要約も
  //   検索欄も出さないときはバーごと描かない(空のバーを出さない。React 版と同じ)。
  const showTopBarFilter = () => (props.showTopBarFilter ?? true) && globalFilterEnabled();
  // 上下のバー(React 版と同じ選び方: 出さない → 利用側のバー → 既定のバー)。条件は Show で分け、条件が変わったときだけ
  //   作り直す(props が広げ直されても既定のバーを作り直さない)。
  const topBar = () => (
    <Show when={props.showTopBar ?? true}>
      <Show
        when={renderTopBarFn() !== undefined}
        fallback={
          <Show when={showTopBarSummary() || showTopBarFilter()}>
            <DefaultGridTopBar
              slot={slots().toolbar}
              derivedSummary={derivedSummary()}
              globalFilterText={globalFilterText()}
              setGlobalFilterText={setGlobalFilterText}
              showSummary={showTopBarSummary()}
              showFilter={showTopBarFilter()}
              showCounts={props.showTopBarCounts ?? true}
              globalFilterPlaceholder={props.globalFilterPlaceholder}
              globalFilterIcon={props.globalFilterIcon}
              // 絞り込みのチップでツールパネルのフィルターのタブを開け閉めする(フィルターかツールパネルが無ければ押せない span)。
              onFilterSummaryClick={columnFilterEnabled() && toolPanel ? toggleFilterManager : undefined}
              filterPanelOpen={toolPanel?.activeTab() === 'filter'}
            />
          </Show>
        }
      >
        {customTopBar()}
      </Show>
    </Show>
  );
  const bottomBar = () => (
    <Show when={props.showBottomBar ?? true}>
      <Show
        when={renderBottomBarFn() !== undefined}
        fallback={
          <DefaultGridBottomBar
            slot={slots().statusBar}
            derivedSummary={derivedSummary()}
            showCounts={props.showBottomBarCounts ?? true}
            selectionAggregates={selectionAggregates()}
            SelectionAggregates={selectionAggregatesFeature?.SelectionAggregates}
          />
        }
      >
        {customBottomBar()}
      </Show>
    </Show>
  );

  // ── 描画の材料 ──
  // 編集のセッション(エディタを作り直す単位。React 版の CellEditorLayer と同じ決め方): 編集が始まったとき、または
  //   位置と行 / 列のキーが両方変わったとき(閉じずに別のセルの編集が始まった)に新しくする。編集中に rows が変わって行の
  //   位置だけが動いたとき(上に行が足された / 並びが変わった)は同じセッションのまま(打ちかけの文字を残す)。
  const editorSession = createMemo((previous?: EditorSession | null): EditorSession | null => {
    const cell = ui().editingCell;
    if (cell === null) {
      return null;
    }
    // 行が無い(編集中の行が rows から消えた直後。core の editController が編集を終えるまでの間)ときはキーを読まず
    //   (rowKeyGetter に undefined を渡すと利用側の関数が例外を投げ、Solid の反応が止まる)、今のセッションのまま待つ
    //   (React 版の CellEditorLayer も、行の無い間は editorSession が null で前の位置とキーを保つ。監査 RD-3)。
    const model = rowModel();
    if (model.getRow(cell.row) === undefined) {
      return previous ?? { id: 1, identity: null };
    }
    const identity: EditorIdentity = {
      row: cell.row,
      col: cell.col,
      rowKey: model.getRowKey(cell.row),
      columnKey: orderedColumns()[cell.col]?.key,
    };
    if (!previous) {
      return { id: 1, identity };
    }
    if (previous.identity === null) {
      return { id: previous.id, identity };
    }
    const moved = identity.row !== previous.identity.row || identity.col !== previous.identity.col;
    if (!moved) {
      // 同じ位置でキーだけ変わった(rows の差し替えの直後で、位置の付け替えの前)は前のキーのまま待つ。
      return previous;
    }
    const rekeyed =
      !Object.is(identity.rowKey, previous.identity.rowKey) || identity.columnKey !== previous.identity.columnKey;
    return { id: rekeyed ? previous.id + 1 : previous.id, identity };
  });
  const editorSessionId = createMemo(() => editorSession()?.id ?? null);
  // 編集中のセルの情報(行 / 位置 / 値)。エディタが select の行で決まる候補・開いたときのハイライト・custom の ctx に使う
  //   (編集中だけ非 null。React 版の GridShell の editorSession と同じ)。
  // 編集中の列(エディタの種類と揃えは行に依らず列から引く。React 版の editingColumn と同じ)。
  const editingColumn = createMemo(() => {
    const cell = ui().editingCell;
    return cell === null ? undefined : (orderedColumns()[cell.col] as unknown as GridColumn<T> | undefined);
  });
  const editingSessionInfo = createMemo((): CellEditorSession<T> | null => {
    const cell = ui().editingCell;
    if (cell === null) {
      return null;
    }
    const column = orderedColumns()[cell.col];
    const model = rowModel();
    const row = model.getRow(cell.row);
    if (!column || !row) {
      return null;
    }
    return {
      row,
      rowIndex: cell.row,
      sourceRowIndex: model.getSourceIndex(cell.row) ?? cell.row,
      rowKey: model.getRowKey(cell.row) ?? cell.row,
      colIndex: cell.col,
      column: column as unknown as GridColumn<T>,
      value: getCellValue(row, column),
    };
  });
  // ポップアップ(select の候補の一覧)へ付ける修飾子(テーマ + モーション。React 版の portalClassName)。
  const portalClassName = () =>
    [themeClassName(), resolvedMotion() === 'off' ? MOTION_OFF_CLASS_NAME : undefined].filter(Boolean).join(' ') || undefined;
  // renderCell の ctx.setValue: 呼ばれた時点で、描いた行のキーから今の位置を引き直して書く(React 版は描き直しのたびに
  //   描いた時点の rows / rowModel を渡す。Solid 版は中身を作り直さないので、今の値と行のキーで同じ行へ書く)。
  //   行が消えていれば書かない。
  const writeRenderedCellValue = (rowKey: GridRowKey, column: UnboundGridColumn<T>, nextValue: unknown) => {
    const viewIndex = engine.gridApi.handle.getViewRowIndex(rowKey);
    if (viewIndex < 0) {
      return;
    }
    const model = untrack(rowModel);
    const row = model.getRow(viewIndex);
    if (row === undefined) {
      return;
    }
    writeCellValueTo(
      { rows: untrack(rows), rowModel: model, handleRowsChange: untrack(handleRowsChange), applyServerSideCellEdits: untrack(applyServerSideCellEdits) },
      viewIndex,
      row,
      column,
      nextValue,
    );
  };
  // セルの中身。行と列が変わったときだけ作り直す(行の位置とアクティブ / 選択などの状態は cell から読んだときに引く)。
  //   行の並び(rowModel)や rows そのものは読まない(1 セルの編集で表のすべての renderCell を作り直さないように)。
  //   renderCell の本体で位置や状態を読めば、それが変わったときにその列のセルだけ作り直す(React で毎回呼ぶのと同じ結果)。
  // 行ドラッグのハンドル列のセル。isRowDraggable が false の行には出さない(React 版の renderHandleCell と同じ)。押した時点の
  //   行の位置でドラッグを始めます。
  const RowDragHandle = rowDragFeature?.RowDragHandle;
  const rowDragTexts = () => localeTexts() as unknown as { dragRow: string; dragRowDisabled: string };
  const renderRowDragHandleCell = (row: T, cell: GridCellContentContext): JSX.Element => {
    if (!RowDragHandle || !rowDrag) {
      return null;
    }
    const draggable = createMemo(() => {
      const isRowDraggable = props.isRowDraggable;
      return !isRowDraggable || isRowDraggable(row, { rowKey: cell.rowKey, sourceRowIndex: cell.sourceRowIndex });
    });
    return (
      <Show when={draggable()}>
        <RowDragHandle
          operable={rowDragOperable()}
          tooltip={rowDragOperable() ? rowDragTexts().dragRow : rowDragTexts().dragRowDisabled}
          onPointerDown={(event) => rowDrag.onRowDragHandlePointerDown(untrack(() => cell.rowIndex), event)}
        />
      </Show>
    );
  };
  const renderCellContent = (currentRow: () => T, column: GridColumn<T>, cell: GridCellContentContext): JSX.Element => {
    // 行ドラッグのハンドル列(合成列)の中身(機能 rowDrag)。
    if (column.key === ROW_DRAG_HANDLE_COLUMN_KEY) {
      return renderRowDragHandleCell(currentRow(), cell);
    }
    const unbound = column as unknown as UnboundGridColumn<T>;
    // checkbox 列の既定のセルは、行が変わっても作り直さず印だけを追従させます(値は描いた後に読む)。押すたびに作り直すと
    //   ダブルクリックの 2 回目の的が外れた要素になり、onCellDoubleClick が届かなかった(React 版は同じ要素を使い回す)。
    if (!column.renderCell && column.editor?.type === 'checkbox') {
      const editor = column.editor;
      return (
        <CheckboxCell
          slot={slots().checkbox}
          label={column.title || column.key}
          checked={isCheckboxChecked(getCellValue(currentRow(), unbound), editor)}
          readOnly={cell.readOnly}
          onToggle={() => cells.toggleCheckbox({ row: cell.rowIndex, col: cell.colIndex })}
        />
      );
    }
    if (column.renderCell) {
      // 変更(段 3-3 / R5-3): ctx.row / ctx.value は読んだときに引きます(位置や状態と同じ)。これまでは行が変わるたびに
      //   renderCell を呼び直して中身を作り直したので、セルの中の入力欄で打つたびに ctx.setValue すると 1 文字目でフォーカスが
      //   外れていました(React 版は同じ要素を使い回す)。JSX の中で読めばその式だけが追従し、関数の本体で読めば(引数の
      //   分割代入も)今までどおりそれが変わったときに呼び直します。
      const cellValue = createMemo(() => getCellValue(currentRow(), unbound));
      // ctx.detail(任意のセルからの展開行の開閉の口)。detailRow の指定がある間だけ渡し、値は読んだときに引きます。
      //   開閉は押した時点の行の位置で(React 版は描いた時点の位置。描き直すたびに新しくなるので同じ)。
      //   expanded / expandable はこのセルの行の値だけの memo(開いている行の集合ぜんたいを読むと、どれか 1 行の開閉で
      //   本体でこれを読むその列のすべてのセルを作り直すため)。
      const expanded = createMemo(() => ui().expandedDetailRowKeys.has(cell.rowKey));
      const expandable = createMemo(() =>
        isDetailRowExpandable(detailDrawable(), props.detailRow?.isExpandable, currentRow(), cell.rowKey, cell.sourceRowIndex),
      );
      const detail: CellDetailContext = {
        get expanded() {
          return expanded();
        },
        get expandable() {
          return expandable();
        },
        toggle: () => detailRows.toggleAt(cell.rowKey, untrack(() => cell.rowIndex)),
        setExpanded: (expanded: boolean) => detailRows.setExpandedAt(cell.rowKey, untrack(() => cell.rowIndex), expanded),
      };
      // 展開トグル列(合成列)。開閉できる行だけ ▸ / ▾ を出し、読み上げの名前は「行 7 の詳細を開く」(行見出しと同じ番号)。
      if (column.key === DETAIL_TOGGLE_COLUMN_KEY) {
        const rowNumber = () => {
          const indexes = labelViewIndexes();
          return indexes ? resolveDataRowNumber(indexes, cell.rowIndex) : cell.rowIndex + 1;
        };
        return (
          <Show when={expandable()}>
            <DetailToggleButton detail={detail} rowNumber={rowNumber()} onPress={edit.endEditLeftOpen} />
          </Show>
        );
      }
      return column.renderCell({
        get row() {
          return currentRow();
        },
        get rowIndex() {
          return cell.rowIndex;
        },
        get sourceRowIndex() {
          return cell.sourceRowIndex;
        },
        rowKey: cell.rowKey,
        get colIndex() {
          return cell.colIndex;
        },
        get detail() {
          return detailRowEnabled() ? detail : undefined;
        },
        get value() {
          return cellValue();
        },
        column,
        get isActive() {
          return cell.isActive;
        },
        get isSelected() {
          return cell.isSelected;
        },
        get isEditing() {
          return cell.isEditing;
        },
        get readOnly() {
          return cell.readOnly;
        },
        setValue: (nextValue: unknown) => writeRenderedCellValue(cell.rowKey, unbound, nextValue),
      });
    }
    const row = currentRow();
    const value = getCellValue(row, unbound);
    const text = column.valueFormatter ? column.valueFormatter({ value, row, column }) : String(value ?? '');
    // セル内検索のヒットを <mark> にします(既定のセルだけ。カレントは --current)。ヒットとカレントは cell から読んだときに引く
    //   ので、変わったときは中の文字だけを描き直します(セルの箱と中身の span はそのまま)。
    const splitFind = findFeature?.splitTextByFindRanges;
    const highlightFind = (content: string): JSX.Element => {
      const ranges = cell.findRanges;
      if (!splitFind || !ranges || ranges.length === 0) {
        return content;
      }
      return splitFind(content, ranges).map((segment) => {
        const range = segment.range;
        return range ? (
          <mark class={['ssg-find-mark', { 'ssg-find-mark--current': range.matchIndex === cell.findCurrentIndex }]}>
            {segment.text}
          </mark>
        ) : (
          segment.text
        );
      });
    };
    // 条件付き書式: データバーの showValue: false は文字を出さない(帯は GridBodyLayer が描く)。機能セットに無ければ指定を無視。
    //   valueFormatter は React 版と同じく先に呼ぶ。
    const formatRules = conditionalFormatFeature ? unbound.conditionalFormat : undefined;
    if (formatRules?.dataBar?.showValue === false) {
      return null;
    }
    // 状態チップ(値 → 色味 / 指定)。ラベルの省略時は表示の文字。チップの関数が位置や状態を読んだときは、その式だけが追従する。
    const chips = formatRules?.chips;
    if (conditionalFormatFeature && chips) {
      const { GridChip, resolveChipSpec } = conditionalFormatFeature;
      const chip = createMemo(() =>
        resolveChipSpec<T>(chips, {
          row,
          get rowIndex() {
            return cell.rowIndex;
          },
          get sourceRowIndex() {
            return cell.sourceRowIndex;
          },
          rowKey: cell.rowKey,
          get colIndex() {
            return cell.colIndex;
          },
          value,
          column: unbound,
          get isActive() {
            return cell.isActive;
          },
          get isSelected() {
            return cell.isSelected;
          },
          get isEditing() {
            return cell.isEditing;
          },
          get readOnly() {
            return cell.readOnly;
          },
        }),
      );
      return (
        <Show when={chip()} fallback={<span class="ssg-cell-value">{highlightFind(text)}</span>}>
          {(spec) => <GridChip spec={spec()}>{highlightFind(spec().label ?? text)}</GridChip>}
        </Show>
      );
    }
    return <span class="ssg-cell-value">{highlightFind(text)}</span>;
  };

  const pinnedPaneStyle = (side: 'left' | 'right', width: number, hasContent: boolean): JSX.CSSProperties => ({
    position: 'sticky',
    ...(side === 'left' ? { left: '0' } : { right: '0' }),
    width: px(width),
    'min-width': px(width),
    'flex-shrink': 0,
    'align-self': 'stretch',
    'z-index': 2,
    ...(hasContent
      ? side === 'left'
        ? { 'border-right': '1px solid var(--ssg-pane-border)', 'box-shadow': 'var(--ssg-pane-shadow-left)' }
        : { 'border-left': '1px solid var(--ssg-pane-border)', 'box-shadow': 'var(--ssg-pane-shadow-right)' }
      : {}),
  });

  // 1 つのペインの中身(見出し + 本体の層)。左 / 中央 / 右で同じ。
  const renderPane = (
    pane: ColumnPane,
    width: () => number,
    leadingWidth: () => number,
    ownsRowHeader: () => boolean,
    entries: () => readonly PaneColumnEntry<T>[],
  ) => {
    const bodyHeight = () => headerHeight() + vertical().physicalBodyHeight;
    const activeRect = () => placementRectInPane(activeCellPlacement(), pane);
    const editorRect = () => placementRectInPane(editingCellPlacement(), pane);
    // 表示だけの行(固定行 / 合計行)に入ったら行ホバーを外す(直前にいた本体の行を強調したままにしない)。
    const clearHoveredRow = () => applyHoveredRowChange(null);
    const renderPinnedRows = (position: 'top' | 'bottom') =>
      PinnedRows ? (
        <Show when={position === 'top' ? pinnedTop() : pinnedBottom()}>
          {(pinnedRows) => (
            <PinnedRows
              pane={pane}
              position={position}
              ownsRowHeader={ownsRowHeader()}
              leadingWidth={leadingWidth()}
              rowHeaderWidth={rowHeaderWidth()}
              rows={pinnedRows() as readonly T[]}
              rowHeight={rowHeight()}
              stickyOffset={position === 'top' ? columnHeaderHeight() : pinnedBelowTotal() ? 0 : totalRowHeight()}
              bodyHeight={position === 'top' || pinnedBelowTotal() ? 0 : vertical().physicalBodyHeight}
              entries={entries()}
              rowKeyGetter={resolvedRowKeyGetter()}
              ariaRowIndexStart={
                position === 'top' ? 2 : viewRowCount() + 2 + pinnedTopCount() + (pinnedBelowTotal() ? 1 : 0)
              }
              getRowClassName={props.getRowClassName}
              showCellOverflowTooltip={props.showCellOverflowTooltip ?? false}
              conditionalFormat={conditionalFormatFeature}
              conditionalFormatStats={conditionalFormatStats()}
              slots={slots()}
              onPointerEnter={clearHoveredRow}
            />
          )}
        </Show>
      ) : null;
    const renderTotalRow = () =>
      TotalRow ? (
        <Show when={totalRowEnabled()}>
          <TotalRow
            pane={pane}
            ownsRowHeader={ownsRowHeader()}
            leadingWidth={leadingWidth()}
            rowHeaderWidth={rowHeaderWidth()}
            // 下の固定行があるときは本体ぶんの空きは固定行の器が持つ(合計行はその直後)。下の固定行を合計行の下に置くときは
            //   合計行が持ち、sticky の bottom を固定行の高さぶん上げる。
            bodyHeight={pinnedBottom() && !pinnedBelowTotal() ? 0 : vertical().physicalBodyHeight}
            stickyBottom={pinnedBelowTotal() ? pinnedBottomCount() * rowHeight() : 0}
            height={totalRowHeight()}
            entries={entries()}
            cells={totalRowCells()}
            label={totalRowLabel()}
            labelColumnKey={totalRowLabelColumnKey()}
            ariaRowIndex={viewRowCount() + 2 + pinnedTopCount() + (pinnedBelowTotal() ? 0 : pinnedBottomCount())}
            renderCell={totalRowOptions()?.renderCell}
            rowClassName={totalRowSlot().className}
            rowStyle={totalRowSlot().style}
            slots={slots()}
            onPointerEnter={clearHoveredRow}
          />
        </Show>
      ) : null;
    return (
      <div
        style={{
          position: 'relative',
          overflow: 'clip',
          width: px(width()),
          'min-width': px(width()),
          // 下端に固定する行(合計行 / 下の固定行。箱の下端の sticky の行)の高さを足す。
          height: px(bodyHeight() + footerHeight()),
        }}
      >
        <GridHeaderRow<T>
          pane={pane}
          ownsRowHeader={ownsRowHeader()}
          leadingWidth={leadingWidth()}
          headerHeight={columnHeaderHeight()}
          rowHeaderWidth={rowHeaderWidth()}
          slots={slots()}
          isCornerHovered={view().isCornerHovered}
          isWholeGridSelected={isWholeGridSelected()}
          showSelectAllCheckbox={enableSelectAllRows()}
          selectAllState={selectAllRowsState()}
          filteredRowsLength={viewRowCount()}
          visibleColumnsLength={visibleColumns().length}
          entries={entries()}
          hoveredColumnIndex={view().hoveredColumnIndex}
          selection={selectionSnapshot()}
          // フィルターの機能が無い構成ではフィルターが行に効かないので、見出しのフィルター中の印も出さない(React 版と同じ)。
          columnFilterValues={filteringAvailable ? columnFilters() : NO_COLUMN_FILTERS}
          sort={ui().sort}
          enableColumnResize={enableColumnResize()}
          onCornerPointerDown={handleCornerHeaderPointerDown}
          onCornerPointerEnter={() => setIsCornerHovered(true)}
          onCornerPointerLeave={() => setIsCornerHovered(false)}
          onColumnHeaderPointerDown={pointer.handleColumnHeaderPointerDown}
          onColumnHeaderPointerEnter={pointer.handleColumnHeaderPointerEnter}
          onColumnHeaderPointerLeave={handleColumnHeaderPointerLeave}
          onColumnResizePointerDown={(column, event) =>
            columnCommands.handleColumnResizePointerDown(column as unknown as UnboundGridColumn<T>, event)
          }
          onColumnDragHandlePointerDown={columnDragHandler()}
          enableColumnMenu={columnMenuEnabled()}
          openedMenuColumnKey={columnMenu?.openedColumnKey() ?? null}
          onColumnMenuButtonPointerDown={openColumnMenuFromButton}
          onColumnMenuButtonClick={columnMenu?.openFromButtonClick}
          onColumnHeaderContextMenu={columnMenu?.openFromContextMenu}
        />
        {/* 上に固定する行(列見出しの直後の sticky の器)。 */}
        {renderPinnedRows('top')}
        {/* ラベル行の縦スクロールの固定の層(見出しの直後の sticky。中身は中央ペインだけ)。 */}
        {StickyLabelLayer ? (
          <StickyLabelLayer
            pane={pane}
            ownsRowHeader={ownsRowHeader()}
            entry={stickyLabelEntry()}
            headerHeight={headerHeight()}
            rowHeaderWidth={rowHeaderWidth()}
            renderContent={pane === 'center' ? renderLabelRowContent() : null}
            contentStickyLeft={pane === 'center' ? detailCardStickyLeft() : 0}
            contentWidth={pane === 'center' ? detailCardWidth() : 0}
            rowClassName={stickyLabelSlot().className}
            rowStyle={stickyLabelSlot().style}
            slots={slots()}
          />
        ) : null}
        <div
          style={{
            position: 'absolute',
            top: '0',
            left: '0',
            width: px(width()),
            height: px(bodyHeight()),
            transform: vertical().bodyLayerTransform,
          }}
        >
          <For each={selectionRectsForPane(pane)} keyed={false}>
            {(rect) => (
              <Overlay
                class="ssg-selection-overlay"
                slot={slots().selectionOverlay}
                rect={rect()}
                headerHeight={headerHeight()}
                leadingWidth={leadingWidth()}
                baseOffset={vertical().overlayBaseOffset}
              />
            )}
          </For>
          {motionExtrasFeature
            ? (() => {
                const { CopyRangeOverlay, ColumnHoverOverlay } = motionExtrasFeature;
                return (
                  <>
                    <For each={copyRectsForPane(pane)} keyed={false}>
                      {(rect) => (
                        <CopyRangeOverlay
                          slot={slots().copyRangeOverlay}
                          rect={rect()}
                          headerHeight={headerHeight()}
                          leadingWidth={leadingWidth()}
                          baseOffset={vertical().overlayBaseOffset}
                        />
                      )}
                    </For>
                    <ColumnHoverOverlay
                      rect={columnHoverRectForPane(pane)}
                      headerHeight={headerHeight()}
                      leadingWidth={leadingWidth()}
                      baseOffset={vertical().overlayBaseOffset}
                    />
                  </>
                );
              })()
            : null}
          <Overlay
            class="ssg-active-cell-overlay"
            slot={slots().activeCellOverlay}
            rect={activeRect()}
            headerHeight={headerHeight()}
            leadingWidth={leadingWidth()}
            baseOffset={vertical().overlayBaseOffset}
          />
          {/* フィルハンドル: ハンドル / ドラッグ中の点線 / 埋めたあとのボタン。 */}
          {fill && fillHandleFeature ? (
            <fillHandleFeature.FillHandleLayer
              fill={fill}
              pane={pane}
              headerHeight={headerHeight()}
              leadingWidth={leadingWidth()}
              baseOffset={vertical().overlayBaseOffset}
            />
          ) : null}
          <CellEditorLayer<T>
            rect={editorRect()}
            sessionId={editorSessionId()}
            headerHeight={headerHeight()}
            leadingWidth={leadingWidth()}
            baseOffset={vertical().overlayBaseOffset}
            initialValue={() => view().editorInitialValue ?? store.getViewState().editorInitialValue ?? ''}
            editor={editingColumn()?.editor}
            session={editingSessionInfo()}
            themeClassName={portalClassName()}
            slots={slots()}
            onCommit={(value: unknown, direction?: EditorCommitDirection) => edit.commitEdit(value, direction)}
            onCancel={edit.cancelEdit}
            onRegisterFlush={edit.registerDraftFlush}
            onRegisterLateCommit={edit.registerLateCommitReceiver}
            align={editingColumn()?.align}
            enterMove={props.editorEnterMove}
            domId={cellEditorDomId}
            // 編集中のセルが上にそろえて描かれているか(GridBodyLayer の alignTop と同じ条件。複数行のエディタの 1 行目を
            //   セルの文字にそろえる)。
            alignTop={editorAlignTop()}
          />
          <GridBodyLayer<T>
            pane={pane}
            ownsRowHeader={ownsRowHeader()}
            leadingWidth={leadingWidth()}
            rowHeight={rowHeight()}
            autoHeight={autoHeightActive()}
            verticalAlign={props.verticalAlign}
            conditionalFormat={conditionalFormatFeature}
            conditionalFormatStats={conditionalFormatStats()}
            findIndex={findIndex()}
            findCurrentIndex={findCurrentIndex()}
            grouping={groupingFeature}
            collapsedGroupKeys={ui().collapsedGroupKeys}
            onGroupToggle={handleGroupToggle}
            labelRowLayer={pane === 'center' ? labelRowLayerCenter() : labelRowLayerBand()}
            skeletonRow={isServerSide() ? serverSideFeature?.BodySkeletonRow : undefined}
            labelViewIndexes={labelViewIndexes()}
            rowHeaderWidth={rowHeaderWidth()}
            rows={bodyRows()}
            entries={entries()}
            rowModel={rowModel()}
            ariaRowOffset={pinnedTopCount()}
            activeCell={ui().activeCell}
            editingCell={ui().editingCell}
            selection={selectionSnapshot()}
            isWholeGridSelected={isWholeGridSelected()}
            hoveredRowIndex={resolvedHoveredRowIndex()}
            enableRowSelection={enableRowSelection()}
            rowSelectionState={ui().rowSelection}
            readOnly={readOnly()}
            canEditCell={canEditCell()}
            showValidationMarks={props.showValidationMarks ?? true}
            showCellOverflowTooltip={props.showCellOverflowTooltip ?? false}
            getRowClassName={props.getRowClassName}
            slots={slots()}
            activeCellDomId={activeCellDomId}
            cellEditorDomId={cellEditorDomId}
            renderCellContent={renderCellContent}
            onRowHeaderPointerDown={pointer.handleRowHeaderPointerDown}
            onRowHeaderPointerEnter={pointer.handleRowHeaderPointerEnter}
            onRowHeaderPointerLeave={handleRowHeaderPointerLeave}
            onCellPointerDown={pointer.handleCellPointerDown}
            onCellPointerEnter={pointer.handleCellPointerEnter}
            onCellClick={engine.cellEventNotifier.handleCellClick}
            onCellDoubleClick={pointer.handleCellDoubleClick}
          />
          <GridDetailLayer<T>
            entries={vertical().detailEntries}
            mode={pane === 'center' ? 'center' : 'band'}
            paneWidth={width()}
            cardStickyLeft={pane === 'center' ? detailCardStickyLeft() : 0}
            cardWidth={pane === 'center' ? detailCardWidth() : 0}
            cardSlot={detailCardSlot()}
            slots={slots()}
            rowModel={rowModel()}
            renderCard={detailRender()}
            onCollapse={collapseDetailRow}
            onCardKeyDown={detailRows.handleCardKeyDown}
            onCardFocusLost={detailRows.handleCardFocusLost}
          />
          {/* 行ドロップの位置のガイド線(左固定ペイン、または左固定ペインが無いときの中央 = 最左はキャップ付き)。 */}
          {renderRowDropIndicator(pane, () => pane === 'left' || (pane === 'center' && ownsRowHeader()))}
        </div>
        {/* 下端の行(本体ぶんの空きの直後 = 箱の下端の sticky の行)。既定は下の固定行 → 合計行、'belowTotal' は合計行 → 固定行。 */}
        <Show when={pinnedBelowTotal()} fallback={[renderPinnedRows('bottom'), renderTotalRow()]}>
          {renderTotalRow()}
          {renderPinnedRows('bottom')}
        </Show>
        {/* 中央ペインのドロップの縦線(左右のペインは、固定列が 0 本でも線を出せるよう外側の器に置く。React 版と同じ)。 */}
        {pane === 'center' ? renderColumnDropIndicator('center') : null}
      </div>
    );
  };

  // aria-activedescendant は参照先のセルが描かれているときだけ(activeCellRendered)。
  const activeDescendantId = () => (activeCellRendered() ? activeCellDomId : undefined);

  // サーバーサイドは rows がいつも空なので、絞り込みの条件があるかで文言を分ける(React 版と同じ)。
  const emptyStateText = () =>
    (isServerSide() ? !filterConditionsActive() : rows().length === 0 && !manualFilterActive())
      ? (props.noRowsText ?? localeTexts().noRows)
      : (props.noMatchingRowsText ?? localeTexts().noMatchingRows);

  // 根の style(段 3-5 のサーバーの骨組みでは、この上に display: none を重ねる。見せるときは revealServerFrame がこの display へ戻す)。
  const rootStyle = (): JSX.CSSProperties => ({
    ...toSolidStyle(heightLayout().rootStyle),
    ...slots().root?.style,
    ...props.style,
  });

  const shellView = (
    <GridLocaleTextContext value={localeTexts}>
      <GridPortalContext value={portalContext}>
      <div
        // 変更(1.4.1): サーバーで隠す骨組みには ssg-root を付けません(サーバーの HTML の .ssg-root を写しの 1 つだけにする =
        //   React 版と同じ。1.4.0 は 2 つ並んでいた)。見せるときに revealServerFrame が付けます。
        class={[
          mode === 'hiddenFrame' ? undefined : 'ssg-root',
          themeClassName(),
          slots().root?.className,
          props.className,
          {
            [`ssg-root--density-${density()}`]: density() !== 'standard',
            [MOTION_OFF_CLASS_NAME]: resolvedMotion() === 'off',
            'ssg-root--selecting': ui().dragState?.type === 'selection',
            'ssg-root--filling': fill?.filling() ?? false,
            'ssg-root--animate-rows': animateRowsActive(),
            'ssg-root--dim-readonly': props.dimReadOnlyCells ?? false,
            'ssg-root--fill-height': heightLayout().fillParent,
            // クロスヘア(列見出し / 行番号を選択の色で染める。列の帯は ColumnHoverOverlay)。
            'ssg-root--hover-cross': hoverCross(),
          },
        ]}
        style={{
          ...rootStyle(),
          ...(mode === 'hiddenFrame' ? { display: 'none' } : undefined),
        }}
        // 段 3-5 の印(primitives/serverSnapshot の SERVER_FRAME_ATTRIBUTE / SERVER_SNAPSHOT_ATTRIBUTE。サーバーでだけ付く)。
        //   隠した骨組みには hidden も付ける(兄弟を `:not([hidden])` で数える CSS = Tailwind v3 の space-y-* などが、写しを
        //   2 つめの子として余白を付け、見せたときに位置がずれていた。段 3-9 のレビュー)。
        hidden={mode === 'hiddenFrame' ? true : undefined}
        data-ssg-ssr={mode === 'hiddenFrame' ? '' : undefined}
        data-ssg-ssr-snapshot={mode === 'snapshot' ? '' : undefined}
      >
        {topBar()}
        {/* フィルターのチップのバー(showFilterChipBar)。適用中の列フィルターをチップで並べる(0 件なら出さない)。 */}
        {filterManagement && filteringFeature ? (
          <Show when={props.showFilterChipBar}>
            <filteringFeature.FilterChipBar
              slot={slots().filterChipBar}
              entries={filterManagement.entries()}
              canFilter={columnFilterEnabled()}
              onEditFilter={filterManagement.jumpToColumnFilter}
              onClearFilter={columnCommands.handleFilterManagerClearFilter}
              onClearAllFilters={columnCommands.handleFilterManagerClearAll}
            />
          </Show>
        ) : null}
        <div
          ref={(element) => {
            gridRootRef.current = element;
          }}
          class="ssg-shell"
          style={{ cursor: isAutosizing() ? 'progress' : undefined }}
          // ポップアップを出している間はシェルを Tab の止まる先から外します(React 版と同じ)。
          tabindex={isAnyGridPopupOpen() ? -1 : 0}
          role="group"
          aria-activedescendant={activeDescendantId()}
          data-ssg-has-active-cell={ui().activeCell === null ? undefined : ''}
          onKeyDown={handleShellKeyDown}
          onPaste={(event) => {
            // ポップアップを出している間は貼り付けを受けません(React 版はハンドラを外す)。
            if (untrack(isAnyGridPopupOpen)) {
              return;
            }
            clipboard.handlePaste({
              clipboardData: event.clipboardData,
              preventDefault: () => event.preventDefault(),
              target: event.target,
            });
          }}
          // 本体の右クリックの委譲(機能が無い・enableContextMenu でない・対象が無いときは素通しで標準のメニュー)。
          onContextMenu={handleBodyContextMenu}
          onDragStart={(event) => pointer.handleNativeDragStart(event)}
          onPointerLeave={() => {
            applyHoveredRowChange(null);
            // クロスヘアの列のホバーも本体から出たら消す。
            if (hoverCross()) {
              setHoveredColumnIndex(null);
            }
          }}
          // ラベル行(全幅の帯。固定した帯も)には行のホバーも列の帯も出さない(ラベル行にはセルの pointerenter が無いので、
          //   セルからラベル行へ動かしたときに前の行のホバーと列の帯が残る。React 版と同じ)。
          onPointerOver={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest('[data-ssg-label-row], [data-ssg-sticky-label]') !== null
            ) {
              applyHoveredRowChange(null);
              if (hoverCross()) {
                setHoveredColumnIndex(null);
              }
            }
          }}
          onFocusOut={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null) && document.hasFocus()) {
              event.currentTarget.removeAttribute('data-ssg-pointer');
            }
          }}
        >
          <div
            ref={(element) => {
              scrollContainerRef.current = element;
            }}
            tabindex={-1}
            onFocusIn={(event) => {
              if (event.target === event.currentTarget) {
                gridRootRef.current?.focus({ preventScroll: true });
                // 追加(1.4.1 / AP-11 のレビュー): 表の余白を押したときも、開いたままの custom エディタの編集を終えます。
                edit.endEditLeftOpen();
              }
            }}
            role="grid"
            aria-label={props.ariaLabel}
            aria-rowcount={viewRowCount() + 1 + pinnedTopCount() + pinnedBottomCount() + (totalRowEnabled() ? 1 : 0)}
            aria-colcount={orderedColumns().length + 1}
            aria-multiselectable={enableRangeSelection() ? 'true' : undefined}
            aria-readonly={readOnly() ? 'true' : undefined}
            // カスタムスクロールバーのときはネイティブの縦のバーを隠し、右端にガターぶんの余白を空ける(GridScrollHint が描く)。
            class={['ssg-scroll-container', { 'ssg-scroll-container--custom-scrollbar': customScrollbar() }]}
            style={toSolidStyle(heightLayout().scrollContainerStyle)}
          >
            <div
              class="ssg-inner-row"
              style={{
                width: px(paneResolution().totalScrollWidth),
                'min-width': px(paneResolution().totalScrollWidth),
                height: px(headerHeight() + vertical().physicalBodyHeight + footerHeight()),
              }}
            >
              <div
                ref={(element) => {
                  leftPaneScrollRef.current = element;
                }}
                style={pinnedPaneStyle('left', paneResolution().leftPaneTotalWidth, paneLayout().left.entries.length > 0)}
              >
                <Show when={paneResolution().hasLeftPane}>
                  {renderPane(
                    'left',
                    () => paneResolution().leftPaneTotalWidth,
                    () => paneResolution().leftLeadingWidth,
                    () => true,
                    () => paneLayout().left.entries,
                  )}
                </Show>
                {renderColumnDropIndicator('left')}
              </div>
              <div
                ref={(element) => {
                  bodyScrollRef.current = element;
                }}
                class="ssg-center-pane"
                style={{
                  width: px(paneResolution().centerContentWidth),
                  'min-width': px(paneResolution().centerContentWidth),
                }}
              >
                {renderPane(
                  'center',
                  () => paneResolution().centerContentWidth,
                  () => paneResolution().centerLeadingWidth,
                  () => paneResolution().centerOwnsRowHeader,
                  centerRenderEntries,
                )}
              </div>
              <div
                ref={(element) => {
                  rightPaneScrollRef.current = element;
                }}
                style={pinnedPaneStyle('right', paneResolution().rightPaneTotalWidth, paneLayout().right.entries.length > 0)}
              >
                <Show when={paneResolution().hasRightPane}>
                  {renderPane(
                    'right',
                    () => paneResolution().rightPaneTotalWidth,
                    () => paneResolution().rightLeadingWidth,
                    () => false,
                    () => paneLayout().right.entries,
                  )}
                </Show>
                {renderColumnDropIndicator('right')}
              </div>
            </div>
            <Show when={viewRowCount() === 0 && hydrated()}>
              <div class={['ssg-empty-state', slots().emptyState?.className]} style={slots().emptyState?.style}>
                {emptyStateText()}
              </div>
            </Show>
          </div>
          <span
            ref={(element) => {
              tableExitRef.current = element;
            }}
            class="ssg-tab-exit"
            // Tab の順番に入れるのは展開行のカードが描かれているときだけ(段階 2 C-N2)。
            tabindex={hasDetailCards() ? 0 : -1}
            // Tab の順番に入れている間は aria-hidden を付けない(フォーカスできる要素を隠すと読み上げで迷う。1.3.0 / S6-02)。
            //   中身は空で、フォーカスが来たらすぐ表の外へ移す。
            aria-hidden={hasDetailCards() ? undefined : 'true'}
            onFocus={(event) => detailRows.handleTableExitFocus(event.relatedTarget)}
          />
          <Show when={scrollHintFeature !== undefined && activeScrollHint()}>
            {(options) => {
              const ScrollHint = scrollHintFeature!.ScrollHint;
              return (
                <ScrollHint<T>
                  slot={slots().scrollHint}
                  options={options()}
                  scrollContainerRef={scrollContainerRef}
                  scrollTop={viewScrollTop()}
                  viewportHeight={viewportHeight()}
                  headerHeight={headerHeight()}
                  physicalBodyHeight={vertical().physicalBodyHeight}
                  verticalScaleFactor={vertical().verticalScaleFactor}
                  rowMetrics={vertical().rowMetrics}
                  rowModel={rowModel()}
                  labelViewIndexes={labelViewIndexes()}
                />
              );
            }}
          </Show>
          {/* 列幅の自動調整の計測中の overlay(遅れて出す。pointer-events: none で操作は素通し)。 */}
          <Show when={isAutosizing()}>
            <div class="ssg-autosize-overlay">
              <span class="ssg-autosize-pill">{localeTexts().sizingColumns}</span>
            </div>
          </Show>
          {/* グローバルフィルターの適用中の overlay(しきい値を超える表の時間分割の間だけ。pointer-events: none)。 */}
          <Show when={globalFilterStatus() === 'filtering'}>
            <div class="ssg-filter-overlay">
              <span class="ssg-filter-overlay-chip" role="status" aria-live="polite">
                <span class="ssg-filter-spinner" aria-hidden="true" />
                <span class="ssg-filter-overlay-text">
                  {formatLocaleText(localeTexts().applyingFilter, { percent: Math.round(globalFilterProgress() * 100) })}
                </span>
              </span>
            </div>
          </Show>
          {/* セル内検索のバー(右上に浮く。見出しの直下)。開いているときだけ描きます。 */}
          <Show when={findSnapshot().open}>
            {FindBar && (
              <FindBar
                snapshot={findSnapshot()}
                headerHeight={headerHeight()}
                onQueryChange={engine.find.setQuery}
                onNext={engine.find.next}
                onPrev={engine.find.prev}
                onClose={closeFindAndRefocus}
                slot={slots().findBar}
              />
            )}
          </Show>
          {/* サーバーサイドのエラーバー(取得の失敗の再試行 / 保存の失敗。機能 features/serverSide の部品)。 */}
          {serverSide && serverSideFeature ? (
            <Show when={isServerSide()}>
              <serverSideFeature.ErrorBars
                loadError={serverSide.loadError()}
                writeError={serverSide.writeError()}
                onRetry={serverSide.retryFailedBlocks}
                slot={slots().errorBar}
                localeTexts={localeTexts()}
              />
            </Show>
          ) : null}
          {/* IME オンのままの直接入力の入力受け(imeDirectInput が有効なときだけ)。値 / 位置 / 変換中の見た目はコントローラが
              直接扱います。Tab の順番には入れません(タブストップはシェルのまま)。 */}
          <Show when={imeDirectInputEnabled()}>
            <input
              ref={(element) => engine.imeInput.attach(element)}
              {...{ [IME_INPUT_ATTRIBUTE]: '' }}
              class="ssg-ime-input"
              type="text"
              tabindex={-1}
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              aria-label={localeTexts().cellInput}
            />
          </Show>
        </div>
        {bottomBar()}
        {/* 列メニュー(グリッドの外のポップアップ)。 */}
        {columnMenu && columnMenuFeature ? (
          <Show when={columnMenu.openedColumn()}>
            {(column) => (
              <Show when={columnMenu.layout()}>
                {(layout) => (
                  <columnMenuFeature.ColumnMenuPopover
                    slots={slots()}
                    themeClassName={portalClassName()}
                    title={column().title || column().key}
                    columnKey={column().key}
                    canFilter={columnFilterEnabled() && Boolean(column().filterType)}
                    onOpenFilter={() => columnCommands.handleColumnMenuOpenFilter(column())}
                    canSort={enableSorting()}
                    sortDirection={ui().sort.find((entry) => entry.columnKey === column().key)?.direction ?? null}
                    onSortChange={(direction) => columnCommands.handleColumnMenuSortChange(column().key, direction)}
                    onOpenSortManager={toolPanel ? columnCommands.handleColumnMenuOpenSortManager : undefined}
                    canManageFilters={columnFilterEnabled()}
                    onOpenFilterManager={toolPanel ? columnCommands.handleColumnMenuOpenFilterManager : undefined}
                    pinned={column().pinned}
                    canChangePinned={props.onColumnsChange !== undefined}
                    layout={layout()}
                    panelRef={columnMenu.panelRef}
                    onPinnedChange={columnCommands.handleColumnMenuPinnedChange}
                    onAutosizeColumn={columnAutosize ? columnCommands.handleColumnMenuAutosizeColumn : undefined}
                    onAutosizeAllColumns={columnAutosize ? columnCommands.handleColumnMenuAutosizeAllColumns : undefined}
                    onOpenColumnChooser={toolPanel ? columnCommands.handleColumnMenuOpenChooser : undefined}
                    canResetColumns={props.onColumnsChange !== undefined}
                    onResetColumns={columnCommands.handleColumnMenuResetColumns}
                    onGroupByColumn={
                      // 表に出ている最後のデータ列は出さない(自動グループ列だけが残ると列メニューが無くなり、「グループ化を外す」へ
                      //   戻れない。React 版と同じ)。
                      columnMenuGroupingAvailable() &&
                      column().aggFunc == null &&
                      column().rowGroup !== true &&
                      visibleColumns().some(
                        (candidate) =>
                          candidate.key !== column().key &&
                          candidate.rowGroup !== true &&
                          !isSyntheticColumnKey(candidate.key),
                      )
                        ? () => columnCommands.handleColumnMenuGroupBy(column().key)
                        : undefined
                    }
                    onUngroup={
                      columnMenuGroupingAvailable() && rowGroupingActive()
                        ? columnCommands.handleColumnMenuUngroup
                        : undefined
                    }
                    onRequestClose={columnMenu.close}
                  />
                )}
              </Show>
            )}
          </Show>
        ) : null}
        {/* 列フィルターのポップオーバー(グリッドの外のポップアップ。閉じている間は何も描かない)。 */}
        {filterPopover && FilterPopoverHost && filterPopoverViews ? (
          <FilterPopoverHost
            filterPopover={filterPopover}
            views={filterPopoverViews}
            rows={filterCandidateRows()}
            columnFilters={columnFilters()}
            globalFilterText={globalFilterText()}
            getFilterOptions={props.getFilterOptions as never}
            isServerSide={isServerSide()}
            dispatch={dispatch}
            renderFilterDateInput={props.renderFilterDateInput}
            popoverSlot={slots().popover}
            themeClassName={portalClassName()}
            localeTexts={localeTexts()}
          />
        ) : null}
        {/* ツールパネル(グリッドの外のポップアップ。開いている間だけ描く)。タブを切り替えると中身を作り直す(タブの中の検索の
            文字などは戻る。React 版と同じ)。 */}
        {toolPanel && toolPanelViews ? (
          <Show when={toolPanel.activeTab()}>
            {(tab) => (
              <Show when={toolPanel.layout()}>
                {(layout) => (
                  <Show when={toolPanelViews()}>
                    {(views) => {
                      // 読み込んだ部品は変わらない(1 回読めば同じもの)ので、追わずに読む。
                      const { ToolPanel, FilterManagementPanel, ColumnChooserPanel, SortManagementPanel } = untrack(views);
                      return (
                        <ToolPanel
                          popoverSlot={slots().popover}
                          themeClassName={portalClassName()}
                          activeTab={tab()}
                          flashTick={toolPanel.flashTick()}
                          tabs={toolPanelTabs()}
                          layout={layout()}
                          panelRef={toolPanel.panelRef}
                          onSelectTab={toolPanel.open}
                          onRequestClose={toolPanel.close}
                          onPanelMove={toolPanel.move}
                        >
                          <Switch>
                            <Match when={tab() === 'filter'}>
                              <FilterManagementPanel
                                entries={filterManagement?.entries() ?? []}
                                addableColumns={filterManagement?.addableColumns() ?? []}
                                showGlobalFilterRow={showGlobalFilterRow()}
                                globalFilterText={globalFilterText()}
                                canFilter={columnFilterEnabled()}
                                onEditFilter={filterManagement?.jumpToColumnFilter ?? noop}
                                onAddFilter={filterManagement?.jumpToColumnFilter ?? noop}
                                onClearFilter={columnCommands.handleFilterManagerClearFilter}
                                onClearAllFilters={columnCommands.handleFilterManagerClearAll}
                                onClearGlobalFilter={columnCommands.handleFilterManagerClearGlobal}
                              />
                            </Match>
                            <Match when={tab() === 'columns'}>
                              <ColumnChooserPanel
                                items={columnChooserItems()}
                                canToggle={props.onColumnsChange !== undefined}
                                onToggleColumnVisibility={columnCommands.handleColumnChooserToggleVisibility}
                                onShowAllColumns={columnCommands.handleColumnChooserShowAll}
                                onHideAllColumns={columnCommands.handleColumnChooserHideAll}
                                onResetColumns={columnCommands.handleColumnChooserReset}
                                onReorderColumns={columnCommands.handleColumnChooserReorder}
                              />
                            </Match>
                            <Match when={tab() === 'sort'}>
                              <SortManagementPanel
                                entries={ui().sort}
                                columns={sortManagerColumns()}
                                canSort={enableSorting()}
                                onAddLevel={columnCommands.handleSortManagerAddLevel}
                                onChangeDirection={columnCommands.handleSortManagerChangeDirection}
                                onChangeColumn={columnCommands.handleSortManagerChangeColumn}
                                onRemoveLevel={columnCommands.handleSortManagerRemoveLevel}
                                onClearAll={columnCommands.handleSortManagerClearAll}
                                onMove={columnCommands.handleSortManagerMove}
                              />
                            </Match>
                          </Switch>
                        </ToolPanel>
                      );
                    }}
                  </Show>
                )}
              </Show>
            )}
          </Show>
        ) : null}
        {/* セル / 行番号の右クリックメニュー(グリッドの外のポップアップ)。 */}
        {contextMenu && contextMenuFeature ? (
          <Show when={contextMenuView()}>
            {(open) => (
              <contextMenuFeature.CellContextMenuPopover
                items={open().items}
                layout={open().layout}
                panelRef={contextMenu.panelRef}
                onRequestClose={contextMenu.close}
                ariaLabel={open().ariaLabel}
                themeClassName={portalClassName()}
                slots={slots()}
              />
            )}
          </Show>
        ) : null}
        {/* フィルハンドルの埋めたあとのメニュー / ドラッグ中の値のツールチップ(グリッドの外のポップアップ)。 */}
        {fill && fillHandleFeature ? (
          <fillHandleFeature.FillHandlePortals fill={fill} themeClassName={portalClassName()} />
        ) : null}
      </div>
      </GridPortalContext>
    </GridLocaleTextContext>
  );
  // ここまでに登録した描き終わった後の処理がすべて走ったら、待ち行列を閉じる(onSettled は登録した順に走る)。
  closeMountGateOnSettled(mountGate);
  return shellView;
}