// 追加(本体分解 E-6a): 外部通知(onXxx コールバック)の配線です(React 非依存。旧 SpreadsheetGrid.tsx の
//   「行ホバーの optionally controlled 化」「展開行キー集合の変更通知」「onStateChange」の latest-ref + effect を移設)。
//   いずれも update(args) が旧 effect の deps に相当する値の変化を Object.is で検出し、変化したときだけ判定 / 通知
//   します。コールバック(onXxx)は update のたびに最新を保持するため、インライン関数を渡されても再通知しません。
//   - createHoverRowNotifier: pointer 由来のホバー行の正本(同値抑止)と、uncontrolled 表示用 state の更新 +
//     onHoveredRowChange 通知。applyHoveredRowChange は恒久安定(行 memo の prop 依存に入るため)。
//   - createDetailKeysNotifier: 展開行キー集合の変更通知(初回 = マウント時は通知しない)。
//   - createStateChangeNotifier: 永続スライス(幅 / フィルター / ソート)+ 列メタの変化通知。判定は純ロジック
//     decideStateChangeEmit(ドラッグ中保留 / 初回非発火 / 同値非発火)。onStateChange 未指定なら snapshot も作らない。
import type { GridColumn, GridRowKey, GridSortState, GridState, GridUiState } from '../model/gridTypes.unbound';
import { buildGridState, decideStateChangeEmit, extractColumnState } from '../logic/gridState';

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
      const changed = last === null || !sameDeps(last, next);
      last = next;
      if (!changed) {
        return;
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