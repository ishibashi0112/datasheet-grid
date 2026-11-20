// ラベル行の縦スクロールの固定(labelRow.sticky)の層(機能 features/labelRow の部品)。React 版の
//   view/GridStickyLabelLayer.tsx と同じ DOM と class。
//   - 各ペインの relative の箱の中、見出しの行の直後に置く高さ 0 の position: sticky の要素(top = headerHeight)。
//   - その中に今のセクションのラベル行の複製(帯 + 中身)を置き、次のラベル行が来たら pushOffset だけ上へずらして交代する。
//   - 中身は中央ペインだけに描き、行の中と同じ sticky-left の器に載せる。
//   - 「どのラベルを・どれだけ押し上げて」出すかは core の resolveStickyLabel が scrollTop から求め、シェルが entry として渡す。
//     entry が null なら何も描かない。
//   中身はラベル行(行のキー)が変わったときだけ作り直す(スクロールで押し上げる量が変わっても作り直さない。React 版は記述子が
//   変わると render を呼び直す。Solid は render を 1 回だけ呼ぶので、別のラベル行に替わったら作り直して、render の本体で読んだ
//   値も新しいラベル行のものにする)。
import { Show, createMemo, onSettled } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { GridLabelRow, GridRowKey } from '@ishibashi0112/spreadsheet-grid-core';
import type { GridResolvedSlots } from '../model/gridTypes';
import { px } from '../primitives/style';
import type { GridPaneKind } from './GridHeaderRow';
import { createLabelRowRenderContext, type GridLabelRowRenderContent } from './GridBodyLabelRow';

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
  rowHeaderWidth: number;
  renderContent: GridLabelRowRenderContent<T> | null;
  contentStickyLeft: number;
  contentWidth: number;
  rowClassName: string | undefined;
  rowStyle: JSX.CSSProperties | undefined;
  slots: GridResolvedSlots;
};

// 支援技術から隠した複製(aria-hidden)の中でフォーカスできる要素。
const FOCUSABLE_SELECTOR = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';

export function GridStickyLabelLayer<T>(props: GridStickyLabelLayerProps<T>) {
  return (
    <Show when={props.entry}>
      {(entry) => <StickyLabel layer={props} entry={entry} />}
    </Show>
  );
}

function StickyLabel<T>(props: { layer: GridStickyLabelLayerProps<T>; entry: () => GridStickyLabelEntry<T> }) {
  const layer = props.layer;
  const labelRow = createMemo(() => props.entry().labelRow);
  const rowIndex = createMemo(() => props.entry().rowIndex);
  const rowKey = createMemo(() => props.entry().rowKey);
  const height = createMemo(() => props.entry().height);
  const ctx = createLabelRowRenderContext<T>(labelRow, rowIndex, rowKey);
  let element: HTMLDivElement | undefined;
  // 複製の中身(labelRow.render のボタンなど)は Tab で止まらないようにする(aria-hidden の中にフォーカスできる要素を残さない。
  //   マウスでは押せる = 本物の行と同じ操作)。中身が後から描き替わっても付け直す。
  onSettled(() => {
    const target = element;
    if (!target) {
      return;
    }
    const removeFromTabOrder = () => {
      target.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR).forEach((focusable) => {
        if (focusable.getAttribute('tabindex') !== '-1') {
          focusable.setAttribute('tabindex', '-1');
        }
      });
    };
    removeFromTabOrder();
    if (typeof MutationObserver === 'undefined') {
      return;
    }
    const observer = new MutationObserver(removeFromTabOrder);
    observer.observe(target, { childList: true, subtree: true });
    return () => observer.disconnect();
  });
  return (
    // 本物のラベル行の見た目の複製なので、支援技術からは隠す(同じ行が 2 回読まれないように)。
    <div
      ref={(node) => {
        element = node;
      }}
      class="ssg-sticky-label-layer"
      style={{ top: px(layer.headerHeight) }}
      aria-hidden="true"
    >
      <div
        data-pane={layer.pane}
        data-ssg-sticky-label=""
        data-ssg-sticky-label-row-index={rowIndex()}
        role="row"
        aria-label={labelRow().label}
        class={[
          'ssg-body-row',
          'ssg-label-row',
          'ssg-label-row--sticky',
          layer.rowClassName,
          layer.slots.bodyRow?.className,
          layer.slots.labelRow?.className,
        ]}
        style={{
          ...layer.slots.bodyRow?.style,
          ...layer.slots.labelRow?.style,
          ...layer.rowStyle,
          height: px(height()),
          ...(props.entry().pushOffset > 0 ? { transform: `translateY(${-props.entry().pushOffset}px)` } : null),
        }}
      >
        <Show when={layer.ownsRowHeader}>
          <div
            class={['ssg-header-cell', 'ssg-row-header-cell', 'ssg-row-header-cell--label', layer.slots.rowHeaderCell?.className]}
            style={{
              ...layer.slots.rowHeaderCell?.style,
              width: px(layer.rowHeaderWidth),
              'min-width': px(layer.rowHeaderWidth),
              height: px(height()),
            }}
          />
        </Show>
        <Show when={layer.renderContent}>
          {(render) => (
            <div
              class="ssg-label-row-content-holder"
              style={{ left: px(layer.contentStickyLeft), width: px(layer.contentWidth), height: px(height()) }}
            >
              <div
                class={['ssg-label-row-content', layer.slots.labelRowContent?.className]}
                style={layer.slots.labelRowContent?.style}
              >
                <Show when={[rowKey(), render()] as const} keyed>
                  {([, renderContent]) => renderContent(ctx)}
                </Show>
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}