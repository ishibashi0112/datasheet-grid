// 列見出しの行(試作)。React 版の view/GridHeaderRow.tsx(565 行)のうち、見出しの文字・ソートの印・選択 / ホバーの
//   見た目・行番号の見出し(コーナー)だけ。列メニュー・フィルターの印・列幅のドラッグ・列の並べ替えのつまみは入れていない。
import { For, Show } from 'solid-js';
import type { PaneColumnEntry } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import type { GridSortState } from '@ishibashi0112/spreadsheet-grid-core';
import type { SelectionSnapshot } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridSelectors';
import { px } from '../primitives/style';

type HeaderRowProps<T> = {
  pane: 'left' | 'center' | 'right';
  ownsRowHeader: boolean;
  leadingWidth: number;
  headerHeight: number;
  rowHeaderWidth: number;
  entries: readonly PaneColumnEntry<T>[];
  selection: SelectionSnapshot;
  isWholeGridSelected: boolean;
  hoveredColumnIndex: number | null;
  isCornerHovered: boolean;
  sort: GridSortState;
  onCornerPointerDown: (event: PointerEvent) => void;
  onColumnHeaderPointerDown: (colIndex: number, event: PointerEvent) => void;
  onColumnHeaderPointerEnter: (colIndex: number, event: PointerEvent) => void;
};

export function HeaderRow<T>(props: HeaderRowProps<T>) {
  const isColumnSelected = (colIndex: number) => {
    const selection = props.selection;
    return selection.kind === 'col' && colIndex >= selection.startCol && colIndex <= selection.endCol;
  };
  return (
    <div
      data-pane={props.pane}
      role="row"
      aria-rowindex={1}
      class="ssg-header-row"
      style={{ height: px(props.headerHeight) }}
    >
      <Show when={props.ownsRowHeader}>
        <div
          role="columnheader"
          aria-colindex={1}
          onPointerDown={(event) => props.onCornerPointerDown(event)}
          class={[
            'ssg-header-cell',
            'ssg-corner-cell',
            {
              'ssg-header-cell--selected': props.isWholeGridSelected,
              'ssg-header-cell--hovered': props.isCornerHovered,
            },
          ]}
          style={{
            width: px(props.rowHeaderWidth),
            'min-width': px(props.rowHeaderWidth),
            height: px(props.headerHeight),
          }}
        />
      </Show>
      <For each={props.entries} keyed={(entry) => entry.column.key}>
        {(entry) => {
          const colIndex = () => entry().logicalIndex;
          const sortIndex = () => props.sort.findIndex((item) => item.columnKey === entry().column.key);
          const sortEntry = () => props.sort[sortIndex()];
          return (
            <div
              data-ssg-col-key={entry().column.key}
              role="columnheader"
              aria-colindex={colIndex() + 2}
              aria-sort={
                sortIndex() === 0 && sortEntry()
                  ? sortEntry()?.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : undefined
              }
              onPointerDown={(event) => props.onColumnHeaderPointerDown(colIndex(), event)}
              onPointerEnter={(event) => props.onColumnHeaderPointerEnter(colIndex(), event)}
              class={[
                'ssg-header-cell',
                {
                  'ssg-header-cell--selected': props.isWholeGridSelected || isColumnSelected(colIndex()),
                  'ssg-header-cell--hovered': props.hoveredColumnIndex === colIndex(),
                  'ssg-header-cell--align-center': (entry().column.headerAlign ?? entry().column.align) === 'center',
                  'ssg-header-cell--align-right': (entry().column.headerAlign ?? entry().column.align) === 'right',
                },
              ]}
              style={{
                left: px(props.leadingWidth + entry().paneLocalStart),
                width: px(entry().paneLocalSize),
                'min-width': px(entry().paneLocalSize),
                height: px(props.headerHeight),
              }}
            >
              <div class="ssg-header-label" data-ssg-tooltip={entry().column.title || entry().column.key}>
                {entry().column.title || entry().column.key}
              </div>
              <div class="ssg-header-status">
                <Show when={sortEntry()}>
                  {(sort) => (
                    <span aria-hidden="true" class="ssg-header-sort">
                      {sort().direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </Show>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}