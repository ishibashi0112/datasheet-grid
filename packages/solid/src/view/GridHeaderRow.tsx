// 列見出しの行(1 つのペインぶん)。React 版の view/GridHeaderRow.tsx と同じ DOM と class。
//   段階 1(機能なし)の範囲: コーナー(# / 全選択のチェック)・見出しの文字(renderHeader)・並びの印・フィルター中の印・
//   列幅のつまみ。列の並べ替えのつまみ(grip)は機能 columnReorder で、シェルが onColumnDragHandlePointerDown を渡したときだけ
//   描きます。列メニューの ⋮ と見出しの右クリックは機能 columnMenu で、シェルが enableColumnMenu を true にしたときだけ出します。
import { For, Show, createMemo } from 'solid-js';
import type {
  ColumnFilterValue,
  GridSortState,
  HeaderRenderContext,
  SelectAllState,
} from '@ishibashi0112/spreadsheet-grid-core';
import type { PaneColumnEntry } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import type { SelectionSnapshot } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridSelectors';
import { isActiveColumnFilterValue } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/filtering';
import {
  DETAIL_TOGGLE_COLUMN_KEY,
  isSyntheticColumnKey,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/detailRow';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/rowReorder';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import { isFromRenderHeaderControl } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/domGuards';
import type { GridColumn, GridResolvedSlots, SolidGridTypes } from '../model/gridTypes';
import { useGridLocaleText } from '../context/localeText';
import { px } from '../primitives/style';
import { RowSelectionCheckbox } from './RowSelectionCheckbox';

// ホバーで出る操作をラベルと状態の間に並べる見出しの幅の下限(px)。React 版の view/GridHeaderRow.tsx と同じ値。
const HEADER_INLINE_ACTIONS_MIN_WIDTH = 120;

export type GridPaneKind = 'left' | 'center' | 'right';

type GridHeaderRowProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  leadingWidth: number;
  headerHeight: number;
  rowHeaderWidth: number;
  slots: GridResolvedSlots;
  isCornerHovered: boolean;
  isWholeGridSelected: boolean;
  showSelectAllCheckbox: boolean;
  selectAllState: SelectAllState;
  filteredRowsLength: number;
  visibleColumnsLength: number;
  entries: readonly PaneColumnEntry<T>[];
  hoveredColumnIndex: number | null;
  selection: SelectionSnapshot;
  columnFilterValues: Record<string, ColumnFilterValue>;
  sort: GridSortState;
  enableColumnResize: boolean;
  onCornerPointerDown: (event: PointerEvent) => void;
  onCornerPointerEnter: () => void;
  onCornerPointerLeave: () => void;
  onColumnHeaderPointerDown: (colIndex: number, event: PointerEvent) => void;
  onColumnHeaderPointerEnter: (colIndex: number, event: PointerEvent) => void;
  onColumnHeaderPointerLeave: (colIndex: number) => void;
  onColumnResizePointerDown: (column: GridColumn<T>, event: PointerEvent) => void;
  // 列の並べ替えの grip の pointerdown(機能 columnReorder。onColumnsChange があるときだけ。無ければ grip を出さない)。
  onColumnDragHandlePointerDown?: ((column: GridColumn<T>, event: PointerEvent & { currentTarget: HTMLElement }) => void) | undefined;
  // 列メニュー(機能 columnMenu)。false のときは ⋮ を出さず、右クリックもブラウザの標準のメニューのまま。
  enableColumnMenu: boolean;
  // メニューを開いている列のキー(⋮ の active の表示と aria-expanded)。
  openedMenuColumnKey: string | null;
  // ⋮ の pointerdown(マウスはここで開く)と click(タッチとキーボードはここで開く)。見出しの右クリック。
  onColumnMenuButtonPointerDown?:
    | ((column: GridColumn<T>, event: PointerEvent & { currentTarget: HTMLButtonElement }) => void)
    | undefined;
  onColumnMenuButtonClick?: ((column: GridColumn<T>, event: MouseEvent & { currentTarget: HTMLButtonElement }) => void) | undefined;
  onColumnHeaderContextMenu?: ((column: GridColumn<T>, event: MouseEvent) => void) | undefined;
};

// React 版の <svg focusable="false">(Solid の型には focusable が無いので属性として渡す)。
const SVG_NOT_FOCUSABLE = { focusable: 'false' } as Record<string, string>;

export function GridHeaderRow<T>(props: GridHeaderRowProps<T>) {
  const texts = useGridLocaleText();
  return (
    <div
      data-pane={props.pane}
      role="row"
      aria-rowindex={1}
      class={['ssg-header-row', props.slots.headerRow?.className]}
      style={{ ...props.slots.headerRow?.style, height: px(props.headerHeight) }}
    >
      <Show when={props.ownsRowHeader}>
        <div
          role="columnheader"
          aria-colindex={1}
          onPointerDown={(event) => props.onCornerPointerDown(event)}
          onPointerEnter={() => props.onCornerPointerEnter()}
          onPointerLeave={() => props.onCornerPointerLeave()}
          class={[
            'ssg-header-cell',
            'ssg-corner-cell',
            props.slots.rowHeaderCell?.className,
            props.slots.cornerCell?.className,
            {
              'ssg-corner-cell--checkbox': props.showSelectAllCheckbox,
              'ssg-header-cell--selected': props.isWholeGridSelected,
              'ssg-header-cell--hovered': props.isCornerHovered,
            },
          ]}
          style={{
            ...props.slots.rowHeaderCell?.style,
            ...props.slots.cornerCell?.style,
            width: px(props.rowHeaderWidth),
            'min-width': px(props.rowHeaderWidth),
            height: px(props.headerHeight),
            cursor: props.filteredRowsLength > 0 && props.visibleColumnsLength > 0 ? 'pointer' : 'default',
          }}
        >
          <Show when={props.showSelectAllCheckbox} fallback="#">
            <RowSelectionCheckbox
              slot={props.slots.checkbox}
              label={texts().selectAllRows}
              state={
                props.selectAllState === 'all'
                  ? 'checked'
                  : props.selectAllState === 'some'
                    ? 'indeterminate'
                    : 'unchecked'
              }
            />
          </Show>
        </div>
      </Show>
      <For each={props.entries} keyed={(entry) => entry.column.key}>
        {(entry) => {
          // 列と位置と幅は memo で受ける(列の並びの配列が作り直されても、値が同じなら見出しの中身を作り直さない)。
          const column = createMemo(() => entry().column as unknown as GridColumn<T>);
          const colIndex = createMemo(() => entry().logicalIndex);
          const size = createMemo(() => entry().paneLocalSize);
          const isFiltered = () => isActiveColumnFilterValue(props.columnFilterValues[column().key]);
          const isColumnSelected = () =>
            props.selection.kind === 'col' &&
            colIndex() >= props.selection.startCol &&
            colIndex() <= props.selection.endCol;
          const sortIndex = () => props.sort.findIndex((item) => item.columnKey === column().key);
          const sortEntry = () => props.sort[sortIndex()];
          const isSynthetic = () => isSyntheticColumnKey(column().key);
          const isDetailToggleColumn = () =>
            column().key === DETAIL_TOGGLE_COLUMN_KEY || column().key === ROW_DRAG_HANDLE_COLUMN_KEY;
          const headerAlign = () => column().headerAlign ?? column().align;
          // renderHeader へ渡す文脈は読んだときに引く形にする(幅やフィルターが変わるたびに中身を作り直さないように。
          //   renderHeader の本体で読んだ値が変われば、そのときは作り直す)。
          const headerContext: HeaderRenderContext<T, SolidGridTypes> = {
            get colIndex() {
              return colIndex();
            },
            get width() {
              return size();
            },
            get column() {
              return column();
            },
            get filterValue() {
              return props.columnFilterValues[column().key];
            },
            get isFiltered() {
              return isFiltered();
            },
          };
          return (
            <div
              data-ssg-col-key={column().key}
              role="columnheader"
              aria-colindex={colIndex() + 2}
              aria-sort={
                sortIndex() === 0 && sortEntry() ? (sortEntry()?.direction === 'asc' ? 'ascending' : 'descending') : undefined
              }
              onPointerDown={(event) => {
                if (column().renderHeader && isFromRenderHeaderControl(event.target, event.currentTarget)) {
                  return;
                }
                props.onColumnHeaderPointerDown(colIndex(), event);
              }}
              onPointerEnter={(event) => props.onColumnHeaderPointerEnter(colIndex(), event)}
              onPointerLeave={() => props.onColumnHeaderPointerLeave(colIndex())}
              onContextMenu={(event) => {
                // 合成列は列メニューの対象外(ブラウザのメニューも出さない)。ほかの列のメニューは機能(columnMenu)。
                if (isSynthetic()) {
                  event.preventDefault();
                  return;
                }
                props.onColumnHeaderContextMenu?.(column(), event);
              }}
              class={[
                'ssg-header-cell',
                props.slots.headerCell?.className,
                {
                  'ssg-header-cell--selected': props.isWholeGridSelected || isColumnSelected(),
                  'ssg-header-cell--hovered': props.hoveredColumnIndex === colIndex(),
                  'ssg-header-cell--align-center': headerAlign() === 'center',
                  'ssg-header-cell--align-right': headerAlign() === 'right',
                  'ssg-header-cell--inline-actions': size() >= HEADER_INLINE_ACTIONS_MIN_WIDTH,
                },
              ]}
              style={{
                ...props.slots.headerCell?.style,
                left: px(props.leadingWidth + entry().paneLocalStart),
                width: px(size()),
                'min-width': px(size()),
                height: px(props.headerHeight),
              }}
            >
              <div
                class={[
                  'ssg-header-label',
                  { 'ssg-header-label--filtered': isFiltered(), 'ssg-header-label--custom': Boolean(column().renderHeader) },
                ]}
                data-ssg-tooltip={column().renderHeader || isDetailToggleColumn() ? undefined : column().title || column().key}
              >
                {column().renderHeader
                  ? column().renderHeader?.(headerContext)
                  : isDetailToggleColumn()
                    ? ''
                    : column().title || column().key}
              </div>
              <div class="ssg-header-status">
                <Show when={sortEntry()}>
                  {(sort) => (
                    <span
                      aria-hidden="true"
                      data-ssg-tooltip={
                        (sort().direction === 'asc' ? texts().sortedAscending : texts().sortedDescending) +
                        (props.sort.length > 1 ? formatLocaleText(texts().sortPriority, { priority: sortIndex() + 1 }) : '')
                      }
                      class="ssg-header-sort"
                    >
                      {sort().direction === 'asc' ? '↑' : '↓'}
                      <Show when={props.sort.length > 1}>
                        <span class="ssg-header-sort-priority">{sortIndex() + 1}</span>
                      </Show>
                    </span>
                  )}
                </Show>
                <Show when={isFiltered()}>
                  <span aria-hidden="true" data-ssg-tooltip={texts().columnFiltered} class="ssg-header-filtered-mark">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...SVG_NOT_FOCUSABLE}>
                      <path d="M2 4 L14 4 L9.2 9.2 L9.2 13 L6.8 13 L6.8 9.2 Z" />
                    </svg>
                  </span>
                </Show>
              </div>
              <div class="ssg-header-actions">
                {/* 列の並べ替えの grip(合成列には出さない)。ホバーで出る(CSS)。 */}
                <Show when={!isSynthetic() && props.onColumnDragHandlePointerDown}>
                  {(handler) => (
                    <span
                      onPointerDown={(event) => handler()(column(), event)}
                      data-ssg-tooltip={texts().dragColumn}
                      aria-hidden="true"
                      class="ssg-header-grip"
                    >
                      <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden="true" {...SVG_NOT_FOCUSABLE}>
                        <circle cx="2" cy="3" r="1" />
                        <circle cx="6" cy="3" r="1" />
                        <circle cx="2" cy="7" r="1" />
                        <circle cx="6" cy="7" r="1" />
                        <circle cx="2" cy="11" r="1" />
                        <circle cx="6" cy="11" r="1" />
                      </svg>
                    </span>
                  )}
                </Show>
                {/* 列メニューの ⋮(合成列には出さない)。Tab の止まる先には入れない(キー操作はグリッドの本体で行う)。 */}
                <Show when={props.enableColumnMenu && !isSynthetic()}>
                  <button
                    type="button"
                    tabindex={-1}
                    data-ssg-tooltip={texts().columnMenu}
                    aria-label={formatLocaleText(texts().columnMenuFor, { column: column().title?.trim() || column().key })}
                    aria-haspopup="menu"
                    aria-expanded={props.openedMenuColumnKey === column().key ? 'true' : 'false'}
                    onPointerDown={(event) => props.onColumnMenuButtonPointerDown?.(column(), event)}
                    onClick={(event) => props.onColumnMenuButtonClick?.(column(), event)}
                    class={[
                      'ssg-icon-btn',
                      { 'ssg-icon-btn--active': props.openedMenuColumnKey === column().key },
                      props.slots.iconButton?.className,
                    ]}
                    style={props.slots.iconButton?.style}
                  >
                    ⋮
                  </button>
                </Show>
              </div>
              <Show when={column().resizable ?? props.enableColumnResize}>
                <div
                  onPointerDown={(event) => props.onColumnResizePointerDown(column(), event)}
                  class="ssg-header-resize"
                />
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}