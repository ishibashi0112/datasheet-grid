// ラベル行(見出し / 区切り行。機能 features/labelRow の部品)。React 版の view/GridBodyLabelRow.tsx と同じ DOM と class。
//   - 行(.ssg-body-row[data-ssg-label-row])はほかの行と同じく各ペインの層に translateY で置き、ペインの幅いっぱいの帯として
//     背景を描く(セルは持たない)。
//   - 中身(getLabel の文字 / labelRow.render)は中央ペインにだけ描き、帯の中の position: sticky の器
//     (.ssg-label-row-content-holder)に載せる(横にスクロールしても左端に留まる。left / width は展開行のカードと同じ値)。
//   - 行番号の欄は空(ラベル行は行番号を使わない)。セルの選択 / 編集 / ホバーには入らない。
//   中身はラベル行の値(行・ラベル・件数)と位置が変わったときだけ作り直す(render の本体で読んだものだけ。renderCell と同じ)。
import { Show, createMemo } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { GridLabelRow, GridRowKey, LabelRowRenderContext } from '@ishibashi0112/spreadsheet-grid-core';
import type { GridResolvedSlots } from '../model/gridTypes';
import { px } from '../primitives/style';
import type { GridPaneKind } from './GridHeaderRow';

// ラベル行の中身を描く関数(中央ペインだけ。帯だけのペインは null)。
export type GridLabelRowRenderContent<T> = (ctx: LabelRowRenderContext<T>) => JSX.Element;

// render へ渡す文脈を、読んだときに引く形で作ります(ラベル行の記述子・位置・行キーは accessor)。
export const createLabelRowRenderContext = <T,>(
  labelRow: () => GridLabelRow<T>,
  rowIndex: () => number,
  rowKey: () => GridRowKey,
): LabelRowRenderContext<T> => {
  const row = createMemo(() => labelRow().row);
  const sourceRowIndex = createMemo(() => labelRow().sourceIndex);
  const label = createMemo(() => labelRow().label);
  const sectionRowCount = createMemo(() => labelRow().sectionRowCount);
  return {
    get row() {
      return row();
    },
    get rowKey() {
      return rowKey();
    },
    get rowIndex() {
      return rowIndex();
    },
    get sourceRowIndex() {
      return sourceRowIndex();
    },
    get label() {
      return label();
    },
    get sectionRowCount() {
      return sectionRowCount();
    },
  };
};

type GridBodyLabelRowProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  rowIndex: number;
  rowKey: GridRowKey;
  top: number;
  // aria-rowindex に足す数(上の固定行の数)。
  ariaRowOffset: number;
  rowHeight: number;
  rowHeaderWidth: number;
  labelRow: GridLabelRow<T>;
  renderContent: GridLabelRowRenderContent<T> | null;
  // 中身の sticky の左(= 左固定ペインの幅 + 中央ペインの先頭の幅)と幅(中央の見える幅)。
  contentStickyLeft: number;
  contentWidth: number;
  // labelRow.className を解決したもの。
  rowClassName: string | undefined;
  rowStyle: JSX.CSSProperties | undefined;
  slots: GridResolvedSlots;
};

export function GridBodyLabelRow<T>(props: GridBodyLabelRowProps<T>) {
  const ctx = createLabelRowRenderContext<T>(
    () => props.labelRow,
    () => props.rowIndex,
    () => props.rowKey,
  );
  return (
    <div
      data-pane={props.pane}
      data-row-index={props.rowIndex}
      data-ssg-label-row=""
      role="row"
      aria-rowindex={props.rowIndex + 2 + props.ariaRowOffset}
      aria-label={props.labelRow.label}
      // 中身を持たないペイン(左固定・右固定)の帯は見た目だけなので支援技術から隠す(セルの無い row は ARIA の構造違反)。
      aria-hidden={props.renderContent ? undefined : 'true'}
      class={['ssg-body-row', 'ssg-label-row', props.rowClassName, props.slots.bodyRow?.className, props.slots.labelRow?.className]}
      style={{
        ...props.slots.bodyRow?.style,
        ...props.slots.labelRow?.style,
        ...props.rowStyle,
        height: px(props.rowHeight),
        transform: `translateY(${props.top}px)`,
      }}
    >
      <Show when={props.ownsRowHeader}>
        <div
          // 行番号の欄は見た目だけ(文字の無い行見出しを作らない)。行の見出しは中身の欄(下)。
          aria-hidden="true"
          class={['ssg-header-cell', 'ssg-row-header-cell', 'ssg-row-header-cell--label', props.slots.rowHeaderCell?.className]}
          style={{
            ...props.slots.rowHeaderCell?.style,
            width: px(props.rowHeaderWidth),
            'min-width': px(props.rowHeaderWidth),
            height: px(props.rowHeight),
          }}
        />
      </Show>
      <Show when={props.renderContent}>
        {(render) => (
          <div
            // ラベルの文字が見える中身の欄を行見出しにする(区切り行の見出し = その行の名前)。
            role="rowheader"
            aria-colindex={1}
            class="ssg-label-row-content-holder"
            style={{ left: px(props.contentStickyLeft), width: px(props.contentWidth), height: px(props.rowHeight) }}
          >
            <div
              class={['ssg-label-row-content', props.slots.labelRowContent?.className]}
              style={props.slots.labelRowContent?.style}
            >
              {render()(ctx)}
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}