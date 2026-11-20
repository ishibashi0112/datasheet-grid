// 適用中のフィルターの一覧 / 「フィルターを追加」の候補 / 対象の列へ移ってフィルターのポップオーバーを開く処理です(ツールパネルの
//   フィルターのタブと、フィルターのチップのバーが使う。機能 features/filtering)。React 版の features/filtering.tsx の
//   useFilterManagement にあたります。
//   - 一覧は見えている列(画面の順)→ 表示から外れている列(列の定義の順)。見えていない列にも絞り込みが残っていることが
//     分かるように出します(✎ は使えない)。行のグループ化の最中のグループ元の列は「(グループ化中)」で、✎ で開ける。
//   - 対象の列へ移るとき: 中央のペインの列なら見える所まで横にスクロールし、見出しのセルが描かれるのを rAF で待って(最大 8 回)
//     から開き、見出しを一瞬光らせます(列の仮想化で描かれていない列は、開いても位置が決まらないため)。
import { createMemo, untrack } from 'solid-js';
import {
  createColumnFilterDescribeOptions,
  describeColumnFilterValue,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/filterSummary';
import { isActiveColumnFilterValue } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/filtering';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { FeatureLocaleText, ResolvedGridLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { DEFAULT_FILTERING_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import {
  computeSinglePaneColumnExtent,
  type GridPaneLayout,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import { GROUP_AUTO_COLUMN_KEY } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/grouping';
import { computeHorizontalScrollTarget } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/scrollTargets';
import { isInsideDetailCardOf } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/detailRow';
import type { GridColumn } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridTypes.unbound';
import type { ColumnFilterValue } from '@ishibashi0112/spreadsheet-grid-core';
import type { FilterManagementAddableColumn, FilterManagementEntry } from '../view/FilterManagementPanel';

type ElementRef<E> = { readonly current: E | null };
type FilteringTexts = FeatureLocaleText<typeof DEFAULT_FILTERING_LOCALE_TEXT>;

export type FilterManagementInputs<T> = {
  columns: () => GridColumn<T>[];
  orderedColumns: () => GridColumn<T>[];
  visibleColumns: () => GridColumn<T>[];
  columnFilters: () => Record<string, ColumnFilterValue>;
  scrollContainerRef: ElementRef<HTMLDivElement>;
  gridRootRef: ElementRef<HTMLDivElement>;
  paneLayout: () => GridPaneLayout<T>;
  leftPaneTotalWidth: () => number;
  centerLeadingWidth: () => number;
  rightPaneTotalWidth: () => number;
  openColumnFilterPopover: (column: GridColumn<T>) => void;
  // 行のグループ化の最中のグループ元の列(無ければ undefined)。
  groupColumns?: (() => GridColumn<T>[]) | undefined;
  localeTexts: () => ResolvedGridLocaleText;
};

export type FilterManagement = {
  entries: () => FilterManagementEntry[];
  addableColumns: () => FilterManagementAddableColumn[];
  jumpToColumnFilter: (columnKey: string) => void;
};

const NO_COLUMNS: never[] = [];
const JUMP_FLASH_CLASS_NAME = 'ssg-header-cell--jump-flash';

export function createFilterManagement<T>(inputs: FilterManagementInputs<T>): FilterManagement {
  const groupColumns = createMemo(() => inputs.groupColumns?.() ?? NO_COLUMNS);
  const groupColumnKeys = createMemo(() => new Set(groupColumns().map((column) => column.key)));

  const entries = createMemo(() => {
    const columnFilters = inputs.columnFilters();
    const texts = inputs.localeTexts();
    const result: FilterManagementEntry[] = [];
    const pushEntry = (column: GridColumn<T>, isHidden: boolean, isGrouped = false) => {
      const value = columnFilters[column.key];
      if (!value || !isActiveColumnFilterValue(value)) {
        return;
      }
      result.push({
        columnKey: column.key,
        title: column.title || column.key,
        // select / set の値はラベルで、数値の条件は列の valueFormatter で出します(チップのバーと共有)。
        summaryText: describeColumnFilterValue(value, createColumnFilterDescribeOptions(column, texts)),
        isHidden,
        isGrouped,
      });
    };
    const shownKeys = new Set<string>();
    for (const column of inputs.orderedColumns()) {
      shownKeys.add(column.key);
      pushEntry(column, false);
    }
    // 表示から外れている列(visible: false と、グループ化の最中のグループ元の列)。
    const grouped = groupColumnKeys();
    for (const column of inputs.columns()) {
      if (!shownKeys.has(column.key)) {
        const isGrouped = grouped.has(column.key);
        pushEntry(column, !isGrouped, isGrouped);
      }
    }
    return result;
  });

  // 「フィルターを追加」の候補(見えている・filterType がある・まだ掛けていない列。グループ化の最中はグループ元の列も)。
  const addableColumns = createMemo(() => {
    const columnFilters = inputs.columnFilters();
    const texts = inputs.localeTexts() as FilteringTexts;
    const grouped = groupColumnKeys();
    return [...inputs.visibleColumns(), ...groupColumns()]
      .filter((column) => Boolean(column.filterType) && !isActiveColumnFilterValue(columnFilters[column.key]))
      .map((column) => ({
        key: column.key,
        title: grouped.has(column.key)
          ? formatLocaleText(texts.groupedColumnTitle, { column: column.title || column.key })
          : column.title || column.key,
      }));
  });

  // 押したとき(イベントの中)に呼ばれるので、今の値を読むだけ。
  const jumpToColumnFilter = (columnKey: string) =>
    untrack(() => {
      const scrollElement = inputs.scrollContainerRef.current;
      // グループ元の列は表示から外れているので、自動グループ列へ移ってその見出しの下に開きます。
      const groupColumn = groupColumns().find((candidate) => candidate.key === columnKey);
      const anchorKey = groupColumn ? GROUP_AUTO_COLUMN_KEY : columnKey;
      const orderedColumns = inputs.orderedColumns();
      const colIndex = orderedColumns.findIndex((column) => column.key === anchorKey);
      if (colIndex < 0) {
        return;
      }
      const column = groupColumn ?? orderedColumns[colIndex]!;
      if (scrollElement) {
        const single = computeSinglePaneColumnExtent(inputs.paneLayout(), colIndex);
        if (single && single.pane === 'center') {
          const leftPaneWidth = inputs.leftPaneTotalWidth();
          const target = computeHorizontalScrollTarget({
            cellLeft: leftPaneWidth + inputs.centerLeadingWidth() + single.extent.start,
            cellWidth: single.extent.width,
            leftPaneWidth,
            rightPaneWidth: inputs.rightPaneTotalWidth(),
            viewportWidth: scrollElement.clientWidth,
            currentScrollLeft: scrollElement.scrollLeft,
            align: 'auto',
            maxScrollLeft: scrollElement.scrollWidth - scrollElement.clientWidth,
          });
          if (target !== scrollElement.scrollLeft) {
            scrollElement.scrollTo({ left: target, behavior: 'auto' });
          }
        }
      }
      const findHeaderCell = (): HTMLElement | null => {
        const root = inputs.gridRootRef.current;
        if (!root) {
          return null;
        }
        const cells = root.querySelectorAll<HTMLElement>('[data-ssg-col-key]');
        // 展開行のカードの中の入れ子のグリッドの同じ名前の列は対象外です。
        return (
          Array.from(cells).find(
            (cell) => cell.dataset.ssgColKey === anchorKey && !isInsideDetailCardOf(root, cell),
          ) ?? null
        );
      };
      const tryOpen = (attempt: number) => {
        // 外れた後に遅れて動いたときは何もしません。
        if (!inputs.gridRootRef.current) {
          return;
        }
        const cell = findHeaderCell();
        if (cell === null) {
          if (attempt < 8) {
            requestAnimationFrame(() => tryOpen(attempt + 1));
          }
          return;
        }
        inputs.openColumnFilterPopover(column);
        // 移った先の見出しを一瞬光らせます(モーションを止めているときは付けない = animationend が来ず残るため)。
        cell.classList.remove(JUMP_FLASH_CLASS_NAME);
        if (cell.closest('.ssg-motion-off') !== null) {
          return;
        }
        void cell.offsetWidth;
        cell.classList.add(JUMP_FLASH_CLASS_NAME);
        cell.addEventListener('animationend', () => cell.classList.remove(JUMP_FLASH_CLASS_NAME), { once: true });
      };
      requestAnimationFrame(() => tryOpen(0));
    });

  return { entries, addableColumns, jumpToColumnFilter };
}