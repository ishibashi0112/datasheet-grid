// 追加(非依存化 ③-16): 列フィルターポップオーバーの開閉・ドラフト・配置・フォーカスのコントローラです
//   (React 非依存。旧 hooks/useFilterPopoverController の本体を移設)。
//   - open(column): フォーカスを外し、グリッド root 内のヘッダーセル([data-ssg-col-key])をアンカーに
//     解決し、列の filterType('auto' は resolveColumnFilterType で解決)と現在のフィルター値から
//     ドラフト(テキスト / number / textSet / dateSet 条件)を初期化して開きます。
//   - 配置は logic/filterPopoverLayout の純関数。高さはパネル実測(ResizeObserver)があればそれ、無ければ
//     種別ごとの見積もり。resize / scroll(capture)で再配置します。
//   - 開いた直後(および配置が変わったとき)は二重 rAF で入力欄へフォーカスします(select は select 要素、
//     それ以外はテキスト入力の末尾へ)。
//   - 外側 pointerdown で閉じます(パネル内と data-ssg-filter-keep-open 配下は除外。Escape はここでは
//     扱いません = 旧実装どおり。ツールパネル側の suppressEscape 経由で閉じます)。
//   - update(args) はレンダー後に毎回呼ばれる前提で、ResizeObserver の接続 / フォーカス予約は update で
//     「開いていてパネル要素があるか」「フォーカス条件(列 / 配置)が変わったか」を見て行います(旧 effect 相当)。
import type {
  ColumnFilterUiType,
  ColumnFilterValue,
  GridColumn,
} from '../model/gridTypes.unbound';
import {
  columnFilterValueToDraftText,
  isDateSetColumnFilterValue,
  isNumberColumnFilterValue,
  isNumberSetColumnFilterValue,
  isTextSetColumnFilterValue,
} from '../logic/filtering';
import {
  numberFilterValueToConditionDraft,
  parsedNumberFilterToConditionDraft,
  type NumberFilterConditionDraft,
} from '../logic/numberFilterCondition';
import {
  parsedTextFilterToConditionDraft,
  type TextFilterConditionDraft,
} from '../logic/textFilterCondition';
import {
  parsedDateFilterToConditionDraft,
  type DateFilterConditionDraft,
} from '../logic/dateFilterCondition';
import { computeFilterPopoverPlacement } from '../logic/filterPopoverLayout';
import { isFilterPopoverOutsideTarget } from '../logic/filterPopoverOutsideClick';
import { isInsideDetailCardOf } from '../logic/detailRow';
import { createValueStore } from '../logic/valueStore';
import {
  blurForPopover,
  createPopoverWindowBindings,
  restoreGridFocus,
  type ReadonlyElementRef,
} from './popoverSupport';

export type HeaderFilterPopoverState = {
  columnKey: string;
  filterType: ColumnFilterUiType;
  draftValue: string;
  numberDraft: NumberFilterConditionDraft | null;
  textDraft: TextFilterConditionDraft | null;
  dateDraft: DateFilterConditionDraft | null;
};

export type FilterPopoverLayout = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

export type FilterPopoverSnapshot = {
  state: HeaderFilterPopoverState | null;
  layout: FilterPopoverLayout | null;
};

export type FilterPopoverControllerArgs<T> = {
  visibleColumns: GridColumn<T>[];
  columnFilterValues: Record<string, ColumnFilterValue>;
  enableColumnFilter: boolean;
  gridRootRef: ReadonlyElementRef;
  resolveColumnFilterType?: (column: GridColumn<T>) => ColumnFilterUiType;
};

export type FilterPopoverController<T> = {
  update: (args: FilterPopoverControllerArgs<T>) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => FilterPopoverSnapshot;
  panelRef: { current: HTMLDivElement | null };
  textInputRef: { current: HTMLInputElement | null };
  selectRef: { current: HTMLSelectElement | null };
  open: (column: GridColumn<T>) => void;
  close: () => void;
  updateDraft: (value: string) => void;
  updateNumberDraft: (draft: NumberFilterConditionDraft) => void;
  updateTextDraft: (draft: TextFilterConditionDraft) => void;
  updateDateDraft: (draft: DateFilterConditionDraft) => void;
  dispose: () => void;
};

const POPUP_WIDTH = 240;
const VIEWPORT_MARGIN = 8;
const OFFSET_Y = 8;
// パネル実測前の見積もり高さ(通常 / set / 複合)。
const ESTIMATED_POPUP_HEIGHT = 230;
const ESTIMATED_SET_POPUP_HEIGHT = 340;
const ESTIMATED_COMBO_POPUP_HEIGHT = 480;

// 開いている列(filterType は開いたときに解決した種別で上書き)。純関数(アダプタの useMemo と共用)。
export const resolveOpenedFilterColumn = <T,>(
  visibleColumns: GridColumn<T>[],
  state: HeaderFilterPopoverState | null,
): GridColumn<T> | null => {
  if (!state) {
    return null;
  }
  const column = visibleColumns.find((candidate) => candidate.key === state.columnKey) ?? null;
  if (!column || column.filterType === state.filterType) {
    return column;
  }
  return { ...column, filterType: state.filterType };
};

export const createFilterPopoverController = <T,>(): FilterPopoverController<T> => {
  let args: FilterPopoverControllerArgs<T> | null = null;
  const store = createValueStore<FilterPopoverSnapshot>({ state: null, layout: null });
  const panelRef: { current: HTMLDivElement | null } = { current: null };
  const textInputRef: { current: HTMLInputElement | null } = { current: null };
  const selectRef: { current: HTMLSelectElement | null } = { current: null };
  let anchorElement: HTMLElement | null = null;
  let measuredHeight: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let observedPanel: HTMLDivElement | null = null;
  let focusFrame1: number | null = null;
  let focusFrame2: number | null = null;
  // フォーカス予約の条件キー(旧 effect deps: openedFilterColumn / layout の top・left・width)。
  let lastFocusKey: string | null = null;
  let lastVisibleColumns: GridColumn<T>[] | null = null;

  const setLayout = (next: FilterPopoverLayout | null) => {
    const current = store.getSnapshot();
    const prev = current.layout;
    if (
      prev === next ||
      (prev !== null &&
        next !== null &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.maxHeight === next.maxHeight)
    ) {
      return;
    }
    store.setSnapshot({ ...current, layout: next });
  };

  const openedColumn = () =>
    args === null ? null : resolveOpenedFilterColumn(args.visibleColumns, store.getSnapshot().state);

  const updateLayout = () => {
    const state = store.getSnapshot().state;
    if (!state || !anchorElement) {
      setLayout(null);
      return;
    }
    const anchorRect = anchorElement.getBoundingClientRect();
    const column = openedColumn();
    const filterType = column?.filterType;
    const estimatedPopupHeight =
      filterType === 'numberSet' || filterType === 'textSet' || filterType === 'dateSet'
        ? ESTIMATED_COMBO_POPUP_HEIGHT
        : filterType === 'set'
          ? ESTIMATED_SET_POPUP_HEIGHT
          : ESTIMATED_POPUP_HEIGHT;
    const { top, left, maxHeight } = computeFilterPopoverPlacement({
      anchorTop: anchorRect.top,
      anchorBottom: anchorRect.bottom,
      anchorRight: anchorRect.right,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      popupWidth: POPUP_WIDTH,
      popupHeight: measuredHeight ?? estimatedPopupHeight,
      offsetY: OFFSET_Y,
      viewportMargin: VIEWPORT_MARGIN,
    });
    setLayout({ top, left, width: POPUP_WIDTH, maxHeight });
  };

  const cancelFocusFrames = () => {
    if (focusFrame1 !== null) {
      cancelAnimationFrame(focusFrame1);
      focusFrame1 = null;
    }
    if (focusFrame2 !== null) {
      cancelAnimationFrame(focusFrame2);
      focusFrame2 = null;
    }
  };

  const disconnectObserver = () => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    observedPanel = null;
  };

  const close = () => {
    store.setSnapshot({ state: null, layout: null });
    anchorElement = null;
    textInputRef.current = null;
    selectRef.current = null;
    measuredHeight = null;
    bindings.detach();
    disconnectObserver();
    cancelFocusFrames();
    lastFocusKey = null;
    if (args !== null) {
      restoreGridFocus(args.gridRootRef);
    }
  };

  const bindings = createPopoverWindowBindings({
    onResize: updateLayout,
    onScroll: updateLayout,
    isInside: (target) => !isFilterPopoverOutsideTarget(target, panelRef.current),
    onOutsidePointerDown: close,
  });

  const open = (column: GridColumn<T>) => {
    if (args === null || !args.enableColumnFilter) {
      return;
    }
    const { gridRootRef, resolveColumnFilterType, columnFilterValues } = args;
    blurForPopover(gridRootRef.current);

    // アンカー: root 内のヘッダーセル(展開行カード内のネストしたグリッドのセルは除外)。
    const rootEl = gridRootRef.current;
    const headerCells = rootEl?.querySelectorAll<HTMLElement>('[data-ssg-col-key]');
    anchorElement =
      rootEl && headerCells
        ? (Array.from(headerCells).find(
            (cell) =>
              cell.dataset.ssgColKey === column.key && !isInsideDetailCardOf(rootEl, cell),
          ) ?? null)
        : null;

    const filterType: ColumnFilterUiType =
      column.filterType === 'auto' && resolveColumnFilterType
        ? resolveColumnFilterType(column)
        : ((column.filterType ?? 'text') as ColumnFilterUiType);

    const currentValue = columnFilterValues[column.key];
    const numberDraft =
      filterType === 'number'
        ? numberFilterValueToConditionDraft(
            isNumberColumnFilterValue(currentValue) ? currentValue : undefined,
          )
        : filterType === 'numberSet'
          ? parsedNumberFilterToConditionDraft(
              isNumberSetColumnFilterValue(currentValue) ? currentValue.condition : undefined,
            )
          : null;
    const textDraft =
      filterType === 'textSet'
        ? parsedTextFilterToConditionDraft(
            isTextSetColumnFilterValue(currentValue) ? currentValue.condition : undefined,
          )
        : null;
    const dateDraft =
      filterType === 'dateSet'
        ? parsedDateFilterToConditionDraft(
            isDateSetColumnFilterValue(currentValue) ? currentValue.condition : undefined,
          )
        : null;

    store.setSnapshot({
      ...store.getSnapshot(),
      state: {
        columnKey: column.key,
        filterType,
        draftValue: columnFilterValueToDraftText(currentValue),
        numberDraft,
        textDraft,
        dateDraft,
      },
    });
    updateLayout();
    bindings.attach();
  };

  const patchState = (patch: Partial<HeaderFilterPopoverState>) => {
    const current = store.getSnapshot();
    if (!current.state) {
      return;
    }
    store.setSnapshot({ ...current, state: { ...current.state, ...patch } });
  };

  // パネル実測(ResizeObserver)の接続 / 切断を「開いていてパネル要素があるか」で同期します。
  const syncObserver = () => {
    const panel = panelRef.current;
    const rendered = store.getSnapshot().layout !== null && panel !== null;
    if (!rendered || typeof ResizeObserver === 'undefined') {
      disconnectObserver();
      return;
    }
    if (observedPanel === panel) {
      return;
    }
    disconnectObserver();
    resizeObserver = new ResizeObserver(() => {
      const nextHeight = panelRef.current?.getBoundingClientRect().height ?? null;
      if (nextHeight === null || nextHeight === measuredHeight) {
        return;
      }
      measuredHeight = nextHeight;
      updateLayout();
    });
    resizeObserver.observe(panel);
    observedPanel = panel;
  };

  // 入力欄へのフォーカス予約(列 / 配置が変わったときだけ)。
  const syncFocus = () => {
    const { state, layout } = store.getSnapshot();
    const column = openedColumn();
    if (!state || !column || !layout) {
      cancelFocusFrames();
      lastFocusKey = null;
      return;
    }
    // 旧 useMemo の deps(columnKey / visibleColumns 参照 / filterType)と layout 座標で判定します。
    const visibleColumnsChanged = lastVisibleColumns !== args?.visibleColumns;
    const key = `${state.columnKey}|${state.filterType}|${layout.top}|${layout.left}|${layout.width}`;
    if (!visibleColumnsChanged && lastFocusKey === key) {
      return;
    }
    lastFocusKey = key;
    lastVisibleColumns = args?.visibleColumns ?? null;
    cancelFocusFrames();
    const filterType = column.filterType ?? 'text';
    focusFrame1 = requestAnimationFrame(() => {
      focusFrame1 = null;
      focusFrame2 = requestAnimationFrame(() => {
        focusFrame2 = null;
        if (filterType === 'select') {
          selectRef.current?.focus();
          return;
        }
        const inputElement = textInputRef.current;
        if (!inputElement) {
          return;
        }
        inputElement.focus();
        if (inputElement.type === 'text') {
          const end = inputElement.value.length;
          inputElement.setSelectionRange(end, end);
        }
      });
    });
  };

  return {
    update: (next) => {
      args = next;
      syncObserver();
      syncFocus();
    },
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    panelRef,
    textInputRef,
    selectRef,
    open,
    close,
    updateDraft: (value) => patchState({ draftValue: value }),
    updateNumberDraft: (draft) => patchState({ numberDraft: draft }),
    updateTextDraft: (draft) => patchState({ textDraft: draft }),
    updateDateDraft: (draft) => patchState({ dateDraft: draft }),
    dispose: () => {
      bindings.detach();
      disconnectObserver();
      cancelFocusFrames();
    },
  };
};