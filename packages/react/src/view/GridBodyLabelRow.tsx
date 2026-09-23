import { memo, type CSSProperties, type ReactNode } from 'react';
import type { GridLabelRow, GridRowKey } from '../model/gridTypes';
import type { GridPaneKind } from './GridHeaderRow';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/logic/cx';
import { arePropsEqualWithStyleKeys } from '@ishibashi0112/spreadsheet-grid-core/logic/slotProps';
import type { GridResolvedSlots } from '../model/gridTypes';

// 追加(label-row ②): ラベル行(見出し / 区切り行)です。
//
// 配置(合意済み設計の具体化):
//   - 行コンテナ(.ssg-body-row[data-ssg-label-row])は他の行と同じく各ペインの絶対配置レイヤーに
//     translateY で置かれ、ペイン幅いっぱいの「帯」として背景を描きます(セルは持たない)。
//   - 中身(getLabel の文字列 / labelRow.render の描画ノード)は中央ペインにだけ描き、帯の中の
//     position: sticky 要素(.ssg-label-row-content-holder)に載せます。横スクロールしても
//     ビューポート左端(左固定ペイン / 行ヘッダーの右隣)に留まります(展開行カードと同じ機構で、
//     JS のスクロール同期は使いません)。left / width は展開行カードと同じ値です。
//   - 行ヘッダー「#」セルは空欄(ラベル行は行番号を消費しません)。
//   - セル選択 / 編集 / ホバーには参加しません(pointer 系ハンドラを配線しない)。
//   props はプリミティブ + パイプライン世代で安定な参照(labelRow / renderContent)のみで、memo が
//   縦スクロール・選択操作で機能します。rowStyle(className 関数由来)は内容比較します。
export type GridBodyLabelRowRenderContent<T> = (
  labelRow: GridLabelRow<T>,
  rowIndex: number,
  rowKey: GridRowKey,
) => ReactNode;

type GridBodyLabelRowProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  rowIndex: number;
  rowKey: GridRowKey;
  top: number;
  rowHeight: number;
  rowHeaderCellStyle: CSSProperties;
  labelRow: GridLabelRow<T>;
  // 中身の描画(中央ペインのみ。帯だけのペインは null)。
  renderContent: GridBodyLabelRowRenderContent<T> | null;
  // 中身の sticky 左オフセット(= 左固定ペイン幅 + 中央ペイン先頭幅)と幅(中央可視幅)。
  contentStickyLeft: number;
  contentWidth: number;
  // labelRow.className の解決結果(文字列 / style)。
  rowClassName?: string;
  rowStyle?: CSSProperties;
  slots?: GridResolvedSlots;
};

function GridBodyLabelRowInner<T>({
  pane,
  ownsRowHeader,
  rowIndex,
  rowKey,
  top,
  rowHeight,
  rowHeaderCellStyle,
  labelRow,
  renderContent,
  contentStickyLeft,
  contentWidth,
  rowClassName,
  rowStyle,
  slots,
}: GridBodyLabelRowProps<T>) {
  return (
    <div
      data-pane={pane}
      data-row-index={rowIndex}
      data-ssg-label-row=""
      role="row"
      aria-label={labelRow.label}
      className={cx(
        'ssg-body-row',
        'ssg-label-row',
        rowClassName,
        slots?.bodyRow?.className,
        slots?.labelRow?.className,
      )}
      style={{
        ...slots?.bodyRow?.style,
        ...slots?.labelRow?.style,
        ...rowStyle,
        height: rowHeight,
        transform: `translateY(${top}px)`,
      }}
    >
      {ownsRowHeader && (
        <div
          className={cx(
            'ssg-header-cell',
            'ssg-row-header-cell',
            'ssg-row-header-cell--label',
            slots?.rowHeaderCell?.className,
          )}
          style={{
            ...slots?.rowHeaderCell?.style,
            ...rowHeaderCellStyle,
            height: rowHeight,
          }}
        />
      )}
      {renderContent && (
        <div
          className="ssg-label-row-content-holder"
          style={{ left: contentStickyLeft, width: contentWidth, height: rowHeight }}
        >
          <div
            className={cx('ssg-label-row-content', slots?.labelRowContent?.className)}
            style={slots?.labelRowContent?.style}
          >
            {renderContent(labelRow, rowIndex, rowKey)}
          </div>
        </div>
      )}
    </div>
  );
}

const LABEL_ROW_STYLE_KEYS = new Set<keyof GridBodyLabelRowProps<unknown>>(['rowStyle', 'rowHeaderCellStyle']);

export const GridBodyLabelRow = memo(GridBodyLabelRowInner, (prev, next) =>
  arePropsEqualWithStyleKeys(prev, next, LABEL_ROW_STYLE_KEYS),
) as typeof GridBodyLabelRowInner;

export default GridBodyLabelRow;
