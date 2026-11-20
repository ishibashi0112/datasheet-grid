// 行のグループ化(列の rowGroup / aggFunc)のグループ行(機能 features/grouping の部品)。React 版の view/GridBodyGroupRow.tsx と
//   同じ DOM と class。セルの位置と境界は葉の行と同じで、中身だけを差し替えます:
//   - 自動グループ列(GROUP_AUTO_COLUMN_KEY): 段の字下げ + 開閉のボタン + 名前 + 件数。
//   - aggFunc の列: 集計値(合計行と同じ書式。列幅に収まらなければ「…」とツールチップ)。
//   - そのほかの列: 空。
//   セルを押すとアクティブセルになり(Enter / Space の開閉が押した行に効く)、行のダブルクリックと開閉のボタンで開け閉め
//   します。
import { For, Show, createMemo } from 'solid-js';
import type { CellCoord, GridGroupRow } from '@ishibashi0112/spreadsheet-grid-core';
import { GROUP_AUTO_COLUMN_KEY } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/grouping';
import type { PaneColumnEntry } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import {
  formatTotalRowCellText,
  formatTotalRowNumber,
  resolveTotalRowCaption,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/totalRow';
import type { DEFAULT_GROUPING_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { GridColumn, GridResolvedSlots } from '../model/gridTypes';
import { useFeatureLocaleText } from '../context/localeText';
import { px } from '../primitives/style';
import type { GridPaneKind } from './GridHeaderRow';

type GridBodyGroupRowProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  leadingWidth: number;
  rowIndex: number;
  top: number;
  rowHeight: number;
  rowHeaderWidth: number;
  entries: readonly PaneColumnEntry<T>[];
  // aria-rowindex に足す数(上の固定行の数)。
  ariaRowOffset: number;
  isRowHovered: boolean;
  // 行の選択のチェックボックスを出す表か(グループ行は選べないので、行番号の欄は空にする)。
  showRowCheckbox: boolean;
  groupRow: GridGroupRow;
  isCollapsed: boolean;
  onGroupToggle: (groupKey: string) => void;
  onRowHeaderPointerEnter: (rowIndex: number, event: PointerEvent) => void;
  onRowHeaderPointerLeave: (rowIndex: number) => void;
  onCellPointerDown: (cell: CellCoord, event: PointerEvent) => void;
  onCellPointerEnter: (cell: CellCoord, event: PointerEvent) => void;
  slots: GridResolvedSlots;
};

// 1 段ぶんの字下げ(px)。
const GROUP_INDENT_PX = 16;

export function GridBodyGroupRow<T>(props: GridBodyGroupRowProps<T>) {
  const texts = useFeatureLocaleText<typeof DEFAULT_GROUPING_LOCALE_TEXT>();
  // 空のグループの名前は文言の表から(core は既定の「(空白)」で作る)。
  const groupLabel = () => (props.groupRow.value === null ? texts().blank : props.groupRow.label);
  // 行の選択のチェックボックスを出す表のグループ行の行番号の欄は空なので、見た目だけにします(文字の無い行見出しを作らない)。
  //   見えるセルが無いペインの行は支援技術から隠します(合計行と同じ)。
  const rowHeaderIsCell = () => props.ownsRowHeader && !props.showRowCheckbox;
  const hasCells = () => rowHeaderIsCell() || props.entries.length > 0;
  return (
    <div
      data-pane={props.pane}
      data-row-index={props.rowIndex}
      data-ssg-group-row=""
      role="row"
      aria-rowindex={props.rowIndex + 2 + props.ariaRowOffset}
      aria-hidden={hasCells() ? undefined : 'true'}
      class={['ssg-body-row', props.slots.bodyRow?.className, props.slots.groupRow?.className]}
      style={{
        ...props.slots.bodyRow?.style,
        ...props.slots.groupRow?.style,
        height: px(props.rowHeight),
        transform: `translateY(${props.top}px)`,
      }}
      onDblClick={() => props.onGroupToggle(props.groupRow.groupKey)}
    >
      <Show when={props.ownsRowHeader}>
        <div
          role={rowHeaderIsCell() ? 'rowheader' : undefined}
          aria-colindex={rowHeaderIsCell() ? 1 : undefined}
          aria-hidden={rowHeaderIsCell() ? undefined : 'true'}
          onPointerEnter={(event) => props.onRowHeaderPointerEnter(props.rowIndex, event)}
          onPointerLeave={() => props.onRowHeaderPointerLeave(props.rowIndex)}
          class={[
            'ssg-header-cell',
            'ssg-row-header-cell',
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
          {props.showRowCheckbox ? null : props.rowIndex + 1}
        </div>
      </Show>
      <For each={props.entries} keyed={(entry) => entry.column.key}>
        {(entry) => {
          // 列は memo で受ける(項目のオブジェクトは列の位置や幅が変わるたびに新しくなる。集計の表示はそれでは作り直さない)。
          const unbound = createMemo(() => entry().column);
          const column = () => unbound() as unknown as GridColumn<T>;
          const isAutoGroupColumn = () => column().key === GROUP_AUTO_COLUMN_KEY;
          // 集計値の表示(合計行と同じ書式。文字列はそのまま、個数は件数、ほかは列の valueFormatter(row は undefined)。
          //   合計以外は値の前に種類を小さく出す)。
          const aggregate = createMemo(() => {
            const current = column();
            if (isAutoGroupColumn() || !Object.prototype.hasOwnProperty.call(props.groupRow.aggregates, current.key)) {
              return null;
            }
            const value = props.groupRow.aggregates[current.key];
            const kind = typeof current.aggFunc === 'string' ? current.aggFunc : 'custom';
            return { text: formatTotalRowCellText(current, { value, kind }), caption: resolveTotalRowCaption(kind, texts()) };
          });
          const cell = (): CellCoord => ({ row: props.rowIndex, col: entry().logicalIndex });
          return (
            <div
              role="gridcell"
              aria-colindex={entry().logicalIndex + 2}
              data-ssg-col-key={column().key}
              onPointerDown={(event) => props.onCellPointerDown(cell(), event)}
              onPointerEnter={(event) => props.onCellPointerEnter(cell(), event)}
              class={[
                'ssg-body-cell',
                'ssg-group-cell',
                {
                  'ssg-body-cell--align-center': column().align === 'center',
                  'ssg-body-cell--align-right': column().align === 'right',
                  'ssg-body-cell--row-hovered': props.isRowHovered,
                },
                props.slots.bodyCell?.className,
                props.slots.groupCell?.className,
              ]}
              style={{
                ...props.slots.bodyCell?.style,
                ...props.slots.groupCell?.style,
                left: px(props.leadingWidth + entry().paneLocalStart),
                width: px(entry().paneLocalSize),
                'min-width': px(entry().paneLocalSize),
                height: px(props.rowHeight),
                'z-index': 1,
              }}
            >
              <Show
                when={isAutoGroupColumn()}
                fallback={
                  <Show when={aggregate()}>
                    {(shown) => (
                      <span
                        class="ssg-group-value"
                        data-ssg-tooltip-overflow={
                          shown().text !== ''
                            ? shown().caption !== undefined
                              ? `${shown().caption} ${shown().text}`
                              : shown().text
                            : undefined
                        }
                      >
                        <Show when={shown().caption !== undefined && shown().text !== ''}>
                          <span class="ssg-group-caption">{shown().caption}</span>
                        </Show>
                        {shown().text}
                      </span>
                    )}
                  </Show>
                }
              >
                <span
                  aria-hidden="true"
                  class="ssg-group-indent"
                  style={{ width: px(props.groupRow.level * GROUP_INDENT_PX) }}
                />
                <button
                  type="button"
                  // Tab の順番に入れません(キーボードではアクティブセルで Enter / Space)。
                  tabindex={-1}
                  class="ssg-group-toggle"
                  aria-expanded={props.isCollapsed ? 'false' : 'true'}
                  aria-label={formatLocaleText(props.isCollapsed ? texts().expandGroup : texts().collapseGroup, {
                    group: groupLabel(),
                  })}
                  onClick={() => props.onGroupToggle(props.groupRow.groupKey)}
                  onDblClick={(event) => event.stopPropagation()}
                >
                  {props.isCollapsed ? '▸' : '▾'}
                </button>
                <span class="ssg-group-label">{groupLabel()}</span>
                <span class="ssg-group-count">
                  {formatLocaleText(texts().groupRowCount, { count: formatTotalRowNumber(props.groupRow.leafCount) })}
                </span>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}