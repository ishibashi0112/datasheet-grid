// 追加(本体分解 E-6a): 外部通知(onXxx コールバック)の配線です(React 非依存。旧 SpreadsheetGrid.tsx の
//   「行ホバーの optionally controlled 化」「展開行キー集合の変更通知」「onStateChange」の latest-ref + effect を移設)。
//   いずれも update(args) が旧 effect の deps に相当する値の変化を Object.is で検出し、変化したときだけ判定 / 通知
//   します。コールバック(onXxx)は update のたびに最新を保持するため、インライン関数を渡されても再通知しません。
//   - createHoverRowNotifier: pointer 由来のホバー行の正本(同値抑止)と、uncontrolled 表示用 state の更新 +
//     onHoveredRowChange 通知。applyHoveredRowChange は恒久安定(行 memo の prop 依存に入るため)。
//   - createDetailKeysNotifier: 展開行キー集合の変更通知(初回 = マウント時は通知しない)。
//   - createStateChangeNotifier: 永続スライス(幅 / フィルター / ソート)+ 列メタの変化通知。判定は純ロジック
//     decideStateChangeEmit(ドラッグ中保留 / 初回非発火 / 同値非発火)。onStateChange 未指定なら snapshot も作らない。
//   - createCellEventNotifier(追加 G-1): データセルのクリック / ダブルクリックの通知(onCellClick / onCellDoubleClick)。
//     イベント時点の最新 args を読むため、接続はレイアウト effect(既定)で行います。
//   - createActiveCellNotifier(追加 G-1): アクティブセルの変化通知(onActiveCellChange。passive)。
import type {
  CellCoord,
  GridCellDoubleClickParams,
  GridCellEventParams,
  GridCellRef,
  GridColumn,
  GridFilterState,
  GridRowKey,
  GridSortState,
  GridState,
  GridUiState,
  RowModel,
} from '../model/gridTypes.unbound';
import { isSameGridCellRef, resolveGridCellRef } from '../logic/cellRef';
import {
  buildGridState,
  cloneFilterState,
  cloneSortState,
  decideStateChangeEmit,
  extractColumnState,
  isSameFilterState,
  isSameSortState,
} from '../logic/gridState';

// ── 行ホバー ───────────────────────────────────────────

export type HoverRowNotifierArgs = {
  enableRowHover: boolean;
  // hoveredRowIndex prop 指定(controlled)。controlled では内部 state を更新しない(無駄な親再レンダー回避)。
  isHoverControlled: boolean;
  onHoveredRowChange: ((index: number | null, meta: { source: 'pointer' }) => void) | undefined;
  // uncontrolled 表示用の内部 state setter(view スライス)。
  setHoveredRowIndex: (index: number | null) => void;
};

export type HoverRowAction = number | null | ((current: number | null) => number | null);

export type HoverRowNotifier = {
  update: (args: HoverRowNotifierArgs) => void;
  applyHoveredRowChange: (action: HoverRowAction) => void;
};

export const createHoverRowNotifier = (): HoverRowNotifier => {
  let args: HoverRowNotifierArgs | null = null;
  // pointer 由来の現在値(pointerenter は同一行内のセル跨ぎでも来るため同値抑止の正本)。
  let pointerHoveredRow: number | null = null;
  return {
    update: (next) => {
      args = next;
    },
    applyHoveredRowChange: (action) => {
      if (args === null || !args.enableRowHover) {
        return;
      }
      const current = pointerHoveredRow;
      const next = typeof action === 'function' ? action(current) : action;
      if (next === current) {
        return;
      }
      pointerHoveredRow = next;
      if (!args.isHoverControlled) {
        args.setHoveredRowIndex(next);
      }
      args.onHoveredRowChange?.(next, { source: 'pointer' });
    },
  };
};

// ── 展開行キー集合 ───────────────────────────────────────

export type DetailKeysNotifierArgs = {
  expandedKeys: ReadonlySet<GridRowKey>;
  onChange: ((keys: GridRowKey[]) => void) | undefined;
};

export type DetailKeysNotifier = {
  update: (args: DetailKeysNotifierArgs) => void;
};

export const createDetailKeysNotifier = (): DetailKeysNotifier => {
  let lastKeys: ReadonlySet<GridRowKey> | null = null;
  return {
    update: ({ expandedKeys, onChange }) => {
      if (lastKeys === null) {
        // 初回(マウント時の空集合)は通知しません。
        lastKeys = expandedKeys;
        return;
      }
      if (Object.is(lastKeys, expandedKeys)) {
        return;
      }
      lastKeys = expandedKeys;
      onChange?.(Array.from(expandedKeys));
    },
  };
};

// ── onStateChange ──────────────────────────────────────

export type StateChangeNotifierArgs<T> = {
  columnWidths: GridUiState['columnWidths'];
  filters: GridUiState['filters'];
  sort: GridSortState;
  // 列リサイズ / 選択のドラッグ中は確定前(確定後にまとめて評価)。
  dragState: GridUiState['dragState'];
  // 列メタ(可視 / 順序 / ピン)の変化検出用(snapshot にも含める)。
  columns: GridColumn<T>[];
  onStateChange: ((state: GridState) => void) | undefined;
  // 追加(change-callbacks): フィルター / ソートのスライスだけを追う通知です(onStateChange は列幅 / 列メタでも
  //   呼ばれるため)。直前の update 引数と構造比較し、実際に変化したときだけ複製を渡します。初回は非発火。
  //   ドラッグ中保留は無し(フィルター / ソートはドラッグで変わらない)。
  onFiltersChange?: ((filters: GridFilterState) => void) | undefined;
  onSortChange?: ((sort: GridSortState) => void) | undefined;
};

export type StateChangeNotifier<T> = {
  update: (args: StateChangeNotifierArgs<T>) => void;
};

export const createStateChangeNotifier = <T,>(): StateChangeNotifier<T> => {
  let last: StateChangeNotifierArgs<T> | null = null;
  let lastEmitted: GridState | null = null;
  const sameDeps = (a: StateChangeNotifierArgs<T>, b: StateChangeNotifierArgs<T>) =>
    Object.is(a.columnWidths, b.columnWidths) &&
    Object.is(a.filters, b.filters) &&
    Object.is(a.sort, b.sort) &&
    Object.is(a.dragState, b.dragState) &&
    Object.is(a.columns, b.columns);
  return {
    update: (next) => {
      const prev = last;
      const changed = prev === null || !sameDeps(prev, next);
      last = next;
      if (!changed) {
        return;
      }
      // 追加(change-callbacks): スライス単位の通知。参照が変わったときだけ構造比較し、同値なら非発火。
      if (prev !== null) {
        if (next.onFiltersChange && !Object.is(prev.filters, next.filters) && !isSameFilterState(prev.filters, next.filters)) {
          next.onFiltersChange(cloneFilterState(next.filters));
        }
        if (next.onSortChange && !Object.is(prev.sort, next.sort) && !isSameSortState(prev.sort, next.sort)) {
          next.onSortChange(cloneSortState(next.sort));
        }
      }
      // onStateChange 未指定なら何もしません(snapshot 組み立て / 比較すら省略)。
      if (!next.onStateChange) {
        return;
      }
      const current = buildGridState(next.columnWidths, next.filters, next.sort, extractColumnState(next.columns));
      const decision = decideStateChangeEmit(lastEmitted, current, next.dragState !== null);
      lastEmitted = decision.nextLast;
      if (decision.emit) {
        next.onStateChange(current);
      }
    },
  };
};

// ── セル操作(クリック / ダブルクリック)── 追加(G-1)

export type CellEventNotifierArgs<T> = {
  rowModel: RowModel<T>;
  // 論理列 index 空間(視覚順 左→中央→右)の列。
  orderedColumns: readonly GridColumn<T>[];
  onCellClick: ((params: GridCellEventParams<T>) => void) | undefined;
  onCellDoubleClick: ((params: GridCellDoubleClickParams<T>) => void) | undefined;
};

export type CellEventNotifier<T> = {
  update: (args: CellEventNotifierArgs<T>) => void;
  // セルの click から呼びます(恒久安定 = 行 memo の prop に入れられる)。対象外のセル / 未指定なら何もしません。
  handleCellClick: (cell: CellCoord, event: MouseEvent) => void;
  // セルのダブルクリック(タッチのダブルタップ含む)から、既定の動作(編集開始)の前に呼びます。
  //   戻り値 true = 利用側が preventDefault() した(既定の動作を行わない)。
  notifyCellDoubleClick: (cell: CellCoord, event: MouseEvent) => boolean;
};

export const createCellEventNotifier = <T,>(): CellEventNotifier<T> => {
  let args: CellEventNotifierArgs<T> | null = null;
  return {
    update: (next) => {
      args = next;
    },
    handleCellClick: (cell, event) => {
      const onCellClick = args?.onCellClick;
      if (args === null || !onCellClick) {
        return;
      }
      const ref = resolveGridCellRef(args.rowModel, args.orderedColumns, cell);
      if (ref === null) {
        return;
      }
      onCellClick({ ...ref, event });
    },
    notifyCellDoubleClick: (cell, event) => {
      const onCellDoubleClick = args?.onCellDoubleClick;
      if (args === null || !onCellDoubleClick) {
        return false;
      }
      const ref = resolveGridCellRef(args.rowModel, args.orderedColumns, cell);
      if (ref === null) {
        return false;
      }
      let prevented = false;
      onCellDoubleClick({
        ...ref,
        event,
        preventDefault: () => {
          prevented = true;
        },
      });
      return prevented;
    },
  };
};

// ── アクティブセル ── 追加(G-1)

export type ActiveCellNotifierArgs<T> = {
  activeCell: CellCoord | null;
  rowModel: RowModel<T>;
  orderedColumns: readonly GridColumn<T>[];
  onActiveCellChange: ((cell: GridCellRef<T> | null) => void) | undefined;
};

export type ActiveCellNotifier<T> = {
  update: (args: ActiveCellNotifierArgs<T>) => void;
};

// 由来(クリック / キー操作 / handle / 表示行数の減少による詰め)を問わず、update の時点のアクティブセルを
//   セル参照へ解決し、前回と「別のセル」(isSameGridCellRef)になったときだけ通知します。
//   - 初回(マウント)は基準を記録するだけで通知しません。
//   - activeCell / rowModel / 列の参照が前回と同じなら解決もしません(毎レンダーの update を安く保つ)。
//     rowModel は行データの変化(clientSide の rows / SSRM のブロック到着)で参照が変わるため、未ロード行が
//     ロードされた / ソートで同じ座標の行が入れ替わった、といった変化もここで拾えます。
//   - 追跡はコールバックの有無に関わらず行います(後からコールバックが付いても過去の変化を通知しない)。
export const createActiveCellNotifier = <T,>(): ActiveCellNotifier<T> => {
  let lastInputs: Omit<ActiveCellNotifierArgs<T>, 'onActiveCellChange'> | null = null;
  let lastRef: GridCellRef<T> | null = null;
  return {
    update: (next) => {
      const prevInputs = lastInputs;
      if (
        prevInputs !== null &&
        Object.is(prevInputs.activeCell, next.activeCell) &&
        Object.is(prevInputs.rowModel, next.rowModel) &&
        Object.is(prevInputs.orderedColumns, next.orderedColumns)
      ) {
        return;
      }
      lastInputs = {
        activeCell: next.activeCell,
        rowModel: next.rowModel,
        orderedColumns: next.orderedColumns,
      };
      const current =
        next.activeCell === null
          ? null
          : resolveGridCellRef(next.rowModel, next.orderedColumns, next.activeCell);
      const changed = prevInputs !== null && !isSameGridCellRef(lastRef, current);
      lastRef = current;
      if (changed) {
        next.onActiveCellChange?.(current);
      }
    },
  };
};