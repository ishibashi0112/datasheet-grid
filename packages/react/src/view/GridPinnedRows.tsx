// 追加(1.1.0 / 固定行): 表の上下に固定する行(pinnedTopRows / pinnedBottomRows)です(3 ペインそれぞれに描きます)。
//
// 決めたこと(2026-11-15 のユーザー判断「案 A 見せる行」「背景 + 線」「行見出しはピンの印」):
//   - 表示だけ。選択 / 編集 / 貼り付け / コピー / キー操作 / ホバーに入らない(合計行と同じ)。セルに pointer 系のハンドラを
//     付けず、data-row-index / data-row-key も持たない(行の DOM を探す処理の対象にならない)。行に入ったら行ホバーを外す。
//   - セルは本体と同じ見た目の部品(.ssg-body-cell)で、列の valueFormatter / renderCell(ctx.pinned)/ cellClassName /
//     条件付き書式の色(集計は本体の行)/ checkbox 列の印で描く。合成列(行ドラッグのハンドル / 展開のトグル / 自動グループ)は空。
//   - 高さは rowHeight(自動の高さには付いていかない)。
//
// 配置(各ペインの relative ボックスの中):
//   - 上: 列見出しの直後(通常フロー)に置く sticky の器(top = 列見出しの高さ)。シェルは「列見出し + 上の固定行」を
//     本体の上端(headerHeight)として扱うので、本体の行・選択枠・行を見せる位置・ラベル行の固定の帯は固定行の下から始まる。
//   - 下: 本体ぶんの空きの後に置く sticky の器(bottom = 合計行の高さ)。合計行はその後ろ(bottom: 0)。footerHeight は
//     「下の固定行 + 合計行」。
import { memo, type CSSProperties, type ReactNode } from 'react';
import type {
  CellStyleContext,
  GridColumn,
  GridPinnedRowPosition,
  GridResolvedSlots,
  GridRowKey,
  SpreadsheetGridProps,
} from '../model/gridTypes';
import type { GridPaneKind } from './GridHeaderRow';
import type { PaneColumnEntry } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import type { ConditionalFormatStatsMap } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/conditionalFormat';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
import { arePropsEqualWithStyleKeys, resolveSlotProps } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/slotProps';
import { isSyntheticColumnKey } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/detailRow';
import { isCheckboxChecked } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/checkboxEditor';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import { getCellValue } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
import type { ReactGridFeatures } from '../features/types';
import { CheckboxCell } from '../editors/CheckboxCell';
import { useFeatureLocaleText } from '../hooks/useGridLocaleText';
import type { DEFAULT_PINNED_ROWS_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';

type GridPinnedRowsProps<T> = {
  pane: GridPaneKind;
  position: GridPinnedRowPosition;
  ownsRowHeader: boolean;
  leadingWidth: number;
  rows: readonly T[];
  rowHeight: number;
  // 上: 列見出しの高さ(sticky の top)。下: 合計行の高さ(sticky の bottom)。
  stickyOffset: number;
  // 下だけ: 本体(行レイヤー)の物理高さ。器の通常フローの位置をボックスの下端にするための空き(上は 0)。
  bodyHeight: number;
  renderEntries: PaneColumnEntry<T>[];
  rowKeyGetter: (row: T, index: number) => GridRowKey;
  // 1 行目の aria-rowindex。
  ariaRowIndexStart: number;
  rowHeaderCellStyle: CSSProperties;
  getRowClassName: SpreadsheetGridProps<T>['getRowClassName'];
  showCellOverflowTooltip: boolean;
  conditionalFormat: ReactGridFeatures['conditionalFormat'];
  conditionalFormatStats: ConditionalFormatStatsMap;
  slots?: GridResolvedSlots;
  onPointerEnter?: () => void;
};

const noop = () => {};

// 本体のセルと同じ(view/GridBodyLayer の CHIP_COMPACT_MAX_WIDTH)。細い列の状態チップは余白を詰めてアイコンを外す。
const CHIP_COMPACT_MAX_WIDTH = 80;

// ピンの印(行見出し。読み上げは行見出しの aria-label)。
const PIN_ICON = (
  <svg className="ssg-pinned-row-icon" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M9.8 1.5 14.5 6.2l-1.4 1.4-1-.9-2.6 2.6.3 3.2-1.4 1.4-2.6-2.6-3.3 3.3-.7-.7 3.3-3.3L2.5 8l1.4-1.4 3.2.3 2.6-2.6-.9-1z" />
  </svg>
);

function GridPinnedRowsInner<T>({
  pane,
  position,
  ownsRowHeader,
  leadingWidth,
  rows,
  rowHeight,
  stickyOffset,
  bodyHeight,
  renderEntries,
  rowKeyGetter,
  ariaRowIndexStart,
  rowHeaderCellStyle,
  getRowClassName,
  showCellOverflowTooltip,
  conditionalFormat,
  conditionalFormatStats,
  slots,
  onPointerEnter,
}: GridPinnedRowsProps<T>) {
  const texts = useFeatureLocaleText<typeof DEFAULT_PINNED_ROWS_LOCALE_TEXT>();
  const entries = renderEntries.filter(Boolean);
  // 見えるセルが無いペインの行は支援技術から隠します(セルを持たない行を表に出さない)。
  const hidden = !ownsRowHeader && entries.length === 0;

  const renderContent = (row: T, column: GridColumn<T>, ctx: CellStyleContext<T>): ReactNode => {
    if (isSyntheticColumnKey(column.key)) {
      return null;
    }
    if (column.renderCell) {
      return column.renderCell({ ...ctx, setValue: noop });
    }
    if (column.editor?.type === 'checkbox') {
      return (
        <CheckboxCell
          slot={slots?.checkbox}
          label={column.title || column.key}
          checked={isCheckboxChecked(ctx.value, column.editor)}
          readOnly
          onToggle={noop}
        />
      );
    }
    const rules = conditionalFormat ? column.conditionalFormat : undefined;
    if (rules?.dataBar?.showValue === false) {
      return null;
    }
    const text = column.valueFormatter ? column.valueFormatter({ value: ctx.value, row, column }) : String(ctx.value ?? '');
    const chip = conditionalFormat && rules?.chips ? conditionalFormat.resolveChipSpec(rules.chips, ctx) : null;
    if (conditionalFormat && chip) {
      return <conditionalFormat.GridChip spec={chip}>{chip.label ?? text}</conditionalFormat.GridChip>;
    }
    return <span className="ssg-cell-value">{text}</span>;
  };

  return (
    <>
      {bodyHeight > 0 && <div aria-hidden="true" style={{ height: bodyHeight }} />}
      <div
        className={cx('ssg-pinned-rows', `ssg-pinned-rows--${position}`)}
        style={{ [position]: stickyOffset, height: rows.length * rowHeight }}
        onPointerEnter={onPointerEnter}
      >
        {rows.map((row, index) => {
          const rowKey = rowKeyGetter(row, index);
          const rowSlot = resolveSlotProps<CSSProperties>(
            getRowClassName?.(row, index, { row, rowIndex: index, sourceRowIndex: index, rowKey, isSelected: false, pinned: position }),
          );
          return (
            <div
              key={String(rowKey)}
              data-pane={pane}
              data-ssg-pinned={position}
              role="row"
              aria-rowindex={ariaRowIndexStart + index}
              aria-hidden={hidden || undefined}
              className={cx('ssg-pinned-row', rowSlot.className)}
              style={{ ...rowSlot.style, height: rowHeight, top: index * rowHeight }}
            >
              {ownsRowHeader && (
                <div
                  role="rowheader"
                  aria-colindex={1}
                  aria-label={formatLocaleText(position === 'top' ? texts.pinnedTopRow : texts.pinnedBottomRow, { row: index + 1 })}
                  className={cx('ssg-header-cell', 'ssg-row-header-cell', 'ssg-pinned-row-header', slots?.rowHeaderCell?.className)}
                  style={{ ...slots?.rowHeaderCell?.style, ...rowSlot.style, ...rowHeaderCellStyle, height: rowHeight }}
                >
                  {PIN_ICON}
                </div>
              )}
              {entries.map((entry) => {
                const column = entry.column;
                const value = getCellValue(row, column);
                const ctx: CellStyleContext<T> = {
                  row,
                  rowIndex: index,
                  sourceRowIndex: index,
                  rowKey,
                  colIndex: entry.logicalIndex,
                  value,
                  column,
                  isActive: false,
                  isSelected: false,
                  isEditing: false,
                  readOnly: true,
                  pinned: position,
                };
                const cellSlot = resolveSlotProps<CSSProperties>(
                  typeof column.cellClassName === 'function' ? column.cellClassName(ctx) : column.cellClassName,
                );
                const rules = conditionalFormat ? column.conditionalFormat : undefined;
                const stats = conditionalFormatStats.get(column.key);
                const dataBar = conditionalFormat && rules?.dataBar ? conditionalFormat.resolveDataBar(rules.dataBar, value, stats) : null;
                const scaleBackground =
                  conditionalFormat && rules?.colorScale
                    ? conditionalFormat.resolveColorScaleBackground(rules.colorScale, value, stats)
                    : null;
                const dataBarColor = dataBar ? (dataBar.negative ? rules?.dataBar?.negativeColor : rules?.dataBar?.color) : undefined;
                return (
                  <div
                    key={column.key}
                    role="gridcell"
                    aria-colindex={entry.logicalIndex + 2}
                    aria-readonly
                    data-ssg-col-key={column.key}
                    data-ssg-tooltip-overflow={showCellOverflowTooltip && !column.renderCell ? '' : undefined}
                    className={cx(
                      'ssg-body-cell',
                      'ssg-pinned-cell',
                      column.align === 'center' && 'ssg-body-cell--align-center',
                      column.align === 'right' && 'ssg-body-cell--align-right',
                      dataBar !== null && 'ssg-body-cell--cf-bar',
                      scaleBackground !== null && 'ssg-body-cell--cf-scale',
                      rules?.chips !== undefined && entry.paneLocalSize < CHIP_COMPACT_MAX_WIDTH && 'ssg-body-cell--chip-compact',
                      rowSlot.className,
                      cellSlot.className,
                      slots?.bodyCell?.className,
                    )}
                    style={{
                      ...slots?.bodyCell?.style,
                      ...(scaleBackground !== null ? { backgroundColor: scaleBackground } : null),
                      ...rowSlot.style,
                      ...cellSlot.style,
                      left: leadingWidth + entry.paneLocalStart,
                      width: entry.paneLocalSize,
                      minWidth: entry.paneLocalSize,
                      height: rowHeight,
                    }}
                  >
                    {dataBar && (
                      <span
                        className={cx('ssg-cf-bar', dataBar.negative && 'ssg-cf-bar--negative')}
                        style={{
                          left: `${dataBar.start}%`,
                          width: `${dataBar.end - dataBar.start}%`,
                          ...(dataBarColor ? { backgroundColor: dataBarColor } : null),
                        }}
                        aria-hidden="true"
                      />
                    )}
                    {renderContent(row, column, ctx)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

const PINNED_ROWS_STYLE_KEYS = /* @__PURE__ */ new Set<keyof GridPinnedRowsProps<unknown>>(['rowHeaderCellStyle']);

export const GridPinnedRows = /* @__PURE__ */ memo(GridPinnedRowsInner, (prev, next) =>
  arePropsEqualWithStyleKeys(prev, next, PINNED_ROWS_STYLE_KEYS),
) as typeof GridPinnedRowsInner;

export default GridPinnedRows;