// サーバーサイドの行モデル(SSRM。機能 features/serverSide の部品)の読み込み中の行(スケルトン)。React 版の
//   view/GridBodyLayer.tsx の GridBodySkeletonRow と同じ DOM と class。
//   - まだ届いていない行(getRow が undefined)の代わりに、同じ位置・同じ高さで描く(aria-busy)。セルの中身は灰色の帯で、
//     幅は列ごとに少し変える(列の位置で決まるので描き直しても同じ)。
//   - 行番号の欄とセルは押せる(アクティブセル / 範囲の選択はデータ行と同じ。行が届くと本物の行に差し替わる)。
//   行の要素はシェルの keyed の For で `__ssg_skeleton__:<位置>` のキー(データ行のキーと名前空間を分ける)。
import { For, Show } from 'solid-js';
import type { CellCoord } from '@ishibashi0112/spreadsheet-grid-core';
import type { PaneColumnEntry } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import type { GridResolvedSlots } from '../model/gridTypes';
import { px } from '../primitives/style';
import { RowSelectionCheckbox } from './RowSelectionCheckbox';
import type { GridPaneKind } from './GridHeaderRow';

type GridBodySkeletonRowProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  leadingWidth: number;
  rowIndex: number;
  top: number;
  rowHeight: number;
  // aria-rowindex に足す数(上の固定行の数)。
  ariaRowOffset: number;
  rowHeaderWidth: number;
  entries: readonly PaneColumnEntry<T>[];
  isRowHovered: boolean;
  // 行の選択のチェックボックスの枠を出すか(届いていないので、いつも使えない見た目)。
  showRowCheckbox: boolean;
  onRowHeaderPointerDown: (rowIndex: number, event: PointerEvent) => void;
  onRowHeaderPointerEnter: (rowIndex: number, event: PointerEvent) => void;
  onRowHeaderPointerLeave: (rowIndex: number) => void;
  onCellPointerDown: (cell: CellCoord, event: PointerEvent) => void;
  onCellPointerEnter: (cell: CellCoord, event: PointerEvent) => void;
  slots: GridResolvedSlots;
};

// 帯の幅を列ごとに少し変えて、機械的にそろって見えないようにする(列の位置で決める。乱数は使わない)。
const SKELETON_BAR_WIDTHS = ['62%', '46%', '78%', '54%'] as const;

export function GridBodySkeletonRow<T>(props: GridBodySkeletonRowProps<T>) {
  return (
    <div
      data-pane={props.pane}
      data-row-index={props.rowIndex}
      data-skeleton-row=""
      role="row"
      aria-rowindex={props.rowIndex + 2 + props.ariaRowOffset}
      aria-busy="true"
      class={['ssg-body-row', props.slots.bodyRow?.className]}
      style={{
        ...props.slots.bodyRow?.style,
        height: px(props.rowHeight),
        transform: `translateY(${props.top}px)`,
      }}
    >
      <Show when={props.ownsRowHeader}>
        <div
          role="rowheader"
          aria-colindex={1}
          onPointerDown={(event) => props.onRowHeaderPointerDown(props.rowIndex, event)}
          onPointerEnter={(event) => props.onRowHeaderPointerEnter(props.rowIndex, event)}
          onPointerLeave={() => props.onRowHeaderPointerLeave(props.rowIndex)}
          class={[
            'ssg-header-cell',
            'ssg-row-header-cell',
            'ssg-skeleton-rowheader',
            {
              'ssg-row-header-cell--checkbox': props.showRowCheckbox,
              'ssg-header-cell--hovered': props.isRowHovered,
            },
            props.slots.rowHeaderCell?.className,
          ]}
          style={{
            ...props.slots.rowHeaderCell?.style,
            width: px(props.rowHeaderWidth),
            'min-width': px(props.rowHeaderWidth),
            height: px(props.rowHeight),
          }}
        >
          <Show when={props.showRowCheckbox} fallback={props.rowIndex + 1}>
            <RowSelectionCheckbox slot={props.slots.checkbox} state="unchecked" disabled />
          </Show>
        </div>
      </Show>
      <For each={props.entries} keyed={(entry) => entry.logicalIndex}>
        {(entry) => {
          const cell = (): CellCoord => ({ row: props.rowIndex, col: entry().logicalIndex });
          return (
            <div
              role="gridcell"
              aria-colindex={entry().logicalIndex + 2}
              class={[
                'ssg-body-cell',
                { 'ssg-body-cell--row-hovered': props.isRowHovered },
                props.slots.bodyCell?.className,
              ]}
              onPointerDown={(event) => props.onCellPointerDown(cell(), event)}
              onPointerEnter={(event) => props.onCellPointerEnter(cell(), event)}
              style={{
                ...props.slots.bodyCell?.style,
                left: px(props.leadingWidth + entry().paneLocalStart),
                width: px(entry().paneLocalSize),
                'min-width': px(entry().paneLocalSize),
                height: px(props.rowHeight),
                'z-index': 1,
              }}
            >
              <div
                aria-hidden="true"
                class="ssg-skeleton-bar"
                style={{ width: SKELETON_BAR_WIDTHS[entry().logicalIndex % SKELETON_BAR_WIDTHS.length] }}
              />
            </div>
          );
        }}
      </For>
    </div>
  );
}