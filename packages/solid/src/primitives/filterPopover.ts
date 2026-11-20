// 列フィルターのポップオーバー(機能 features/filtering)のコントローラを Solid へつなぎます。React 版の
//   features/filtering.tsx の useFilterPopover + hooks/useFilterPopoverController.ts にあたるものです。中身は core の
//   controllers/filterPopoverController(見出しの下に置く、画面に収まらなければ上へ返す / 高さを抑える、外側の押下・グリッドが
//   隠れたときに閉じる、開いた後の入力欄へのフォーカス、条件の下書き)。
//   - filterType: 'auto' の列は、開いたときに 1 回だけ種別を推定して覚えます(行の追加 / 編集で推定が揺れて、掛けた条件と画面が
//     食い違わないように。判定の材料が無かった回は覚えない)。掛かっている条件の kind が最優先(applyState で戻した状態)。
//   - 行のグループ化の最中はグループ元の列も開けます(表示から外れているので、自動グループ列の見出しの下に出す)。
//   - コントローラの update は、パネルが描かれた後(ふつうの effect)に渡します。パネルの高さの測り直しと、開いた後のフォーカスの
//     予約はパネルの要素が要るため(React 版はコミット後のレイアウト effect で描くたびに渡す)。
import { createMemo, createSignal, untrack } from 'solid-js';
import {
  createFilterPopoverController,
  resolveOpenedFilterColumn,
  type FilterPopoverController,
  type FilterPopoverLayout,
  type HeaderFilterPopoverState,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/filterPopoverController';
import { inferColumnFilterType } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/inferFilterType';
import { getCellValue } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
import { GROUP_AUTO_COLUMN_KEY } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/grouping';
import type {
  ColumnFilterUiType,
  GridColumn,
} from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridTypes.unbound';
import type { ColumnFilterValue } from '@ishibashi0112/spreadsheet-grid-core';
import { connectController } from './controller';
import { createExternalStoreSignal } from './externalStore';

export type FilterPopoverInputs<T> = {
  visibleColumns: () => GridColumn<T>[];
  columnFilters: () => Record<string, ColumnFilterValue>;
  columnFilterEnabled: () => boolean;
  gridRootRef: { readonly current: HTMLDivElement | null };
  isServerSide: () => boolean;
  rows: () => T[];
  // ラベル行の述語(ラベル行は種別の推定で空として数える)。無ければ undefined。
  isLabelRow?: (() => ((row: T, index: number) => boolean) | undefined) | undefined;
  // 行のグループ化の最中のグループ元の列(無ければ空)。
  groupColumns?: (() => GridColumn<T>[]) | undefined;
};

export type FilterPopover<T> = {
  state: () => HeaderFilterPopoverState | null;
  layout: () => FilterPopoverLayout | null;
  // 開いている列(filterType は開いたときに解決した種別)/ その種別。
  openedColumn: () => GridColumn<T> | null;
  openedFilterType: () => ColumnFilterUiType | null;
  // 開いているか(真偽値が変わったときだけ知らせる)。
  isOpen: () => boolean;
  // パネルの要素(部品が渡す。外側の押下の判定・高さの測り直し・開いた後のフォーカス)。
  setPanel: (element: HTMLDivElement) => void;
  panelRef: FilterPopoverController<T>['panelRef'];
  textInputRef: FilterPopoverController<T>['textInputRef'];
  selectRef: FilterPopoverController<T>['selectRef'];
  open: FilterPopoverController<T>['open'];
  close: FilterPopoverController<T>['close'];
  updateDraft: FilterPopoverController<T>['updateDraft'];
  updateNumberDraft: FilterPopoverController<T>['updateNumberDraft'];
  updateTextDraft: FilterPopoverController<T>['updateTextDraft'];
  updateDateDraft: FilterPopoverController<T>['updateDateDraft'];
};

const NO_GROUP_COLUMNS: never[] = [];

export function createFilterPopover<T>(inputs: FilterPopoverInputs<T>): FilterPopover<T> {
  const controller = createFilterPopoverController<T>();
  // 'auto' の列の推定の控え(列キー → 種別)。
  const autoFilterTypeCache = new Map<string, ColumnFilterUiType>();
  // 開いたときに呼ばれます(イベントの中なので、今の値を読むだけ)。
  const resolveAutoColumnFilterType = (column: GridColumn<T>): ColumnFilterUiType =>
    untrack(() => {
      const currentValue = inputs.columnFilters()[column.key];
      if (
        currentValue?.kind === 'numberSet' ||
        currentValue?.kind === 'textSet' ||
        currentValue?.kind === 'dateSet' ||
        currentValue?.kind === 'text'
      ) {
        return currentValue.kind;
      }
      const cached = autoFilterTypeCache.get(column.key);
      if (cached) {
        return cached;
      }
      const rows = inputs.rows();
      const isLabelRow = inputs.isLabelRow?.();
      const result = inferColumnFilterType({
        editorType: column.editor?.type,
        isServerSide: inputs.isServerSide(),
        rowCount: rows.length,
        // ラベル行は空として数えます(見出しの文字で数値の列が文字の列に推定されないように)。
        getRawValueAt: (index) => {
          const row = rows[index];
          return isLabelRow && row !== undefined && isLabelRow(row, index) ? undefined : getCellValue(row, column);
        },
      });
      if (result.conclusive) {
        autoFilterTypeCache.set(column.key, result.filterType);
      }
      return result.filterType;
    });

  const groupColumns = createMemo(() => inputs.groupColumns?.() ?? NO_GROUP_COLUMNS);
  const popoverColumns = createMemo(() => {
    const groups = groupColumns();
    return groups.length > 0 ? [...inputs.visibleColumns(), ...groups] : inputs.visibleColumns();
  });
  const resolveAnchorColumnKey = (columnKey: string): string =>
    untrack(groupColumns).some((column) => column.key === columnKey) ? GROUP_AUTO_COLUMN_KEY : columnKey;

  const snapshot = createExternalStoreSignal(controller);
  const state = createMemo(() => snapshot().state);
  const layout = createMemo(() => snapshot().layout);
  const [panel, setPanel] = createSignal<HTMLDivElement | null>(null);
  connectController(
    controller,
    () => {
      // パネルの出し入れと開閉 / 位置の変化でも渡し直します(高さの測り直しとフォーカスの予約)。
      panel();
      state();
      layout();
      return {
        visibleColumns: popoverColumns(),
        columnFilterValues: inputs.columnFilters(),
        enableColumnFilter: inputs.columnFilterEnabled(),
        gridRootRef: inputs.gridRootRef,
        resolveColumnFilterType: resolveAutoColumnFilterType,
        resolveAnchorColumnKey,
      };
    },
    'effect',
  );
  // 開いている列は、列のキーと種別と列の定義が変わったときだけ作り直します。state には下書きも入っていて、種別を推定した
  //   列('auto')では core が毎回 { ...column, filterType } を作るので、state をそのまま読むと打つたびに新しい列になり、
  //   その先(相対の期間のチップ・差し替えた日付欄)が作り直されてフォーカスが外れる(別視点のレビュー)。
  const openedColumnKey = createMemo(() => state()?.columnKey ?? null);
  const openedFilterType = createMemo(() => state()?.filterType ?? null);
  const openedColumn = createMemo(() => {
    openedColumnKey();
    openedFilterType();
    return resolveOpenedFilterColumn(popoverColumns(), untrack(state));
  });
  return {
    state,
    layout,
    openedColumn,
    openedFilterType,
    isOpen: createMemo(() => state() !== null),
    setPanel: (element) => {
      controller.panelRef.current = element;
      setPanel(element);
    },
    panelRef: controller.panelRef,
    textInputRef: controller.textInputRef,
    selectRef: controller.selectRef,
    open: controller.open,
    close: controller.close,
    updateDraft: controller.updateDraft,
    updateNumberDraft: controller.updateNumberDraft,
    updateTextDraft: controller.updateTextDraft,
    updateDateDraft: controller.updateDateDraft,
  };
}