// 展開行(detail)の帯とカード(1 つのペインぶん)。React 版の view/GridDetailLayer.tsx と同じ DOM と class。
//   - 帯(背景)は各ペインの幅いっぱいに描き、カード(利用側の中身)は中央のペイン(mode='center')にだけ描きます。カードは
//     帯の中の position: sticky の要素で、横にスクロールしてもビューポートの左端(左固定ペイン / 行番号の右隣)に留まります。
//   - 縦の位置は virtualRow.start + size(セルの行の直下)。帯は rowKey で対応させます(並びが変わってもカードの中身を
//     作り直さない)。描画窓から外れた行の帯は外れます。
//   - カードは data-ssg-detail を持ち、キー / クリップボード / 右クリック / ドラッグの開始 / ダブルクリックをグリッドの本体へ
//     伝えません(イベントの境界)。ポインタのイベントは止めません(グリッドのドラッグ選択の追従が途切れるため)。
import { For, Show, createMemo, onCleanup, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { DetailRowRenderContext, GridRowKey, RowModel } from '@ishibashi0112/spreadsheet-grid-core';
import type { VerticalRow } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/verticalGeometry';
import { notifyDetailCardFocusLost } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/detailRowController';
import type { GridResolvedSlot, GridResolvedSlots } from '../model/gridTypes';
import { px } from '../primitives/style';

export type GridDetailLayerEntry = {
  rowKey: GridRowKey;
  virtualRow: VerticalRow;
};

type GridDetailLayerProps<T> = {
  // 開いていて描画窓の中にあるマスター行(detailSize つき)。
  entries: readonly GridDetailLayerEntry[];
  // 'center' はカードも描く。'band' は帯の背景だけ(左右の固定ペイン)。
  mode: 'center' | 'band';
  // このペインの幅(帯の幅)。
  paneWidth: number;
  // カードの sticky の左オフセット(= 左固定ペインの幅 + 中央ペインの先頭の幅)とカードの幅(中央の見える幅)。
  cardStickyLeft: number;
  cardWidth: number;
  // detailRow.className の解決済みのスロット(カードの要素へ)と、classNames の detailBand / detailCard。
  cardSlot?: GridResolvedSlot | undefined;
  slots: GridResolvedSlots;
  rowModel: RowModel<T>;
  renderCard?: ((ctx: DetailRowRenderContext<T>) => JSX.Element) | undefined;
  onCollapse?: ((rowKey: GridRowKey, viewIndex: number) => void) | undefined;
  // カードの中の keydown(グリッドの本体へは伝えない)。カードの端の Tab / Shift+Tab の行き先を決めます。
  onCardKeyDown?: ((event: KeyboardEvent, card: HTMLElement, viewRowIndex: number) => void) | undefined;
  // フォーカスを持ったカードが消えたとき(1.0.2 / G-13)。
  onCardFocusLost?: (() => void) | undefined;
};

const stopPropagation = (event: Event): void => {
  event.stopPropagation();
};

const mergeSlotStyles = (...styles: (JSX.CSSProperties | undefined)[]): JSX.CSSProperties | undefined => {
  const present = styles.filter((style): style is JSX.CSSProperties => style !== undefined);
  return present.length === 0 ? undefined : Object.assign({}, ...present);
};

export function GridDetailLayer<T>(props: GridDetailLayerProps<T>) {
  return (
    <For each={props.entries} keyed={(entry) => entry.rowKey}>
      {(entry) => {
        const index = createMemo(() => entry().virtualRow.index);
        const detailSize = () => entry().virtualRow.detailSize ?? 0;
        return (
          <Show when={detailSize() > 0}>
            <div
              class={['ssg-detail-band', props.slots.detailBand?.className]}
              // カードを持つ帯(中央のペイン)は ARIA の行 + セル(行番号は持たない)。左右の固定ペインの帯は背景だけなので
              //   支援技術から隠します(audit V-05)。
              role={props.mode === 'center' ? 'row' : undefined}
              aria-hidden={props.mode === 'center' ? undefined : 'true'}
              data-detail-row-index={index()}
              style={{
                ...props.slots.detailBand?.style,
                position: 'absolute',
                left: '0',
                top: px(entry().virtualRow.start + (entry().virtualRow.size ?? 0)),
                width: px(props.paneWidth),
                height: px(detailSize()),
              }}
            >
              <Show when={props.mode === 'center'}>
                <DetailCard<T> entry={entry} index={index} layer={props} />
              </Show>
            </div>
          </Show>
        );
      }}
    </For>
  );
}

function DetailCard<T>(props: {
  entry: () => GridDetailLayerEntry;
  index: () => number;
  layer: GridDetailLayerProps<T>;
}) {
  const layer = props.layer;
  const rowKey = untrack(() => props.entry().rowKey);
  // 利用側の render へ渡す文脈。位置は読んだときに引く(並びが変わってもカードの中身を作り直さない。renderCell と同じ)。
  //   行と元の位置はこの行の値だけの memo(rowModel はどの行が変わっても新しくなるので、そのまま読むと、render の本体で
  //   ctx.row を読む書き方(引数の分解など)で、ほかの行の編集や並べ替えのたびに中身を作り直す)。
  const row = createMemo(() => layer.rowModel.getRow(props.index()));
  const sourceRowIndex = createMemo(() => layer.rowModel.getSourceIndex(props.index()) ?? props.index());
  const ctx: DetailRowRenderContext<T> = {
    get row() {
      return row() as T;
    },
    rowKey,
    get rowIndex() {
      return props.index();
    },
    get sourceRowIndex() {
      return sourceRowIndex();
    },
    collapse: () => layer.onCollapse?.(rowKey, untrack(props.index)),
  };
  let card: HTMLDivElement | undefined;
  // カードが外れるとき(DOM はまだある)に中にフォーカスがあれば、外れた後で body に落ちたときだけグリッドへ戻します。
  onCleanup(() => notifyDetailCardFocusLost(card ?? null, layer.onCardFocusLost));
  return (
    <div
      role="gridcell"
      class="ssg-detail-card-holder"
      style={{ left: px(layer.cardStickyLeft), width: px(layer.cardWidth) }}
    >
      <div
        ref={(element) => {
          card = element;
        }}
        class={['ssg-detail-card', layer.slots.detailCard?.className, layer.cardSlot?.className]}
        style={mergeSlotStyles(layer.slots.detailCard?.style, layer.cardSlot?.style)}
        data-ssg-detail=""
        onKeyDown={(event) => {
          layer.onCardKeyDown?.(event, event.currentTarget as HTMLElement, untrack(props.index));
          event.stopPropagation();
        }}
        onKeyUp={stopPropagation}
        onPaste={stopPropagation}
        onCopy={stopPropagation}
        onCut={stopPropagation}
        onContextMenu={stopPropagation}
        onDragStart={stopPropagation}
        onDblClick={stopPropagation}
      >
        <Show when={row() !== undefined}>{layer.renderCard?.(ctx)}</Show>
      </div>
    </div>
  );
}