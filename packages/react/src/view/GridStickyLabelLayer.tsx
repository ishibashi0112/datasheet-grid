import { memo, useRef, type CSSProperties } from 'react';
import { useIsomorphicLayoutEffect } from '../hooks/useController';
import type { GridLabelRow, GridRowKey } from '../model/gridTypes';
import type { GridPaneKind } from './GridHeaderRow';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/logic/cx';
import { arePropsEqualWithStyleKeys } from '@ishibashi0112/spreadsheet-grid-core/logic/slotProps';
import type { GridResolvedSlots } from '../model/gridTypes';
import type { GridBodyLabelRowRenderContent } from './GridBodyLabelRow';

// 追加(label-row ③.5): ラベル行の縦スクロール固定(labelRow.sticky)レイヤーです。
//
// 配置:
//   - 各ペインの relative ボックスの中、sticky ヘッダー行の直後(= 通常フローの位置)に置く高さ 0 の
//     position: sticky 要素(top = headerHeight)です。スクロールコンテナ基準で列ヘッダー直下に留まり、
//     z-index はヘッダー(6)より下・行(通常)より上にします。
//   - その中に、現在セクションのラベル行の複製(帯 + 中身)を絶対配置します。次のラベル行が到達すると
//     pushOffset ぶん上へ translateY され、ヘッダーの背面へ押し込まれて交代します。
//   - 中身は中央ペインだけに描き、行内と同じ sticky-left の器に載せます(横スクロールでも左端に留まる)。
//   - 「どのラベルを・どれだけ押し上げて」出すかは純ロジック(logic/labelRows.resolveStickyLabel)が
//     scrollTop から求め、シェルが entry として渡します。entry が null なら何も描きません。
export type GridStickyLabelEntry<T> = {
  labelRow: GridLabelRow<T>;
  rowIndex: number;
  rowKey: GridRowKey;
  height: number;
  pushOffset: number;
};

type GridStickyLabelLayerProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  entry: GridStickyLabelEntry<T> | null;
  headerHeight: number;
  rowHeaderCellStyle: CSSProperties;
  // 中身の描画(中央ペインのみ。帯だけのペインは null)。
  renderContent: GridBodyLabelRowRenderContent<T> | null;
  contentStickyLeft: number;
  contentWidth: number;
  rowClassName?: string;
  rowStyle?: CSSProperties;
  slots?: GridResolvedSlots;
};

// 追加(見直し): 支援技術から隠した複製(aria-hidden)の中でフォーカスできる要素。
const FOCUSABLE_SELECTOR = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';

function GridStickyLabelLayerInner<T>({
  pane,
  ownsRowHeader,
  entry,
  headerHeight,
  rowHeaderCellStyle,
  renderContent,
  contentStickyLeft,
  contentWidth,
  rowClassName,
  rowStyle,
  slots,
}: GridStickyLabelLayerProps<T>) {
  // 追加(見直し): 複製の中身(labelRow.render のボタン等)は Tab で止まらないようにします(aria-hidden の中に
  //   フォーカスできる要素を残さない。マウスでは押せる = 本物の行と同じ操作)。中身が後から描き替わっても付け直します。
  const layerRef = useRef<HTMLDivElement>(null);
  const shown = entry !== null;
  // 変更(React 18 対応 2026-10-28): React 18 の SSR で警告を出さない useIsomorphicLayoutEffect に(クライアントでは useLayoutEffect のまま)。
  useIsomorphicLayoutEffect(() => {
    const layer = layerRef.current;
    if (!shown || !layer) {
      return;
    }
    const removeFromTabOrder = () => {
      layer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR).forEach((element) => {
        if (element.getAttribute('tabindex') !== '-1') {
          element.setAttribute('tabindex', '-1');
        }
      });
    };
    removeFromTabOrder();
    if (typeof MutationObserver === 'undefined') {
      return;
    }
    const observer = new MutationObserver(removeFromTabOrder);
    observer.observe(layer, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [shown]);
  if (!entry) {
    return null;
  }
  const { labelRow, rowIndex, rowKey, height, pushOffset } = entry;
  return (
    // 追加(audit V-05): 本物のラベル行の見た目上の複製なので、支援技術からは隠します(同じ行が 2 回読まれないように)。
    <div ref={layerRef} className="ssg-sticky-label-layer" style={{ top: headerHeight }} aria-hidden="true">
      <div
        data-pane={pane}
        data-ssg-sticky-label=""
        data-ssg-sticky-label-row-index={rowIndex}
        role="row"
        aria-label={labelRow.label}
        className={cx(
          'ssg-body-row',
          'ssg-label-row',
          'ssg-label-row--sticky',
          rowClassName,
          slots?.bodyRow?.className,
          slots?.labelRow?.className,
        )}
        style={{
          ...slots?.bodyRow?.style,
          ...slots?.labelRow?.style,
          ...rowStyle,
          height,
          transform: pushOffset > 0 ? `translateY(${-pushOffset}px)` : undefined,
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
              height,
            }}
          />
        )}
        {renderContent && (
          <div
            className="ssg-label-row-content-holder"
            style={{ left: contentStickyLeft, width: contentWidth, height }}
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
    </div>
  );
}

const STICKY_LABEL_STYLE_KEYS = /* @__PURE__ */ new Set<keyof GridStickyLabelLayerProps<unknown>>(['rowStyle', 'rowHeaderCellStyle']);

export const GridStickyLabelLayer = /* @__PURE__ */ memo(GridStickyLabelLayerInner, (prev, next) =>
  arePropsEqualWithStyleKeys(prev, next, STICKY_LABEL_STYLE_KEYS),
) as typeof GridStickyLabelLayerInner;

export default GridStickyLabelLayer;
