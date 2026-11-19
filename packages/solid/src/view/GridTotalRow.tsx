// 表の下端に固定する合計行(1 つのペインぶん)。React 版の view/GridTotalRow.tsx と同じ DOM と class。
//   配置: ペインの relative の箱の中、本体ぶんの空き(bodyHeight)の直後に position: sticky; bottom: 0 の行を置く(縦スクロール中は
//   スクロールする箱の下端に留まり、行が少ないときは最後の行の直後に来る)。セルは表示だけ(選択 / 編集 / 貼り付け / ホバーに
//   入らない)。行に入ったら行ホバーを外す。見出し(label)は labelColumnKey の列のセルへ、null なら行番号の欄へ。
import { For, Show, createMemo } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { PaneColumnEntry } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import {
  formatTotalRowCellText,
  resolveTotalRowCaption,
  type TotalRowCells,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/totalRow';
import type { GridColumn, GridResolvedSlots, TotalRowCellContext } from '../model/gridTypes';
import { useGridLocaleText } from '../context/localeText';
import { px } from '../primitives/style';
import type { GridPaneKind } from './GridHeaderRow';

type GridTotalRowProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  leadingWidth: number;
  rowHeaderWidth: number;
  // 本体(行の層)の物理の高さ。合計行の通常の流れの位置を箱の下端にするための空き。
  bodyHeight: number;
  height: number;
  entries: readonly PaneColumnEntry<T>[];
  cells: TotalRowCells;
  label: string;
  labelColumnKey: string | null;
  ariaRowIndex: number;
  renderCell: ((ctx: TotalRowCellContext<T>) => JSX.Element) | undefined;
  rowClassName: string | undefined;
  rowStyle: JSX.CSSProperties | undefined;
  slots: GridResolvedSlots;
  onPointerEnter: () => void;
  // sticky の bottom(下の固定行を合計行の下に置くときは、その固定行の高さ)。0 なら CSS の既定。
  stickyBottom: number;
};

export function GridTotalRow<T>(props: GridTotalRowProps<T>) {
  const texts = useGridLocaleText();
  // 行番号の欄に見出しの文字が無いとき(見出しを先頭のデータ列へ出すとき / 見出しが空のとき)は、欄を見た目だけにして、
  //   見出しを出したデータ列のセルを行見出しにする(React 版と同じ。文字の無い行見出しを作らない)。
  const rowHeaderText = () => (props.labelColumnKey === null ? props.label : '');
  const rowHeaderIsCell = () => props.ownsRowHeader && rowHeaderText() !== '';
  // 見えるセルが無いペインの行は支援技術から隠す。
  const hasCells = () => rowHeaderIsCell() || props.entries.length > 0;
  return (
    <>
      <div aria-hidden="true" style={{ height: px(props.bodyHeight) }} />
      <div
        data-pane={props.pane}
        data-ssg-total-row=""
        role="row"
        aria-rowindex={props.ariaRowIndex}
        aria-hidden={hasCells() ? undefined : 'true'}
        class={['ssg-total-row', props.slots.totalRow?.className, props.rowClassName]}
        onPointerEnter={() => props.onPointerEnter()}
        style={{
          ...props.slots.totalRow?.style,
          ...props.rowStyle,
          height: px(props.height),
          ...(props.stickyBottom > 0 ? { bottom: px(props.stickyBottom) } : null),
        }}
      >
        <Show when={props.ownsRowHeader}>
          <div
            role={rowHeaderIsCell() ? 'rowheader' : undefined}
            aria-colindex={rowHeaderIsCell() ? 1 : undefined}
            aria-hidden={rowHeaderIsCell() ? undefined : 'true'}
            class={['ssg-header-cell', 'ssg-row-header-cell', 'ssg-total-row-header', props.slots.rowHeaderCell?.className]}
            style={{
              ...props.slots.rowHeaderCell?.style,
              width: px(props.rowHeaderWidth),
              'min-width': px(props.rowHeaderWidth),
              height: px(props.height),
            }}
          >
            {rowHeaderText() === '' ? null : rowHeaderText()}
          </div>
        </Show>
        <For each={props.entries} keyed={(entry) => entry.column.key}>
          {(entry) => {
            // 列は memo で受ける(項目のオブジェクトは列の位置や幅が変わるたびに新しくなる。中身はそれでは作り直さない)。
            const unbound = createMemo(() => entry().column);
            const cell = () => props.cells.get(unbound().key);
            const isLabelCell = () => unbound().key === props.labelColumnKey;
            // 中身は集計の値・見出し・文言が変わったときだけ作り直す(列の位置や幅では作り直さない)。
            const content = createMemo((): JSX.Element => {
              const total = cell();
              if (total) {
                const column = unbound();
                const text = formatTotalRowCellText(column, total);
                const caption = resolveTotalRowCaption(total.kind, texts());
                const renderCell = props.renderCell;
                if (renderCell) {
                  return renderCell({
                    column: column as unknown as GridColumn<T>,
                    value: total.value,
                    kind: total.kind,
                    text,
                    caption,
                  });
                }
                // 値が列の幅に収まらず切れたときは、ツールチップで全文を出す(切れていなければ出ない)。
                return (
                  <span
                    class="ssg-total-value"
                    data-ssg-tooltip-overflow={text !== '' ? (caption !== undefined ? `${caption} ${text}` : text) : undefined}
                  >
                    {caption !== undefined && text !== '' ? <span class="ssg-total-caption">{caption}</span> : null}
                    {text}
                  </span>
                );
              }
              return isLabelCell() ? <span class="ssg-total-label">{props.label}</span> : null;
            });
            return (
              <div
                // 見出しを出したセルは行見出し(上)。
                role={isLabelCell() && !cell() && props.label !== '' ? 'rowheader' : 'gridcell'}
                aria-colindex={entry().logicalIndex + 2}
                data-ssg-col-key={unbound().key}
                class={[
                  'ssg-body-cell',
                  'ssg-total-cell',
                  props.slots.bodyCell?.className,
                  props.slots.totalCell?.className,
                  {
                    'ssg-body-cell--align-center': unbound().align === 'center',
                    'ssg-body-cell--align-right': unbound().align === 'right',
                  },
                ]}
                style={{
                  ...props.slots.bodyCell?.style,
                  ...props.slots.totalCell?.style,
                  left: px(props.leadingWidth + entry().paneLocalStart),
                  width: px(entry().paneLocalSize),
                  'min-width': px(entry().paneLocalSize),
                  height: px(props.height),
                }}
              >
                {content()}
              </div>
            );
          }}
        </For>
      </div>
    </>
  );
}