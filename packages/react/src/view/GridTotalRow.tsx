import { memo, type CSSProperties, type ReactNode } from 'react';
import type { GridResolvedSlots, TotalRowCellContext } from '../model/gridTypes';
import type { GridPaneKind } from './GridHeaderRow';
import type { PaneColumnEntry } from '@ishibashi0112/spreadsheet-grid-core/logic/geometry';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/logic/cx';
import { arePropsEqualWithStyleKeys } from '@ishibashi0112/spreadsheet-grid-core/logic/slotProps';
import {
  formatTotalRowCellText,
  resolveTotalRowCaption,
  type TotalRowCells,
} from '@ishibashi0112/spreadsheet-grid-core/logic/totalRow';

// 追加(合計行 3A): 表の下端に固定する合計行です(3 ペインそれぞれに描きます)。
//
// 配置:
//   - 各ペインの relative ボックスの中、本体の行レイヤー(絶対配置)の後ろに「本体ぶんの高さの空き」を置き、
//     その直後(= ボックスの下端)に position: sticky; bottom: 0 の行を置きます。縦スクロール中はスクロール
//     コンテナの下端に留まり、行が少ないときは最後の行の直後に来ます。横スクロール / 左右の固定列には通常の
//     行と同じくペインごとに付いていきます(ヘッダー行と同じ仕組みで、JS のスクロール同期は使いません)。
//   - セルは表示専用です(選択 / 編集 / 貼り付け / ホバーに参加しない = セルに pointer 系ハンドラを配線しない)。
//     行に入ったときだけ onPointerEnter で行ホバーを外します(直前にいた本体の行を強調したままにしない)。
//     data-row-index を持たないため、右クリックメニュー / 行の DOM クエリの対象になりません。列ドラッグの
//     live 方式で列と一緒に動くよう、セルには data-ssg-col-key を付けます。
//   - 見出し(label)は resolveTotalRowLabelColumnKey が決めた列のセルへ。列が null(先頭列に値がある)のときは
//     行番号の欄へ出します。
type GridTotalRowProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  leadingWidth: number;
  // 本体(行レイヤー)の物理高さ。合計行の通常フロー上の位置をボックスの下端にするための空きです。
  bodyHeight: number;
  height: number;
  renderEntries: PaneColumnEntry<T>[];
  cells: TotalRowCells;
  label: string;
  labelColumnKey: string | null;
  ariaRowIndex: number;
  rowHeaderCellStyle: CSSProperties;
  renderCell: ((ctx: TotalRowCellContext<T>) => ReactNode) | undefined;
  rowClassName?: string;
  rowStyle?: CSSProperties;
  slots?: GridResolvedSlots;
  onPointerEnter?: () => void;
};

function GridTotalRowInner<T>({
  pane,
  ownsRowHeader,
  leadingWidth,
  bodyHeight,
  height,
  renderEntries,
  cells,
  label,
  labelColumnKey,
  ariaRowIndex,
  rowHeaderCellStyle,
  renderCell,
  rowClassName,
  rowStyle,
  slots,
  onPointerEnter,
}: GridTotalRowProps<T>) {
  const entries = renderEntries.filter(Boolean);
  // 見えるセルが無いペインの行は支援技術から隠します(セルを持たない行を表に出さない)。
  const hasCells = ownsRowHeader || entries.length > 0;
  return (
    <>
      <div aria-hidden="true" style={{ height: bodyHeight }} />
      <div
        data-pane={pane}
        data-ssg-total-row=""
        role="row"
        aria-rowindex={ariaRowIndex}
        aria-hidden={hasCells ? undefined : 'true'}
        className={cx('ssg-total-row', slots?.totalRow?.className, rowClassName)}
        onPointerEnter={onPointerEnter}
        style={{
          ...slots?.totalRow?.style,
          ...rowStyle,
          height,
        }}
      >
        {ownsRowHeader && (
          <div
            role="rowheader"
            aria-colindex={1}
            className={cx(
              'ssg-header-cell',
              'ssg-row-header-cell',
              'ssg-total-row-header',
              slots?.rowHeaderCell?.className,
            )}
            style={{
              ...slots?.rowHeaderCell?.style,
              ...rowHeaderCellStyle,
              height,
            }}
          >
            {labelColumnKey === null ? label : null}
          </div>
        )}
        {entries.map((entry) => {
          const column = entry.column;
          const cell = cells.get(column.key);
          const isLabelCell = column.key === labelColumnKey;
          let content: ReactNode = null;
          if (cell) {
            const text = formatTotalRowCellText(column, cell);
            const caption = resolveTotalRowCaption(cell.kind);
            content = renderCell ? (
              renderCell({ column, value: cell.value, kind: cell.kind, text, caption })
            ) : (
              // 追加(見直し): 値が列幅に収まらず切れたときは、ツールチップで全文を出します(切れていなければ出ない)。
              <span
                className="ssg-total-value"
                data-ssg-tooltip-overflow={text !== '' ? (caption !== undefined ? `${caption} ${text}` : text) : undefined}
              >
                {caption !== undefined && text !== '' && <span className="ssg-total-caption">{caption}</span>}
                {text}
              </span>
            );
          } else if (isLabelCell) {
            content = <span className="ssg-total-label">{label}</span>;
          }
          return (
            <div
              key={`total-${pane}-${column.key}`}
              role="gridcell"
              aria-colindex={entry.logicalIndex + 2}
              data-ssg-col-key={column.key}
              className={cx(
                'ssg-body-cell',
                'ssg-total-cell',
                column.align === 'center' && 'ssg-body-cell--align-center',
                column.align === 'right' && 'ssg-body-cell--align-right',
                slots?.bodyCell?.className,
                slots?.totalCell?.className,
              )}
              style={{
                ...slots?.bodyCell?.style,
                ...slots?.totalCell?.style,
                left: leadingWidth + entry.paneLocalStart,
                width: entry.paneLocalSize,
                minWidth: entry.paneLocalSize,
                height,
              }}
            >
              {content}
            </div>
          );
        })}
      </div>
    </>
  );
}

const TOTAL_ROW_STYLE_KEYS = /* @__PURE__ */ new Set<keyof GridTotalRowProps<unknown>>(['rowStyle', 'rowHeaderCellStyle']);

export const GridTotalRow = /* @__PURE__ */ memo(GridTotalRowInner, (prev, next) =>
  arePropsEqualWithStyleKeys(prev, next, TOTAL_ROW_STYLE_KEYS),
) as typeof GridTotalRowInner;

export default GridTotalRow;