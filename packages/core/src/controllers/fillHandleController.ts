// 追加(フィルハンドル 1A): フィルハンドル(選択範囲の右下の四角)のドラッグ / ダブルクリック / 埋めたあとの
//   「連続データ / セルのコピー」ボタンのコントローラです(React 非依存)。
//   - pointerdown(ハンドル)→ window に pointermove / pointerup / pointercancel / keydown・keyup(capture)/ blur を
//     登録し、このドラッグの pointerId だけを扱います(仮想化 DOM 上のドラッグは要素直付けにしない。CLAUDE.md)。
//     ヒットテストはシェルから受け取ります(pointerInteractionsController と同じ 3 ペインの式)。
//   - ドラッグ中は Ctrl(Mac は ⌘)で埋め方を入れ替え、Escape でやめます。端へ寄せると自動スクロールします。
//     ドラッグ中のキー入力はグリッドへ流しません(アクティブセルが動いて元の範囲がずれないように)。
//   - 離すと logic/fillHandle の buildFillEdits で書き込みを作り、clientSide は applyRowsChange(履歴付き)、
//     serverSide は applyServerSideCellEdits へ渡します。選択は元の範囲 + 埋めた範囲へ広げ、アクティブセルは
//     そのまま。書き込みが 1 つも無ければ何もしません。
//   - 埋めたあとはボタン(chip)を出し、メニューで埋め方を選び直せます。clientSide は埋める前の rows / 行モデル
//     から作り直して amendRowsChange(履歴を積まない = 元に戻す 1 回で埋める前へ)、serverSide は行キーが
//     埋めたときと同じことを確かめてから上書きします。選択 / rows / 列 / 表示の条件(viewKey: ソート / フィルター /
//     グループ開閉 / serverSide の問い合わせ)が変わったり編集が始まったら消します。
//   - 状態は snapshot(subscribe / getSnapshot)で、ドラッグ中のポインタ位置は別の pointer ストア(値の
//     ツールチップだけが購読し、シェル全体を再描画しない)で公開します。
import { gridActions, type GridUiAction } from '../model/gridActions';
import type {
  CellCoord,
  GridColumn,
  GridFillKind,
  GridFillValueParams,
  GridRowKey,
  GridSelection,
  RowModel,
  SpreadsheetGridProps,
} from '../model/gridTypes.unbound';
import { createValueStore } from '../logic/valueStore';
import {
  applyFillEditsToRows,
  buildFillEdits,
  isSameFillRange,
  previewFillValue,
  resolveFillColumnBounds,
  resolveFillDoubleClickTarget,
  resolveFillSource,
  resolveFillTarget,
  unionFillRange,
  type FillCellEdit,
  type FillRange,
  type FillTarget,
} from '../logic/fillHandle';
import type { FillRequest } from '../logic/fillSeries';
import { isViewCellEditable } from '../utils/permissions';
import {
  AUTO_SCROLL_ACTIVATION_DISTANCE,
  AUTO_SCROLL_EDGE_THRESHOLD,
  AUTO_SCROLL_STEP,
  computeNextScrollPosition,
  hasPointerLeftActivationRadius,
  resolveAutoScrollAxisDirection,
  resolveScrollContentBox,
} from '../logic/autoScrollGeometry';
import {
  createPopoverWindowBindings,
  isInsideGridRoot,
  restoreGridFocus,
} from './popoverSupport';

type ReadonlyRef<V> = { readonly current: V };

export type FillMenuLayout = { top: number; left: number };

export type FillHandleSnapshot =
  | { status: 'idle' }
  | {
      status: 'dragging';
      source: FillRange;
      // 埋める範囲(ポインタが元の範囲の内側なら null)。
      target: FillTarget | null;
      // Ctrl / ⌘ で埋め方を入れ替えているか。
      toggled: boolean;
      // いちばん遠いセルへ入る値の表示文字列(ツールチップ)。
      previewText: string | null;
    }
  | {
      status: 'filled';
      // 埋めたあとの範囲(元の範囲 + 埋めた範囲)。ボタンはこの右下に出します。
      range: FillRange;
      kind: GridFillKind;
      seriesAvailable: boolean;
      menu: FillMenuLayout | null;
    };

export type FillHandleControllerArgs<T> = {
  // ハンドルを使えるか(fillHandle 指定・readOnly でない・書き込み先がある)。
  enabled: boolean;
  isServerSide: boolean;
  rows: readonly T[];
  rowModel: RowModel<T>;
  // 視覚順の列(合成列を含む。選択の列 index の基準)。
  columns: GridColumn<T>[];
  selection: GridSelection;
  activeCell: CellCoord | null;
  editing: boolean;
  // 表示の条件(ソート / フィルター / グループ開閉 / serverSide の問い合わせ等)。要素のどれかが変わったら(Object.is)
  //   埋めたあとのボタンを消します(並びが変わった行へ選び直さない。serverSide の行キーが位置のままでも)。
  viewKey?: readonly unknown[];
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  getFillValue?: (params: GridFillValueParams<T>) => unknown;
  dispatch: (action: GridUiAction) => void;
  // クライアント座標 → セル座標(3 ペインのヒットテスト)。
  hitTest: (clientX: number, clientY: number) => CellCoord | null;
  scrollContainerRef: ReadonlyRef<HTMLElement | null>;
  gridRootRef: ReadonlyRef<HTMLElement | null>;
  // clientSide の書き込み(履歴付き)と、選び直しの差し替え(履歴を積まない)。
  applyRowsChange?: (nextRows: T[]) => void;
  amendRowsChange?: (nextRows: T[]) => void;
  applyServerSideCellEdits?: (edits: FillCellEdit<T>[]) => number;
};

// ハンドルの pointerdown(構造的型。React の合成 PointerEvent をそのまま渡せます)。
export type FillHandlePointerEvent = {
  button: number;
  pointerId: number;
  clientX: number;
  clientY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  // 押した時刻(ダブルクリックの判定。Event.timeStamp と同じ時計)。
  timeStamp: number;
  // ハンドルの要素(見えている四角の矩形でダブルクリックを判定します。無ければ判定しない)。
  currentTarget?: EventTarget | null;
  preventDefault: () => void;
  // 変更(見直し): 呼びません(開いているポップオーバーの外側クリック判定へ届かせるため)。型の互換で残しています。
  stopPropagation?: () => void;
};

export type FillHandleController<T> = {
  update: (args: FillHandleControllerArgs<T>) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => FillHandleSnapshot;
  // ドラッグ中のポインタ位置(ツールチップ用。ドラッグしていないときは null)。
  subscribePointer: (listener: () => void) => () => void;
  getPointerSnapshot: () => { x: number; y: number } | null;
  handlePointerDown: (event: FillHandlePointerEvent) => void;
  // ハンドルのダブルクリック(左隣 / 右隣の列に値が続くところまで下へ)。押下の間隔でも判定します。
  handleDoubleClick: () => void;
  // ボタン(chip)の押下でメニューを開閉します(anchor はボタンの矩形)。
  toggleMenu: (anchor: { left: number; top: number; bottom: number }) => void;
  closeMenu: () => void;
  chooseKind: (kind: GridFillKind) => void;
  // メニューパネル / ボタンの要素(外側クリック判定。view が渡します)。
  menuPanel: { current: HTMLDivElement | null };
  chipElement: { current: HTMLButtonElement | null };
  dispose: () => void;
};

const MENU_WIDTH = 168;
const MENU_ESTIMATED_HEIGHT = 84;
const VIEWPORT_MARGIN = 8;

const IDLE: FillHandleSnapshot = { status: 'idle' };

// 画面のセルと同じ表示文字列(valueFormatter があればそれ)。formatter が投げたら生の文字列にします。
const formatPreview = <T,>(column: GridColumn<T>, row: T | undefined, value: unknown): string => {
  if (column.valueFormatter) {
    try {
      return column.valueFormatter({ value, row: row as T, column });
    } catch {
      return String(value ?? '');
    }
  }
  return String(value ?? '');
};

// 列が同じ並びか(参照ではなく key で比べる。列定義をレンダーごとに作り直す利用側でもボタンが消えないように)。
const isSameColumnOrder = <T,>(a: readonly GridColumn<T>[], b: readonly GridColumn<T>[]): boolean =>
  a === b || (a.length === b.length && a.every((column, index) => column.key === b[index].key));

// ハンドルの 2 回目の押下をダブルクリックとみなす間隔(ms)と距離(px)。
const DOUBLE_CLICK_MS = 500;
const DOUBLE_CLICK_SLOP_PX = 6;
// ダブルクリックは 2 回とも見えている四角(8px)の縁から この px 以内を押したときだけ(styles.css の ::before と同じ
//   幅)。タッチの広い当たり判定(隣のセルの角にかかる)でのダブルタップは、隣のセルの編集の意図とみなします。
const DOUBLE_CLICK_SQUARE_SLOP_PX = 2;

const isPressOnVisibleSquare = (event: FillHandlePointerEvent): boolean => {
  const element = event.currentTarget;
  if (!(element instanceof Element)) {
    return true;
  }
  const rect = element.getBoundingClientRect();
  return (
    event.clientX >= rect.left - DOUBLE_CLICK_SQUARE_SLOP_PX &&
    event.clientX <= rect.right + DOUBLE_CLICK_SQUARE_SLOP_PX &&
    event.clientY >= rect.top - DOUBLE_CLICK_SQUARE_SLOP_PX &&
    event.clientY <= rect.bottom + DOUBLE_CLICK_SQUARE_SLOP_PX
  );
};

const isSameViewKey = (a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean =>
  a === b ||
  (a !== undefined && b !== undefined && a.length === b.length && a.every((value, index) => Object.is(value, b[index])));

const isSameFillValue = (a: unknown, b: unknown): boolean =>
  Object.is(a, b) || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime());

// 選び直した書き込みが今の書き込みと同じか(同じなら書き直さない)。
const isSameFillEdits = <T,>(a: readonly FillCellEdit<T>[], b: readonly FillCellEdit<T>[]): boolean =>
  a.length === b.length &&
  a.every(
    (edit, index) =>
      edit.viewIndex === b[index].viewIndex &&
      edit.column.key === b[index].column.key &&
      isSameFillValue(edit.value, b[index].value),
  );

// 埋めたときの記録(ボタンでの選び直し用)。
type FillRecord<T> = {
  source: FillRange;
  target: FillTarget;
  range: FillRange;
  // 埋める前の選択(親が rows を戻すまでのあいだ、この選択のままでもボタンを消さない)。
  previousSource: FillRange;
  selectionConfirmed: boolean;
  columns: GridColumn<T>[];
  viewKey: readonly unknown[] | undefined;
  // 最後に選んだ埋め方と、そのときの書き込み(選び直しで同じ書き込みになるなら何もしない)。
  request: FillRequest;
  edits: FillCellEdit<T>[];
  // clientSide: 埋める前の rows / 行モデル と、これまでに出した rows(親が戻すのを待つあいだも消さない)。
  baseRows: readonly T[] | null;
  baseRowModel: RowModel<T> | null;
  emittedRows: (readonly T[])[];
  // serverSide: 埋めた範囲の行キー(選び直す前に同じ行か確かめる)。
  rowKeys: GridRowKey[] | null;
};

export const createFillHandleController = <T,>(): FillHandleController<T> => {
  let args: FillHandleControllerArgs<T> | null = null;
  const store = createValueStore<FillHandleSnapshot>(IDLE);
  const pointerStore = createValueStore<{ x: number; y: number } | null>(null);
  const menuPanel: { current: HTMLDivElement | null } = { current: null };
  const chipElement: { current: HTMLButtonElement | null } = { current: null };
  let record: FillRecord<T> | null = null;
  // 直前に「埋めずに離した」押下(2 回目の押下をダブルクリックとみなす)。
  let lastClick: { time: number; x: number; y: number } | null = null;

  // ── ドラッグ ──
  let drag: {
    pointerId: number;
    source: FillRange;
    activeCell: CellCoord | null;
    origin: { x: number; y: number };
    // 見えている四角を押したか(ダブルクリックの 1 回目にできるか)。
    onSquare: boolean;
    pointer: { x: number; y: number };
    toggled: boolean;
    target: FillTarget | null;
    armed: boolean;
    rafId: number | null;
    cleanup: () => void;
  } | null = null;

  const request = (toggled: boolean): FillRequest => (toggled ? 'toggled' : 'auto');

  const canWriteCell = (current: FillHandleControllerArgs<T>) =>
    (viewIndex: number, colIndex: number, row: T, column: GridColumn<T>) =>
      isViewCellEditable(
        { readOnly: current.readOnly, canEditCell: current.canEditCell },
        current.rowModel,
        viewIndex,
        colIndex,
        row,
        column,
      );

  const publishDrag = () => {
    if (drag === null || args === null) {
      return;
    }
    const current = store.getSnapshot();
    // 埋める範囲と入れ替えが変わらなければ値も変わらないため、作り直しません(ポインタがセル内で動いただけ)。
    if (
      current.status === 'dragging' &&
      current.toggled === drag.toggled &&
      (current.target === drag.target ||
        (current.target !== null &&
          drag.target !== null &&
          current.target.direction === drag.target.direction &&
          isSameFillRange(current.target.range, drag.target.range)))
    ) {
      return;
    }
    let previewText: string | null = null;
    if (drag.target !== null) {
      const preview = previewFillValue({
        rowModel: args.rowModel,
        columns: args.columns,
        source: drag.source,
        target: drag.target,
        request: request(drag.toggled),
        canWriteCell: canWriteCell(args),
        getFillValue: args.getFillValue,
      });
      // 空の値(空欄で埋める)はツールチップを出しません。
      previewText = preview ? formatPreview(preview.column, preview.row, preview.value) || null : null;
    }
    store.setSnapshot({
      status: 'dragging',
      source: drag.source,
      target: drag.target,
      toggled: drag.toggled,
      previewText,
    });
  };

  const recomputeTarget = () => {
    if (drag === null || args === null) {
      return;
    }
    const bounds = resolveFillColumnBounds(args.columns);
    const cell = args.hitTest(drag.pointer.x, drag.pointer.y);
    if (bounds === null || cell === null) {
      return;
    }
    drag.target = resolveFillTarget(drag.source, cell, args.rowModel.getRowCount(), bounds);
    publishDrag();
  };

  const autoScrollTick = () => {
    if (drag === null || args === null) {
      return;
    }
    const active = drag;
    active.rafId = requestAnimationFrame(autoScrollTick);
    const scrollElement = args.scrollContainerRef.current;
    if (!scrollElement) {
      return;
    }
    if (!active.armed) {
      if (!hasPointerLeftActivationRadius(active.origin, active.pointer, AUTO_SCROLL_ACTIVATION_DISTANCE)) {
        return;
      }
      active.armed = true;
    }
    const rect = scrollElement.getBoundingClientRect();
    const contentBox = resolveScrollContentBox({
      rectLeft: rect.left,
      rectTop: rect.top,
      clientLeft: scrollElement.clientLeft,
      clientTop: scrollElement.clientTop,
      clientWidth: scrollElement.clientWidth,
      clientHeight: scrollElement.clientHeight,
    });
    const nextScrollTop = computeNextScrollPosition(
      scrollElement.scrollTop,
      resolveAutoScrollAxisDirection(active.pointer.y, contentBox.top, contentBox.bottom, AUTO_SCROLL_EDGE_THRESHOLD),
      AUTO_SCROLL_STEP,
      scrollElement.scrollHeight - scrollElement.clientHeight,
    );
    const nextScrollLeft = computeNextScrollPosition(
      scrollElement.scrollLeft,
      resolveAutoScrollAxisDirection(active.pointer.x, contentBox.left, contentBox.right, AUTO_SCROLL_EDGE_THRESHOLD),
      AUTO_SCROLL_STEP,
      scrollElement.scrollWidth - scrollElement.clientWidth,
    );
    if (nextScrollTop !== scrollElement.scrollTop || nextScrollLeft !== scrollElement.scrollLeft) {
      scrollElement.scrollTo({ top: nextScrollTop, left: nextScrollLeft, behavior: 'auto' });
      recomputeTarget();
    }
  };

  const endDrag = (commit: boolean, timeStamp?: number) => {
    const finished = drag;
    if (finished === null) {
      return;
    }
    drag = null;
    finished.cleanup();
    if (finished.rafId !== null) {
      cancelAnimationFrame(finished.rafId);
    }
    pointerStore.setSnapshot(null);
    store.setSnapshot(IDLE);
    if (commit && finished.target !== null) {
      lastClick = null;
      applyFill(finished.source, finished.target, request(finished.toggled), finished.activeCell);
      return;
    }
    // 埋めずに離した(クリック)。次の押下が近ければダブルクリックです(見えている四角を押したときだけ)。
    lastClick =
      commit && timeStamp !== undefined && finished.onSquare
        ? { time: timeStamp, x: finished.origin.x, y: finished.origin.y }
        : null;
  };

  // ── 書き込み ──

  const selectRange = (range: FillRange, activeCell: CellCoord | null) => {
    if (args === null) {
      return;
    }
    const { dispatch } = args;
    dispatch(gridActions.startSelection({ row: range.startRow, col: range.startCol }));
    dispatch(gridActions.updateSelection({ row: range.endRow, col: range.endCol }));
    dispatch(gridActions.endSelection());
    dispatch(gridActions.activateCell(activeCell ?? { row: range.startRow, col: range.startCol }));
  };

  const collectRowKeys = (rowModel: RowModel<T>, range: FillRange): GridRowKey[] => {
    const keys: GridRowKey[] = [];
    for (let viewIndex = range.startRow; viewIndex <= range.endRow; viewIndex += 1) {
      keys.push(rowModel.getRowKey(viewIndex));
    }
    return keys;
  };

  const applyFill = (
    source: FillRange,
    target: FillTarget,
    fillRequest: FillRequest,
    activeCell: CellCoord | null,
  ) => {
    if (args === null || !args.enabled) {
      return;
    }
    const current = args;
    const result = buildFillEdits({
      rowModel: current.rowModel,
      columns: current.columns,
      source,
      target,
      request: fillRequest,
      canWriteCell: canWriteCell(current),
      getFillValue: current.getFillValue,
    });
    if (result.edits.length === 0) {
      return;
    }
    const range = unionFillRange(source, target);
    let baseRows: readonly T[] | null = null;
    const emittedRows: (readonly T[])[] = [];
    let rowKeys: GridRowKey[] | null = null;
    if (current.isServerSide) {
      if (!current.applyServerSideCellEdits) {
        return;
      }
      rowKeys = collectRowKeys(current.rowModel, range);
      current.applyServerSideCellEdits(result.edits);
    } else {
      if (!current.applyRowsChange) {
        return;
      }
      const nextRows = applyFillEditsToRows(current.rows, current.rowModel, result.edits);
      if (nextRows === current.rows) {
        return;
      }
      baseRows = current.rows;
      emittedRows.push(nextRows);
      current.applyRowsChange(nextRows);
    }
    record = {
      source,
      target,
      range,
      previousSource: source,
      selectionConfirmed: false,
      columns: current.columns,
      viewKey: current.viewKey,
      request: fillRequest,
      edits: result.edits,
      baseRows,
      baseRowModel: current.isServerSide ? null : current.rowModel,
      emittedRows,
      rowKeys,
    };
    selectRange(range, activeCell);
    store.setSnapshot({
      status: 'filled',
      range,
      kind: result.kind,
      seriesAvailable: result.seriesAvailable,
      menu: null,
    });
  };

  // ── 埋めたあとのボタン ──

  const menuBindings = createPopoverWindowBindings({
    onScroll: (event) => {
      // メニュー自身のスクロールでは閉じません。
      if (event.target instanceof Node && menuPanel.current?.contains(event.target)) {
        return;
      }
      closeMenuWith(false);
    },
    onResize: () => closeMenuWith(false),
    isInside: (target) =>
      menuPanel.current?.contains(target) === true || chipElement.current?.contains(target) === true,
    onOutsidePointerDown: (target) =>
      closeMenuWith(args !== null && isInsideGridRoot(args.gridRootRef, target)),
    onKeyDown: (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeMenuWith(true);
      }
    },
  });

  const setMenu = (menu: FillMenuLayout | null) => {
    const current = store.getSnapshot();
    if (current.status !== 'filled' || current.menu === menu) {
      return;
    }
    store.setSnapshot({ ...current, menu });
  };

  const closeMenuWith = (restoreFocus: boolean) => {
    menuBindings.detach();
    setMenu(null);
    if (restoreFocus && args !== null) {
      restoreGridFocus(args.gridRootRef);
    }
  };

  const hideChip = () => {
    // メニューにフォーカスがあるまま消えるとき(外から rows / 表示が変わった等)は、フォーカスをグリッドへ戻します
    //   (消えたメニューと一緒に body へ落とさない)。
    const focusInMenu =
      typeof document !== 'undefined' && menuPanel.current?.contains(document.activeElement) === true;
    record = null;
    menuBindings.detach();
    if (store.getSnapshot().status === 'filled') {
      store.setSnapshot(IDLE);
    }
    if (focusInMenu && args !== null) {
      restoreGridFocus(args.gridRootRef);
    }
  };

  const toggleMenu = (anchor: { left: number; top: number; bottom: number }) => {
    const current = store.getSnapshot();
    if (current.status !== 'filled') {
      return;
    }
    if (current.menu !== null) {
      closeMenuWith(true);
      return;
    }
    let left = Math.min(anchor.left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);
    left = Math.max(VIEWPORT_MARGIN, left);
    let top = anchor.bottom + 4;
    if (top + MENU_ESTIMATED_HEIGHT > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, anchor.top - 4 - MENU_ESTIMATED_HEIGHT);
    }
    setMenu({ top, left });
    menuBindings.attach();
  };

  const rowKeysStillMatch = (rowModel: RowModel<T>, fill: FillRecord<T>): boolean => {
    const keys = fill.rowKeys;
    if (keys === null) {
      return false;
    }
    for (let offset = 0; offset < keys.length; offset += 1) {
      if (rowModel.getRowKey(fill.range.startRow + offset) !== keys[offset]) {
        return false;
      }
    }
    return true;
  };

  const chooseKind = (kind: GridFillKind) => {
    const snapshot = store.getSnapshot();
    const fill = record;
    closeMenuWith(true);
    // 変更(見直し): 表示中の種類(どれか 1 列でも連続データなら「連続データ」)ではなく、書き込みが変わるかで決めます
    //   (列ごとに埋め方が混ざるとき「連続データ」を選ぶと、コピーだった列も連続データにする)。
    if (args === null || fill === null || snapshot.status !== 'filled' || fill.request === kind) {
      return;
    }
    const current = args;
    if (current.isServerSide) {
      if (!current.applyServerSideCellEdits || !rowKeysStillMatch(current.rowModel, fill)) {
        hideChip();
        return;
      }
      const result = buildFillEdits({
        rowModel: current.rowModel,
        columns: fill.columns,
        source: fill.source,
        target: fill.target,
        request: kind,
        canWriteCell: canWriteCell(current),
        getFillValue: current.getFillValue,
      });
      fill.request = kind;
      if (result.edits.length > 0 && !isSameFillEdits(result.edits, fill.edits)) {
        current.applyServerSideCellEdits(result.edits);
      }
      fill.edits = result.edits;
      store.setSnapshot({ ...snapshot, kind: result.kind, menu: null });
      return;
    }
    if (!current.amendRowsChange || fill.baseRows === null || fill.baseRowModel === null) {
      hideChip();
      return;
    }
    // 埋める前の rows / 行モデルから作り直します(埋めた結果の上に重ねない)。
    const baseRowModel = fill.baseRowModel;
    const result = buildFillEdits({
      rowModel: baseRowModel,
      columns: fill.columns,
      source: fill.source,
      target: fill.target,
      request: kind,
      canWriteCell: (viewIndex, colIndex, row, column) =>
        isViewCellEditable(
          { readOnly: current.readOnly, canEditCell: current.canEditCell },
          baseRowModel,
          viewIndex,
          colIndex,
          row,
          column,
        ),
      getFillValue: current.getFillValue,
    });
    fill.request = kind;
    if (!isSameFillEdits(result.edits, fill.edits)) {
      const nextRows = applyFillEditsToRows(fill.baseRows, baseRowModel, result.edits);
      fill.emittedRows.push(nextRows);
      fill.edits = result.edits;
      current.amendRowsChange(nextRows);
    }
    store.setSnapshot({ ...snapshot, kind: result.kind, menu: null });
  };

  const selectionMatches = (selection: GridSelection, range: FillRange): boolean => {
    if (selection?.type !== 'cell') {
      return false;
    }
    const { start, end } = selection.range;
    return isSameFillRange(range, {
      startRow: Math.min(start.row, end.row),
      endRow: Math.max(start.row, end.row),
      startCol: Math.min(start.col, end.col),
      endCol: Math.max(start.col, end.col),
    });
  };

  // update のたびに、ボタンを出し続けてよいかを確かめます。
  const validateRecord = (next: FillHandleControllerArgs<T>) => {
    const fill = record;
    if (fill === null) {
      return;
    }
    if (
      !next.enabled ||
      next.editing ||
      !isSameColumnOrder(next.columns, fill.columns) ||
      !isSameViewKey(next.viewKey, fill.viewKey)
    ) {
      hideChip();
      return;
    }
    if (!next.isServerSide && next.rows !== fill.baseRows && !fill.emittedRows.includes(next.rows)) {
      hideChip();
      return;
    }
    if (selectionMatches(next.selection, fill.range)) {
      fill.selectionConfirmed = true;
      return;
    }
    if (!fill.selectionConfirmed && selectionMatches(next.selection, fill.previousSource)) {
      return;
    }
    hideChip();
  };

  // ── 入口 ──

  const handlePointerDown = (event: FillHandlePointerEvent) => {
    if (args === null || event.button !== 0) {
      return;
    }
    // 変更(見直し): stopPropagation はしません(開いているコンテキストメニュー / 列メニュー等の「外側の押下で
    //   閉じる」へ届かせる)。ハンドルの祖先にセルの pointerdown は無いため、選択は始まりません。
    event.preventDefault();
    if (drag !== null || !args.enabled || args.editing) {
      return;
    }
    const source = resolveFillSource(
      args.selection,
      args.activeCell,
      args.rowModel.getRowCount(),
      args.columns.length,
    );
    if (source === null) {
      return;
    }
    // 2 回目の押下(埋めずに離した直後・近い位置)はダブルクリック: 隣の列に合わせて下へ埋めます。
    const previousClick = lastClick;
    lastClick = null;
    const onSquare = isPressOnVisibleSquare(event);
    if (
      previousClick !== null &&
      onSquare &&
      event.timeStamp - previousClick.time <= DOUBLE_CLICK_MS &&
      Math.abs(event.clientX - previousClick.x) <= DOUBLE_CLICK_SLOP_PX &&
      Math.abs(event.clientY - previousClick.y) <= DOUBLE_CLICK_SLOP_PX
    ) {
      args.gridRootRef.current?.focus({ preventScroll: true });
      handleDoubleClick();
      return;
    }
    hideChip();
    args.gridRootRef.current?.focus({ preventScroll: true });
    const pointerId = event.pointerId;
    const handleMove = (nativeEvent: PointerEvent) => {
      if (drag === null || nativeEvent.pointerId !== pointerId) {
        return;
      }
      drag.pointer = { x: nativeEvent.clientX, y: nativeEvent.clientY };
      drag.toggled = nativeEvent.ctrlKey || nativeEvent.metaKey;
      pointerStore.setSnapshot(drag.pointer);
      recomputeTarget();
    };
    const handleUp = (nativeEvent: PointerEvent) => {
      if (drag === null || nativeEvent.pointerId !== pointerId) {
        return;
      }
      drag.toggled = nativeEvent.ctrlKey || nativeEvent.metaKey;
      endDrag(true, nativeEvent.timeStamp);
    };
    const handleCancel = (nativeEvent: PointerEvent) => {
      if (nativeEvent.pointerId !== pointerId) {
        return;
      }
      endDrag(false);
    };
    // ドラッグ中のキー: Ctrl / ⌘ で入れ替え、Escape でやめる。グリッドのキー操作へは流しません。
    const handleKey = (nativeEvent: KeyboardEvent) => {
      if (drag === null) {
        return;
      }
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      if (nativeEvent.type === 'keydown' && nativeEvent.key === 'Escape') {
        endDrag(false);
        return;
      }
      const toggled = nativeEvent.ctrlKey || nativeEvent.metaKey;
      if (toggled !== drag.toggled) {
        drag.toggled = toggled;
        publishDrag();
      }
    };
    const handleBlur = () => endDrag(false);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    window.addEventListener('keydown', handleKey, true);
    window.addEventListener('keyup', handleKey, true);
    window.addEventListener('blur', handleBlur);
    const origin = { x: event.clientX, y: event.clientY };
    drag = {
      pointerId,
      source,
      activeCell: args.activeCell,
      origin,
      onSquare,
      pointer: origin,
      toggled: event.ctrlKey || event.metaKey,
      target: null,
      armed: false,
      rafId: null,
      cleanup: () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleCancel);
        window.removeEventListener('keydown', handleKey, true);
        window.removeEventListener('keyup', handleKey, true);
        window.removeEventListener('blur', handleBlur);
      },
    };
    pointerStore.setSnapshot(origin);
    publishDrag();
    drag.rafId = requestAnimationFrame(autoScrollTick);
  };

  const handleDoubleClick = () => {
    if (args === null || drag !== null || !args.enabled || args.editing) {
      return;
    }
    const source = resolveFillSource(
      args.selection,
      args.activeCell,
      args.rowModel.getRowCount(),
      args.columns.length,
    );
    if (source === null) {
      return;
    }
    const target = resolveFillDoubleClickTarget(source, args.rowModel, args.columns);
    if (target === null) {
      return;
    }
    hideChip();
    applyFill(source, target, 'auto', args.activeCell);
  };

  return {
    update: (next) => {
      args = next;
      if (drag !== null && (!next.enabled || next.editing)) {
        endDrag(false);
      }
      validateRecord(next);
    },
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    subscribePointer: pointerStore.subscribe,
    getPointerSnapshot: pointerStore.getSnapshot,
    handlePointerDown,
    handleDoubleClick,
    toggleMenu,
    closeMenu: () => closeMenuWith(true),
    chooseKind,
    menuPanel,
    chipElement,
    dispose: () => {
      endDrag(false);
      menuBindings.detach();
      record = null;
    },
  };
};