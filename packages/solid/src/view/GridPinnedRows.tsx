// 表の上下に固定する行(pinnedTopRows / pinnedBottomRows。1 つのペインぶん)。React 版の view/GridPinnedRows.tsx と同じ DOM と class。
//   - 表示だけ。選択 / 編集 / 貼り付け / コピー / キー操作 / ホバーに入らない(合計行と同じ)。セルに pointer 系のハンドラを付けず、
//     data-row-index / data-row-key も持たない。行に入ったら行ホバーを外す。
//   - セルは本体と同じ見た目の部品(.ssg-body-cell)で、列の valueFormatter / renderCell(ctx.pinned)/ cellClassName /
//     条件付き書式の色(集計は本体の行)/ checkbox 列の印で描く。合成列(展開のトグルなど)は空。高さは rowHeight。
//   - 配置: 上は列見出しの直後の sticky の器(top = 列見出しの高さ)、下は本体ぶんの空きの後の sticky の器(bottom = 合計行の高さ)。
//   行は位置で対応させます(keyed={false}。利用側が毎回作り直す集計の行でも、変わった文字だけを書き換える)。
import { For, Show, createMemo } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { CellStyleContext, GridPinnedRowPosition, GridRowKey } from '@ishibashi0112/spreadsheet-grid-core';
import type { PaneColumnEntry } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import type { ConditionalFormatStatsMap } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/conditionalFormat';
import { resolveSlotProps } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/slotProps';
import { isSyntheticColumnKey } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/detailRow';
import { isCheckboxChecked } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/checkboxEditor';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { DEFAULT_PINNED_ROWS_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { getCellValue } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
import type { CellStyleContext as UnboundCellStyleContext } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridTypes.unbound';
import type { GridColumn, GridResolvedSlots, SolidGridTypes, SpreadsheetGridProps } from '../model/gridTypes';
import type { SolidGridFeatures } from '../features/types';
import { useFeatureLocaleText } from '../context/localeText';
import { CheckboxCell } from '../editors/CheckboxCell';
import { px } from '../primitives/style';
import { CHIP_COMPACT_MAX_WIDTH } from './GridBodyLayer';
import type { GridPaneKind } from './GridHeaderRow';

type GridPinnedRowsProps<T> = {
  pane: GridPaneKind;
  position: GridPinnedRowPosition;
  ownsRowHeader: boolean;
  leadingWidth: number;
  rowHeaderWidth: number;
  rows: readonly T[];
  rowHeight: number;
  // 上: 列見出しの高さ(sticky の top)。下: 合計行の高さ(sticky の bottom)。
  stickyOffset: number;
  // 下だけ: 本体(行の層)の物理の高さ。器の通常の流れの位置を箱の下端にするための空き(上は 0)。
  bodyHeight: number;
  entries: readonly PaneColumnEntry<T>[];
  rowKeyGetter: (row: T, index: number) => GridRowKey;
  // 1 行目の aria-rowindex。
  ariaRowIndexStart: number;
  getRowClassName: SpreadsheetGridProps<T>['getRowClassName'];
  showCellOverflowTooltip: boolean;
  conditionalFormat: SolidGridFeatures['conditionalFormat'];
  conditionalFormatStats: ConditionalFormatStatsMap;
  slots: GridResolvedSlots;
  onPointerEnter: () => void;
};

const noop = () => {};

// ピンの印(行見出し)。読み上げの名前(「上に固定 1」)は行見出しではなくこの印(role="img")に付けます(React 版と同じ。
//   文字の無い行見出しにしない)。
const PIN_ICON_PATH = 'M9.8 1.5 14.5 6.2l-1.4 1.4-1-.9-2.6 2.6.3 3.2-1.4 1.4-2.6-2.6-3.3 3.3-.7-.7 3.3-3.3L2.5 8l1.4-1.4 3.2.3 2.6-2.6-.9-1z';

export function GridPinnedRows<T>(props: GridPinnedRowsProps<T>) {
  const texts = useFeatureLocaleText<typeof DEFAULT_PINNED_ROWS_LOCALE_TEXT>();
  // 見えるセルが無いペインの行は支援技術から隠す(セルを持たない行を表に出さない)。
  const hidden = () => !props.ownsRowHeader && props.entries.length === 0;
  return (
    <>
      <Show when={props.bodyHeight > 0}>
        <div aria-hidden="true" style={{ height: px(props.bodyHeight) }} />
      </Show>
      <div
        class={['ssg-pinned-rows', `ssg-pinned-rows--${props.position}`]}
        style={{ [props.position]: px(props.stickyOffset), height: px(props.rows.length * props.rowHeight) }}
        onPointerEnter={() => props.onPointerEnter()}
      >
        <For each={props.rows} keyed={false}>
          {(row, index) => {
            const rowKey = () => props.rowKeyGetter(row(), index);
            const rowSlot = createMemo(() =>
              resolveSlotProps<JSX.CSSProperties>(
                props.getRowClassName?.(row(), index, {
                  row: row(),
                  rowIndex: index,
                  sourceRowIndex: index,
                  rowKey: rowKey(),
                  isSelected: false,
                  pinned: props.position,
                }),
              ),
            );
            return (
              <div
                data-pane={props.pane}
                data-ssg-pinned={props.position}
                role="row"
                aria-rowindex={props.ariaRowIndexStart + index}
                aria-hidden={hidden() ? 'true' : undefined}
                class={['ssg-pinned-row', rowSlot().className]}
                style={{ ...rowSlot().style, height: px(props.rowHeight), top: px(index * props.rowHeight) }}
              >
                <Show when={props.ownsRowHeader}>
                  <div
                    role="rowheader"
                    aria-colindex={1}
                    class={[
                      'ssg-header-cell',
                      'ssg-row-header-cell',
                      'ssg-pinned-row-header',
                      rowSlot().className,
                      props.slots.rowHeaderCell?.className,
                    ]}
                    style={{
                      ...props.slots.rowHeaderCell?.style,
                      ...rowSlot().style,
                      width: px(props.rowHeaderWidth),
                      'min-width': px(props.rowHeaderWidth),
                      height: px(props.rowHeight),
                    }}
                  >
                    <svg
                      class="ssg-pinned-row-icon"
                      viewBox="0 0 16 16"
                      role="img"
                      aria-label={formatLocaleText(
                        props.position === 'top' ? texts().pinnedTopRow : texts().pinnedBottomRow,
                        { row: index + 1 },
                      )}
                    >
                      <path d={PIN_ICON_PATH} />
                    </svg>
                  </div>
                </Show>
                <For each={props.entries} keyed={(entry) => entry.column.key}>
                  {(entry) => {
                    const unbound = createMemo(() => entry().column);
                    const column = () => unbound() as unknown as GridColumn<T>;
                    const value = createMemo(() => getCellValue(row(), unbound()));
                    // 位置は値だけの memo(項目のオブジェクトは列の位置や幅が変わるたびに新しくなる。中身はそれでは作り直さない)。
                    const colIndex = createMemo(() => entry().logicalIndex);
                    const ctx = createMemo(
                      (): CellStyleContext<T, SolidGridTypes> => ({
                        row: row(),
                        rowIndex: index,
                        sourceRowIndex: index,
                        rowKey: rowKey(),
                        colIndex: colIndex(),
                        value: value(),
                        column: column(),
                        isActive: false,
                        isSelected: false,
                        isEditing: false,
                        readOnly: true,
                        pinned: props.position,
                      }),
                    );
                    const cellSlot = createMemo(() => {
                      const cellClassName = column().cellClassName;
                      return resolveSlotProps<JSX.CSSProperties>(
                        typeof cellClassName === 'function' ? cellClassName(ctx()) : cellClassName,
                      );
                    });
                    const rules = () => (props.conditionalFormat ? column().conditionalFormat : undefined);
                    const dataBar = createMemo(() => {
                      const feature = props.conditionalFormat;
                      const format = rules()?.dataBar;
                      return feature && format
                        ? feature.resolveDataBar(format, value(), props.conditionalFormatStats.get(unbound().key))
                        : null;
                    });
                    const scaleBackground = createMemo(() => {
                      const feature = props.conditionalFormat;
                      const format = rules()?.colorScale;
                      return feature && format
                        ? feature.resolveColorScaleBackground(format, value(), props.conditionalFormatStats.get(unbound().key))
                        : null;
                    });
                    const dataBarColor = () => {
                      const bar = dataBar();
                      const format = rules()?.dataBar;
                      return bar ? (bar.negative ? format?.negativeColor : format?.color) : undefined;
                    };
                    // 中身(合成列は空 / renderCell / checkbox の印 / 条件付き書式のチップ / 表示の文字)。行・列・値が変わったときだけ作り直す。
                    const content = createMemo((): JSX.Element => {
                      const current = column();
                      if (isSyntheticColumnKey(current.key)) {
                        return null;
                      }
                      const context = ctx();
                      if (current.renderCell) {
                        return current.renderCell({ ...context, setValue: noop });
                      }
                      if (current.editor?.type === 'checkbox') {
                        return (
                          <CheckboxCell
                            slot={props.slots.checkbox}
                            label={current.title || current.key}
                            checked={isCheckboxChecked(context.value, current.editor)}
                            readOnly
                            onToggle={noop}
                          />
                        );
                      }
                      const feature = props.conditionalFormat;
                      const format = rules();
                      if (format?.dataBar?.showValue === false) {
                        return null;
                      }
                      const text = current.valueFormatter
                        ? current.valueFormatter({ value: context.value, row: context.row, column: current })
                        : String(context.value ?? '');
                      // core の関数は描画の型(F)を素通しで受ける(束ねる型だけが違う同じ値)。
                      const chips = unbound().conditionalFormat?.chips;
                      const chip =
                        feature && chips
                          ? feature.resolveChipSpec<T>(chips, context as unknown as UnboundCellStyleContext<T>)
                          : null;
                      if (feature && chip) {
                        return <feature.GridChip spec={chip}>{chip.label ?? text}</feature.GridChip>;
                      }
                      return <span class="ssg-cell-value">{text}</span>;
                    });
                    return (
                      <div
                        role="gridcell"
                        aria-colindex={entry().logicalIndex + 2}
                        aria-readonly="true"
                        data-ssg-col-key={unbound().key}
                        data-ssg-tooltip-overflow={props.showCellOverflowTooltip && !column().renderCell ? '' : undefined}
                        class={[
                          'ssg-body-cell',
                          'ssg-pinned-cell',
                          rowSlot().className,
                          cellSlot().className,
                          props.slots.bodyCell?.className,
                          {
                            'ssg-body-cell--align-center': column().align === 'center',
                            'ssg-body-cell--align-right': column().align === 'right',
                            'ssg-body-cell--cf-bar': dataBar() !== null,
                            'ssg-body-cell--cf-scale': scaleBackground() !== null,
                            'ssg-body-cell--chip-compact':
                              rules()?.chips !== undefined && entry().paneLocalSize < CHIP_COMPACT_MAX_WIDTH,
                          },
                        ]}
                        style={{
                          ...props.slots.bodyCell?.style,
                          ...(scaleBackground() !== null ? { 'background-color': scaleBackground() as string } : null),
                          ...rowSlot().style,
                          ...cellSlot().style,
                          left: px(props.leadingWidth + entry().paneLocalStart),
                          width: px(entry().paneLocalSize),
                          'min-width': px(entry().paneLocalSize),
                          height: px(props.rowHeight),
                        }}
                      >
                        <Show when={dataBar()}>
                          {(bar) => (
                            <span
                              class={['ssg-cf-bar', { 'ssg-cf-bar--negative': bar().negative }]}
                              style={{
                                left: `${bar().start}%`,
                                width: `${bar().end - bar().start}%`,
                                ...(dataBarColor() ? { 'background-color': dataBarColor() } : null),
                              }}
                              aria-hidden="true"
                            />
                          )}
                        </Show>
                        {content()}
                      </div>
                    );
                  }}
                </For>
              </div>
            );
          }}
        </For>
      </div>
    </>
  );
}