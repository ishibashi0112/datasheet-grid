// 変更(差し込み式 段階 5): グループ行の部品を GridBodyLayer.tsx から分けました(行グルーピングの機能 features/grouping
//   が持ち、GridBodyLayer は GroupRow として受け取る。機能を外した構成に持ち込まないため)。中身は移設前と同じです。
import { memo } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { GridColumn, GridGroupRow as GridGroupRowDescriptor, GridResolvedSlots } from '../model/gridTypes';
import { GROUP_AUTO_COLUMN_KEY } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/grouping';
import type { PaneColumnEntry } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
import type { GridPaneKind } from './GridHeaderRow';

// ──────────────────────────────────────────────────────────
// 追加(grouping ③): グループ行です(A2 = セル分割型)。列セルの絶対配置・境界を leaf 行と
//   一致させたまま、内容だけを差し替えます:
//   - 自動グループ列(GROUP_AUTO_COLUMN_KEY): インデント + 開閉シェブロン + ラベル + 件数。
//   - aggFunc 列: 集計値の文字列表示(C1 = グループ行内表示。undefined は空セル)。
//   - その他の列: 空セル。
//   セル選択には参加しません(pointer down / enter は配線しない)。開閉はシェブロン click と
//   行ダブルクリックの 2 経路です。props はプリミティブ + ツリー世代で安定な参照
//   (groupRow / renderEntries)のみで、memo が縦スクロール・選択操作で機能します。
// ──────────────────────────────────────────────────────────
type GridBodyGroupRowProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  leadingWidth: number;
  rowIndex: number;
  top: number;
  rowHeight: number;
  renderEntries: PaneColumnEntry<T>[];
  rowHeaderCellStyle: CSSProperties;
  isRowHovered: boolean;
  // 追加: 行ヘッダの列幅を揃えるためのフラグです(グループ行は行選択対象外のため、
  //   チェックボックスは描画せず行番号を出します)。
  showRowCheckbox: boolean;
  groupRow: GridGroupRowDescriptor;
  isCollapsed: boolean;
  onGroupToggle: (groupKey: string) => void;
  onRowHeaderPointerEnter: (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onRowHeaderPointerLeave: (rowIndex: number) => void;
  // 変更(slot-props): classNames 由来の解決済みスロット表(参照は親で署名 memo 済み)。
  slots?: GridResolvedSlots;
};

// 集計値の表示文字列です。undefined / null は空セル。列に valueFormatter があれば集計値にも
//   適用し、leaf セルと表示を揃えます(グループ行に leaf 行は無いため row は undefined。
//   型上は T のままの実行時 undefined = DS-3-9 と同じ明文化で、row を読む formatter を使う列では
//   aggFunc 側で整形済み文字列を返してください)。formatter 無しは String()(カスタム aggFunc は
//   整形済み文字列を返せます)。
const formatAggregateValue = <T,>(
  column: GridColumn<T>,
  value: unknown,
): string => {
  if (value == null) {
    return '';
  }
  if (column.valueFormatter) {
    return column.valueFormatter({
      value,
      row: undefined as unknown as T,
      column,
    });
  }
  return String(value);
};

// 1 階層ぶんのインデント幅(px)です。
const GROUP_INDENT_PX = 16;

function GridBodyGroupRowInner<T>({
  pane,
  ownsRowHeader,
  leadingWidth,
  rowIndex,
  top,
  rowHeight,
  renderEntries,
  rowHeaderCellStyle,
  isRowHovered,
  showRowCheckbox,
  groupRow,
  isCollapsed,
  onGroupToggle,
  onRowHeaderPointerEnter,
  onRowHeaderPointerLeave,
  slots,
}: GridBodyGroupRowProps<T>) {
  return (
    <div
      data-pane={pane}
      data-row-index={rowIndex}
      data-ssg-group-row=""
      // 追加(audit V-05): グループ行も ARIA の行(開閉状態は自動グループ列のボタンの aria-expanded)。
      role="row"
      aria-rowindex={rowIndex + 2}
      className={cx(
        'ssg-body-row',
        slots?.bodyRow?.className,
        slots?.groupRow?.className,
      )}
      style={{
        ...slots?.bodyRow?.style,
        ...slots?.groupRow?.style,
        height: rowHeight,
        transform: `translateY(${top}px)`,
      }}
      onDoubleClick={() => onGroupToggle(groupRow.groupKey)}
    >
      {ownsRowHeader && (
        <div
          role="rowheader"
          aria-colindex={1}
          onPointerEnter={(event) => onRowHeaderPointerEnter(rowIndex, event)}
          onPointerLeave={() => onRowHeaderPointerLeave(rowIndex)}
          className={cx(
            'ssg-header-cell',
            'ssg-row-header-cell',
            showRowCheckbox && 'ssg-row-header-cell--checkbox',
            isRowHovered && 'ssg-header-cell--hovered',
            slots?.rowHeaderCell?.className,
          )}
          style={{
            ...slots?.rowHeaderCell?.style,
            ...rowHeaderCellStyle,
            height: rowHeight,
          }}
        >
          {showRowCheckbox ? null : rowIndex + 1}
        </div>
      )}

      {renderEntries.map((entry) => {
        if (!entry) {
          return null;
        }
        const column = entry.column;
        const left = leadingWidth + entry.paneLocalStart;
        const size = entry.paneLocalSize;
        const isAutoGroupColumn = column.key === GROUP_AUTO_COLUMN_KEY;
        const aggregateText =
          !isAutoGroupColumn &&
          Object.prototype.hasOwnProperty.call(
            groupRow.aggregates,
            column.key,
          )
            ? formatAggregateValue(column, groupRow.aggregates[column.key])
            : null;

        return (
          <div
            key={`group-${pane}-${column.key}`}
            role="gridcell"
            aria-colindex={entry.logicalIndex + 2}
            data-ssg-col-key={column.key}
            className={cx(
              'ssg-body-cell',
              'ssg-group-cell',
              column.align === 'center' && 'ssg-body-cell--align-center',
              column.align === 'right' && 'ssg-body-cell--align-right',
              isRowHovered && 'ssg-body-cell--row-hovered',
              slots?.bodyCell?.className,
              slots?.groupCell?.className,
            )}
            style={{
              ...slots?.bodyCell?.style,
              ...slots?.groupCell?.style,
              left,
              width: size,
              minWidth: size,
              height: rowHeight,
              zIndex: 1,
            }}
          >
            {isAutoGroupColumn ? (
              <>
                <span
                  aria-hidden="true"
                  className="ssg-group-indent"
                  style={{ width: groupRow.level * GROUP_INDENT_PX }}
                />
                <button
                  type="button"
                  className="ssg-group-toggle"
                  aria-expanded={!isCollapsed}
                  aria-label={`${groupRow.label} を${isCollapsed ? '展開' : '折りたたみ'}`}
                  onClick={() => onGroupToggle(groupRow.groupKey)}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  {isCollapsed ? '▸' : '▾'}
                </button>
                <span className="ssg-group-label">{groupRow.label}</span>
                <span className="ssg-group-count">
                  ({groupRow.leafCount}件)
                </span>
              </>
            ) : (
              aggregateText
            )}
          </div>
        );
      })}
    </div>
  );
}

export const GridBodyGroupRow = /* @__PURE__ */ memo(
  GridBodyGroupRowInner,
) as typeof GridBodyGroupRowInner;

export default GridBodyGroupRow;