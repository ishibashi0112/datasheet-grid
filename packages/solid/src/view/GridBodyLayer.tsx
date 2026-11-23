// 本体の行とセル(1 つのペインぶん)。React 版の view/GridBodyLayer.tsx(GridBodyLayer + GridBodyRow)と同じ DOM と class。
//   データ行と、グループ行(grouping)・ラベル行(labelRow。どちらも部品は機能から)。読み込み中の行(serverSide)・
//   auto-height(autoHeight)・条件付き書式(conditionalFormat)は機能(段階 2)で、シェルが機能の有無を props で渡します。
//   行は rowKey、セルは列の key で対応させます(React 版の key と同じ。並びが変わっても同じ要素が新しい位置へ動くので、
//   animateRows の transition が効く)。変更(1.5.0): 行の並びが同じままで描く範囲だけが変わったとき(スクロール)は、範囲から
//   出たデータ行の要素とセルの部品を、入ってきた行に使い回します(primitives/rowSlots。中身の値だけを書き換える)。
//   Solid は部品を描き直さない(細かく signal で更新する)ので、React 版の memo / 行プリミティブへの畳み込みは要らない。
import { For, Show, createMemo, createRenderEffect, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type {
  CellCoord,
  CellRenderState,
  CellStyleContext,
  GridLabelRow,
  GridRowKey,
  GridVerticalAlign,
  RowModel,
  RowSelectionState,
} from '@ishibashi0112/spreadsheet-grid-core';
import type { PaneColumnEntry } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import type { SelectionSnapshot } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridSelectors';
import { getCellValue, isCellEditable } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
import { resolveIsRowSelected } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/rowSelection';
import { resolveDataRowNumber } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/labelRows';
import { shouldMarkCellOverflowTooltip } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cellOverflowTooltip';
import { getInvalidMessage, hasCellValidation } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/validation';
import { normalizeCellNote, resolveCellTooltipText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cellNote';
import { resolveSlotProps } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/slotProps';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { ConditionalFormatStatsMap } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/conditionalFormat';
import type { FindIndex, FindRange } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/find';
import type { SolidGridFeatures } from '../features/types';
import type {
  GridColumn,
  GridResolvedSlots,
  GridSlotProps,
  SolidGridTypes,
  SpreadsheetGridProps,
} from '../model/gridTypes';
import { useGridLocaleText } from '../context/localeText';
import { px } from '../primitives/style';
import { createMemoWhen } from '../primitives/memoWhen';
import { markClickTarget } from '../primitives/clickTarget';
import { assignRowSlots, type RowSlotKind, type RowSlotState } from '../primitives/rowSlots';
import { markReusedRow } from '../primitives/reusedRow';
import { RowSelectionCheckbox } from './RowSelectionCheckbox';
import type { GridPaneKind } from './GridHeaderRow';
import type { GridLabelRowRenderContent } from './GridBodyLabelRow';

// ラベル行の描き方(ラベル行の機能があり labelRow を渡したときだけ。中身は中央ペインだけ、ほかのペインは帯だけ = renderContent が
//   null。中身の sticky の左と幅は展開行のカードと同じ値)。
export type GridBodyLabelRowLayer<T> = {
  Row: NonNullable<SolidGridFeatures['labelRow']>['BodyLabelRow'];
  renderContent: GridLabelRowRenderContent<T> | null;
  contentStickyLeft: number;
  contentWidth: number;
  // labelRow.className を行ごとに解決したもの。
  resolveRowSlot: (labelRow: GridLabelRow<T>) => GridSlotProps | undefined;
};

// 描く行(core の縦のレイアウトの virtualRows のうち描くもの + 対応に使う rowKey)。
// セルの中身へ渡す位置と状態。どれも読んだときに引く(中身は行・列が変わったときだけ作り直す。位置や状態を読んだ式だけが
//   追従する)。rowKey はこのセルの行のキー(行はキーで対応づけるので変わらない)。
export type GridCellContentContext = CellRenderState & {
  readonly rowIndex: number;
  readonly colIndex: number;
  readonly sourceRowIndex: number;
  readonly rowKey: GridRowKey;
  // セル内検索のこのセルのヒット(無ければ undefined)と、この行にカレントのヒットがあればその番号(無ければ null)。
  readonly findRanges: readonly FindRange[] | undefined;
  readonly findCurrentIndex: number | null;
};

const NO_SELECTED_COLUMNS: readonly [number, number] = [-1, -1];
const EMPTY_SLOT = resolveSlotProps<JSX.CSSProperties>(undefined);

// class の語を空白でつなぐ(偽の値と空の文字列は飛ばす)。
const joinClasses = (...parts: Array<string | false | null | undefined>): string => {
  let out = '';
  for (const part of parts) {
    if (part) {
      out = out ? `${out} ${part}` : part;
    }
  }
  return out;
};

// 飾りの無い列か(セルの書式 cellClassName・メモ cellNote・組み込みの検査の印・データバー / カラースケール・auto-height の器の
//   どれも無い)。セルの部品の形を決めるので、セルのキー(cellKey)にも入れる(形が変わったらセルを作り直す)。renderCell の
//   有無も同じ(renderCell の中身は行ごとに作るので、セルを作るときに決める)。
const isPlainCellColumn = <T,>(column: PaneColumnEntry<T>['column']): boolean =>
  column.cellClassName === undefined &&
  !column.cellNote &&
  !hasCellValidation(column) &&
  column.conditionalFormat?.dataBar === undefined &&
  column.conditionalFormat?.colorScale === undefined &&
  column.autoHeight !== true;
const cellKey = <T,>(entry: PaneColumnEntry<T>): string =>
  `${entry.column.key}\u0000${isPlainCellColumn(entry.column) ? 'plain' : 'decorated'}${entry.column.renderCell ? '+render' : ''}`;

// 細い列の状態チップは余白を詰めてアイコンを外す(React 版の view/GridBodyLayer と同じ幅)。
export const CHIP_COMPACT_MAX_WIDTH = 80;

export type GridBodyRowItem = {
  index: number;
  start: number;
  size: number | undefined;
  key: string;
  // サーバーサイドでまだ届いていない行(読み込み中の行を描く)。キーはデータ行と名前空間を分けた `__ssg_skeleton__:<位置>`
  //   なので、行が届くとキーが変わり、本物の行に差し替わる(React 版と同じ)。
  skeleton: boolean;
};

type GridBodyLayerProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  leadingWidth: number;
  rowHeight: number;
  rowHeaderWidth: number;
  rows: readonly GridBodyRowItem[];
  entries: readonly PaneColumnEntry<T>[];
  rowModel: RowModel<T>;
  // auto-height(行の高さの実測)の行か。true かつ column.autoHeight のセルは中身を器に入れて測る(React 版と同じ)。
  autoHeight: boolean;
  // 背の高い行での縦の揃え(列の verticalAlign が優先)。
  verticalAlign: GridVerticalAlign | undefined;
  // 条件付き書式の機能(無ければ conditionalFormat を指定した列も素の表示)と、列ごとの min / max。
  conditionalFormat: SolidGridFeatures['conditionalFormat'];
  conditionalFormatStats: ConditionalFormatStatsMap;
  // セル内検索のヒット(rowIndex → colIndex → 範囲。検索の機能が無い / 閉じているときは空)とカレントのヒットの番号。
  findIndex: FindIndex;
  findCurrentIndex: number | null;
  // 行のグループ化の機能(無い構成ではグループ行を作らない)と、折りたたんでいるグループのキー・開閉の処理。
  grouping: SolidGridFeatures['grouping'];
  collapsedGroupKeys: ReadonlySet<string>;
  onGroupToggle: (groupKey: string) => void;
  // ラベル行の描き方(無ければラベル行を作らない)と、表示中のラベル行の view index(昇順。データ行の行番号はラベル行を飛ばした
  //   通し番号になる。無ければ view index + 1)。
  labelRowLayer: GridBodyLabelRowLayer<T> | undefined;
  labelViewIndexes?: ArrayLike<number> | undefined;
  // 読み込み中の行の部品(サーバーサイドのときだけ。機能 features/serverSide)。
  skeletonRow: NonNullable<SolidGridFeatures['serverSide']>['BodySkeletonRow'] | undefined;
  ariaRowOffset: number;
  activeCell: CellCoord | null;
  editingCell: CellCoord | null;
  selection: SelectionSnapshot;
  isWholeGridSelected: boolean;
  hoveredRowIndex: number | null;
  enableRowSelection: boolean;
  rowSelectionState: RowSelectionState;
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  showValidationMarks: boolean;
  showCellOverflowTooltip: boolean;
  getRowClassName: SpreadsheetGridProps<T>['getRowClassName'];
  slots: GridResolvedSlots;
  activeCellDomId: string;
  cellEditorDomId: string;
  // 行は読んだときに引く(読まない中身 = checkbox 列の既定のセルは、行の値が変わっても作り直さない)。
  renderCellContent: (row: () => T, column: GridColumn<T>, cell: GridCellContentContext) => JSX.Element;
  onRowHeaderPointerDown: (rowIndex: number, event: PointerEvent) => void;
  onRowHeaderPointerEnter: (rowIndex: number, event: PointerEvent) => void;
  onRowHeaderPointerLeave: (rowIndex: number) => void;
  onCellPointerDown: (cell: CellCoord, event: PointerEvent) => void;
  onCellPointerEnter: (cell: CellCoord, event: PointerEvent) => void;
  onCellClick: (cell: CellCoord, event: MouseEvent) => void;
  onCellDoubleClick: (cell: CellCoord, event: MouseEvent) => void;
};

export function GridBodyLayer<T>(props: GridBodyLayerProps<T>) {
  const texts = useGridLocaleText();
  // 行の枠(For のキー)。行の並び(行モデル)が前と同じときだけ、範囲から出たデータ行の枠を入ってきた行に使い回します
  //   (primitives/rowSlots)。グループ行とラベル行は使い回さない(行のキーのまま)。
  const slotKindOf = (row: GridBodyRowItem): RowSlotKind => {
    if (row.skeleton) {
      return 'skeleton';
    }
    const model = props.rowModel;
    return model.getGroupRow?.(row.index) !== undefined || model.getLabelRow?.(row.index) !== undefined ? 'keyed' : 'data';
  };
  const slotted = createMemo(
    (prev: { state: RowSlotState<GridBodyRowItem>; model: RowModel<T> } | undefined) => {
      const model = props.rowModel;
      return { state: assignRowSlots(prev?.state, props.rows, slotKindOf, prev?.model === model), model };
    },
  );
  return (
    <For each={slotted().state.items} keyed={(item) => item.slot}>
      {(item) => {
        // 位置は memo で受ける(描く行の配列は作り直されるたびに新しいオブジェクトになるので、値が同じなら先へ伝えない。
        //   素の関数のままだと、ホバーやスクロールのたびに見えているすべてのセルの中身を作り直す)。
        const rowIndex = createMemo(() => item().index);
        // 読み込み中の行(サーバーサイドでまだ届いていない行)。キーに印があるので、この要素の間は読み込み中の行のまま(届くと
        //   キーが変わって本物の行の要素に替わる)。
        const SkeletonRow = untrack(() => (item().skeleton ? props.skeletonRow : undefined));
        if (SkeletonRow) {
          return (
            <SkeletonRow
              pane={props.pane}
              ownsRowHeader={props.ownsRowHeader}
              leadingWidth={props.leadingWidth}
              rowIndex={rowIndex()}
              top={item().start}
              rowHeight={item().size ?? props.rowHeight}
              ariaRowOffset={props.ariaRowOffset}
              rowHeaderWidth={props.rowHeaderWidth}
              entries={props.entries}
              isRowHovered={props.hoveredRowIndex === rowIndex()}
              showRowCheckbox={props.enableRowSelection}
              onRowHeaderPointerDown={props.onRowHeaderPointerDown}
              onRowHeaderPointerEnter={props.onRowHeaderPointerEnter}
              onRowHeaderPointerLeave={props.onRowHeaderPointerLeave}
              onCellPointerDown={props.onCellPointerDown}
              onCellPointerEnter={props.onCellPointerEnter}
              slots={props.slots}
            />
          );
        }
        const row = () => props.rowModel.getRow(rowIndex());
        // グループ行(グループ化している間だけ rowModel が getGroupRow を持つ。getRow は undefined なので下のデータ行は描かない)。
        //   行のキーの名前空間がデータ行と違う(core の groupRowKey)ので、同じ項目がグループ行とデータ行の間で入れ替わることはない。
        const groupRow = createMemo(() => (props.grouping ? props.rowModel.getGroupRow?.(rowIndex()) : undefined));
        // ラベル行(ラベル行があるときだけ rowModel が getLabelRow を持つ。getRow は undefined)。ラベル行のキーはその行の
        //   rowKeyGetter の値で、データ行と同じ名前空間(ラベル行かは述語で決まるので、述語が変わると同じ項目のまま入れ替わる)。
        const labelRow = createMemo(() =>
          props.labelRowLayer ? props.rowModel.getLabelRow?.(rowIndex()) : undefined,
        );
        return (
          <>
            <Show when={groupRow()}>
              {(group) => {
                const GroupRow = untrack(() => props.grouping)?.BodyGroupRow;
                return GroupRow ? (
                  <GroupRow
                    pane={props.pane}
                    ownsRowHeader={props.ownsRowHeader}
                    leadingWidth={props.leadingWidth}
                    rowIndex={rowIndex()}
                    top={item().start}
                    rowHeight={item().size ?? props.rowHeight}
                    rowHeaderWidth={props.rowHeaderWidth}
                    entries={props.entries}
                    ariaRowOffset={props.ariaRowOffset}
                    isRowHovered={props.hoveredRowIndex === rowIndex()}
                    showRowCheckbox={props.enableRowSelection}
                    groupRow={group()}
                    isCollapsed={props.collapsedGroupKeys.has(group().groupKey)}
                    onGroupToggle={props.onGroupToggle}
                    onRowHeaderPointerEnter={props.onRowHeaderPointerEnter}
                    onRowHeaderPointerLeave={props.onRowHeaderPointerLeave}
                    onCellPointerDown={props.onCellPointerDown}
                    onCellPointerEnter={props.onCellPointerEnter}
                    slots={props.slots}
                  />
                ) : null;
              }}
            </Show>
            <Show when={labelRow()}>
              {(label) => {
                const layer = () => props.labelRowLayer;
                const LabelRow = untrack(layer)?.Row;
                const labelSlot = createMemo(() => resolveSlotProps<JSX.CSSProperties>(layer()?.resolveRowSlot(label())));
                // 行のキーは値の memo で受ける(行モデルをそのまま読むと、render の本体で rowKey を読んだときにどのデータ行の
                //   書き換えでも中身を作り直す)。
                const labelRowKey = createMemo((): GridRowKey => props.rowModel.getRowKey(rowIndex()) ?? rowIndex());
                return LabelRow ? (
                  <LabelRow
                    pane={props.pane}
                    ownsRowHeader={props.ownsRowHeader}
                    rowIndex={rowIndex()}
                    rowKey={labelRowKey()}
                    top={item().start}
                    ariaRowOffset={props.ariaRowOffset}
                    rowHeight={item().size ?? props.rowHeight}
                    rowHeaderWidth={props.rowHeaderWidth}
                    labelRow={label()}
                    renderContent={layer()?.renderContent ?? null}
                    contentStickyLeft={layer()?.contentStickyLeft ?? 0}
                    contentWidth={layer()?.contentWidth ?? 0}
                    rowClassName={labelSlot().className}
                    rowStyle={labelSlot().style}
                    slots={props.slots}
                  />
                ) : null;
              }}
            </Show>
            <Show when={row()}>
              {(currentRow) => {
                const rowKey = createMemo((): GridRowKey => props.rowModel.getRowKey(rowIndex()) ?? rowIndex());
                // 別の行に使い回した要素(行のキーが変わった)は、次の次のフレームまで transition を止めます(primitives/reusedRow)。
                let rowElement: HTMLDivElement | undefined;
                createRenderEffect(
                  rowKey,
                  (_next, previous) => {
                    if (previous !== undefined && rowElement) {
                      markReusedRow(rowElement);
                    }
                  },
                  { name: 'reusedRow' },
                );
                const sourceRowIndex = () => props.rowModel.getSourceIndex(rowIndex()) ?? rowIndex();
                // 行の高さは値だけの memo(項目のオブジェクトはスクロールのたびに新しくなる)。
                const rowSize = createMemo(() => item().size ?? props.rowHeight);
                const isRowChecked = createMemo(() =>
                  props.enableRowSelection ? resolveIsRowSelected(props.rowSelectionState, rowKey()) : false,
                );
                const isRowSelected = createMemo(
                  () =>
                    props.selection.kind === 'row' &&
                    rowIndex() >= props.selection.startRow &&
                    rowIndex() <= props.selection.endRow,
                );
                // この行で選ばれている列の範囲(React 版の selectedColStart / selectedColEnd。無ければ -1)。
                const selectedColRange = createMemo((): readonly [number, number] => {
                  const selection = props.selection;
                  if (selection.kind === 'col') {
                    return [selection.startCol, selection.endCol];
                  }
                  if (selection.kind === 'cell' && rowIndex() >= selection.startRow && rowIndex() <= selection.endRow) {
                    return [selection.startCol, selection.endCol];
                  }
                  return NO_SELECTED_COLUMNS;
                });
                const selectedColStart = () => selectedColRange()[0];
                const selectedColEnd = () => selectedColRange()[1];
                const activeCol = createMemo(() => (props.activeCell?.row === rowIndex() ? props.activeCell.col : -1));
                // セル内検索: この行のヒットと、この行にカレントのヒットがあればその番号(無ければ null)。どちらも行ごとの memo に
                //   して、セルは行の値だけを読みます(ヒットの表やカレントの番号をセルごとに読むと、1 回の検索に数千の購読が付く)。
                const rowFindHits = createMemo(() => props.findIndex.get(rowIndex()));
                const rowFindCurrent = createMemo((): number | null => {
                  const hits = rowFindHits();
                  const current = hits ? props.findCurrentIndex : null;
                  if (!hits || current === null) {
                    return null;
                  }
                  for (const ranges of hits.values()) {
                    if (ranges.some((range) => range.matchIndex === current)) {
                      return current;
                    }
                  }
                  return null;
                });
                const editingCol = createMemo(() => (props.editingCell?.row === rowIndex() ? props.editingCell.col : -1));
                // auto-height を使っているか(行ごとの memo)。セルは memo を作らないときに読むたびにこれを見るので、シェルの値を
                //   直接読ませない(auto-height の切り替えで、シェルの値の購読がセルの数の 2 倍になる。Solid の開発ビルドの
                //   HUGE_FAN_OUT は 2,000 から)。
                const rowAutoHeight = createMemo(() => !!props.autoHeight);
                const isHovered = createMemo(() => props.hoveredRowIndex === rowIndex());
                const rowSlot = createMemo(() =>
                  resolveSlotProps<JSX.CSSProperties>(
                    props.getRowClassName?.(currentRow(), rowIndex(), {
                      row: currentRow(),
                      rowIndex: rowIndex(),
                      sourceRowIndex: sourceRowIndex(),
                      rowKey: rowKey(),
                      isSelected: isRowChecked(),
                    }),
                  ),
                );
                const rowNumber = () =>
                  props.labelViewIndexes ? resolveDataRowNumber(props.labelViewIndexes, rowIndex()) : rowIndex() + 1;
                return (
                  <div
                    ref={(element) => {
                      rowElement = element;
                    }}
                    data-pane={props.pane}
                    data-row-index={rowIndex()}
                    role="row"
                    aria-rowindex={rowIndex() + 2 + props.ariaRowOffset}
                    aria-selected={props.enableRowSelection ? (isRowChecked() ? 'true' : 'false') : undefined}
                    data-row-key={String(rowKey())}
                    class={joinClasses(
                      'ssg-body-row',
                      rowSlot().className,
                      props.slots.bodyRow?.className,
                      isRowChecked() && 'ssg-body-row--checked',
                    )}
                    style={{
                      ...props.slots.bodyRow?.style,
                      ...rowSlot().style,
                      height: px(rowSize()),
                      transform: `translateY(${item().start}px)`,
                    }}
                  >
                    <Show when={props.ownsRowHeader}>
                      <div
                        role="rowheader"
                        aria-colindex={1}
                        onPointerDown={(event) => props.onRowHeaderPointerDown(rowIndex(), event)}
                        onPointerEnter={(event) => props.onRowHeaderPointerEnter(rowIndex(), event)}
                        onPointerLeave={() => props.onRowHeaderPointerLeave(rowIndex())}
                        class={joinClasses(
                          'ssg-header-cell ssg-row-header-cell',
                          rowSlot().className,
                          props.slots.rowHeaderCell?.className,
                          props.enableRowSelection && 'ssg-row-header-cell--checkbox',
                          (props.isWholeGridSelected || isRowSelected()) && 'ssg-header-cell--selected',
                          isHovered() && 'ssg-header-cell--hovered',
                        )}
                        style={{
                          ...props.slots.rowHeaderCell?.style,
                          ...rowSlot().style,
                          width: px(props.rowHeaderWidth),
                          'min-width': px(props.rowHeaderWidth),
                          height: px(rowSize()),
                        }}
                      >
                        <Show when={props.enableRowSelection} fallback={rowNumber()}>
                          <RowSelectionCheckbox
                            slot={props.slots.checkbox}
                            label={formatLocaleText(texts().selectRow, { row: rowNumber() })}
                            state={isRowChecked() ? 'checked' : 'unchecked'}
                          />
                        </Show>
                      </div>
                    </Show>
                    <For each={props.entries} keyed={cellKey}>
                      {(entry) => {
                        // 飾りの無い列のセル(下の isPlainCellColumn)は、書式・メモ・検査の印・データバー・auto-height の器の
                        //   部品を作りません(段 3-4 / S12-03。遠くへスクロールするたびに見えているセルを作り直すので、セルごとの
                        //   memo と Show の数がそのまま手間になる)。列の指定が変わって形が変わったときは、キー(cellKey)が変わって
                        //   セルを作り直します。
                        const plain = untrack(() => isPlainCellColumn(entry().column));
                        const unbound = createMemo(() => entry().column);
                        const column = () => unbound() as unknown as GridColumn<T>;
                        const colIndex = createMemo(() => entry().logicalIndex);
                        const size = () => entry().paneLocalSize;
                        const isActive = () => activeCol() === colIndex();
                        const isEditing = () => editingCol() === colIndex();
                        const isSelected = () =>
                          isRowSelected() ||
                          (selectedColStart() >= 0 && colIndex() >= selectedColStart() && colIndex() <= selectedColEnd());
                        // 編集できないセルか。memo にしません(読むのは箱の属性の計算と、中身が ctx.readOnly を読んだ式だけ。
                        //   セルを作るたびの memo の手間を減らす。段 3-4)。
                        const readOnlyCell = (): boolean =>
                          !isCellEditable(
                            { readOnly: props.readOnly, canEditCell: props.canEditCell },
                            rowIndex(),
                            colIndex(),
                            currentRow(),
                            unbound(),
                            props.canEditCell ? { sourceRowIndex: sourceRowIndex(), rowKey: rowKey() } : undefined,
                          );
                        const value = () => getCellValue(currentRow(), unbound());
                        // 省略できる機能の値は、その機能を使う列(行)のセルだけ memo にします(primitives/memoWhen。遠くへスクロール
                        //   するたびに見えているセルを作り直すので、使わない機能の memo を作らない)。
                        const findRanges = createMemoWhen(
                          () => rowFindHits()?.has(colIndex()) === true,
                          () => rowFindHits()?.get(colIndex()),
                          undefined,
                        );
                        // セルの中身へ渡す位置と操作の状態は、読んだときに引く形にする(中身を作る式が読まないように)。
                        //   クリックの pointerdown でアクティブセルが変わるたびに中身を作り直すと、pointerup が別の要素に落ちて
                        //   click が起きない(チェックボックスのセルや renderCell のボタンが押せない)。並べ替えで行の位置が
                        //   変わるたびに作り直すと、renderCell の中の入力欄のフォーカスが外れる。React は同じ要素を使い回す。
                        const cellState: GridCellContentContext = {
                          get rowIndex() {
                            return rowIndex();
                          },
                          get colIndex() {
                            return colIndex();
                          },
                          get sourceRowIndex() {
                            return sourceRowIndex();
                          },
                          get rowKey() {
                            return rowKey();
                          },
                          get findRanges() {
                            return findRanges();
                          },
                          get findCurrentIndex() {
                            return rowFindCurrent();
                          },
                          get isActive() {
                            return isActive();
                          },
                          get isSelected() {
                            return isSelected();
                          },
                          get isEditing() {
                            return isEditing();
                          },
                          get readOnly() {
                            return readOnlyCell();
                          },
                        };
                        // セルの書式とメモに渡す文脈(どちらも無い列では作らない。React 版と同じ)。
                        const needsStyleContext = () => typeof column().cellClassName === 'function' || !!column().cellNote;
                        const styleContext = plain ? () => null : createMemoWhen(
                          needsStyleContext,
                          (): CellStyleContext<T, SolidGridTypes> | null => ({
                            row: currentRow(),
                            rowIndex: rowIndex(),
                            sourceRowIndex: sourceRowIndex(),
                            rowKey: rowKey(),
                            colIndex: colIndex(),
                            value: value(),
                            column: column(),
                            isActive: isActive(),
                            isSelected: isSelected(),
                            isEditing: isEditing(),
                            readOnly: readOnlyCell(),
                          }),
                          null,
                        );
                        const conditionalCell = plain ? () => EMPTY_SLOT : createMemoWhen(
                          () => column().cellClassName !== undefined,
                          () => {
                            const cellClassName = column().cellClassName;
                            const context = styleContext();
                            return resolveSlotProps<JSX.CSSProperties>(
                              typeof cellClassName === 'function' ? (context ? cellClassName(context) : undefined) : cellClassName,
                            );
                          },
                          resolveSlotProps<JSX.CSSProperties>(undefined),
                        );
                        // 条件付き書式(データバー / カラースケール)。指定のある列だけ値と集計を読みます(React 版と同じ)。
                        //   帯は .ssg-cf-bar(絶対配置・文字の下)、背景色は inline の color-mix()(文字色は変えない)。
                        const formatRules = () => (props.conditionalFormat ? column().conditionalFormat : undefined);
                        const dataBar = plain ? () => null : createMemoWhen(
                          () => formatRules()?.dataBar !== undefined,
                          () => {
                            const feature = props.conditionalFormat;
                            const rules = formatRules();
                            return feature && rules?.dataBar
                              ? feature.resolveDataBar(rules.dataBar, value(), props.conditionalFormatStats.get(column().key))
                              : null;
                          },
                          null,
                        );
                        const scaleBackground = plain ? () => null : createMemoWhen(
                          () => formatRules()?.colorScale !== undefined,
                          () => {
                            const feature = props.conditionalFormat;
                            const rules = formatRules();
                            return feature && rules?.colorScale
                              ? feature.resolveColorScaleBackground(
                                  rules.colorScale,
                                  value(),
                                  props.conditionalFormatStats.get(column().key),
                                )
                              : null;
                          },
                          null,
                        );
                        const dataBarColor = () => {
                          const bar = dataBar();
                          const rules = formatRules()?.dataBar;
                          return bar ? (bar.negative ? rules?.negativeColor : rules?.color) : undefined;
                        };
                        const invalidMessage = plain ? () => null : createMemoWhen(
                          () => !!props.showValidationMarks && hasCellValidation(unbound()),
                          () => getInvalidMessage(unbound(), currentRow(), value(), texts()),
                          null,
                        );
                        const cellNote = plain ? () => null : createMemoWhen(
                          () => !!column().cellNote,
                          () => {
                            const note = column().cellNote;
                            const context = styleContext();
                            return note && context ? normalizeCellNote(note(context)) : null;
                          },
                          null,
                        );
                        const tooltipText = () => resolveCellTooltipText(invalidMessage(), cellNote());
                        // auto-height の列のセルは、箱はほかのセルと同じく行の高さで、中身を器(data-autoheight-content)に
                        //   入れて器の高さを測ります(React 版 DU-32)。背の高い行での揃えは、未指定なら auto-height の列が上、
                        //   ほかの列は真ん中(1 行の行ではどれも真ん中)。
                        //   2 つの真偽値は 1 つの値(1 = auto-height のセル、2 = 上にそろえる)にまとめます。auto-height を使わない
                        //   ときは memo を作らず、行ごとの rowAutoHeight だけを読みます。
                        const autoHeightFlags = createMemoWhen(
                          rowAutoHeight,
                          () => {
                            const content = column().autoHeight === true;
                            const top =
                              rowSize() > props.rowHeight &&
                              (column().verticalAlign ?? props.verticalAlign ?? (content ? 'top' : 'center')) === 'top';
                            return (content ? 1 : 0) | (top ? 2 : 0);
                          },
                          0,
                        );
                        const isAutoHeightCell = () => (autoHeightFlags() & 1) !== 0;
                        const alignTop = () => (autoHeightFlags() & 2) !== 0;
                        const markOverflowTooltip = () =>
                          shouldMarkCellOverflowTooltip({
                            enabled: props.showCellOverflowTooltip,
                            isAutoHeightCell: isAutoHeightCell(),
                            hasRenderCell: column().renderCell !== undefined,
                          });
                        const cell = () => ({ row: rowIndex(), col: colIndex() });
                        // 利用側の renderCell(と合成列)の中身は行ごとに作ります(要素を別の行に使い回したときに、中の signal や
                        //   入力欄の状態が別の行へ持ち越されないように。React 版は行ごとに別の要素)。行のキーを読んだ式の中で作るので、
                        //   キーが変わると作り直す(renderCell の有無はセルのキー cellKey に入っている)。
                        const keyedContent = untrack(() => entry().column.renderCell !== undefined);
                        // セルの中身。飾りの無い列は中身だけ(中身を作る式が読んだ値 = 行の値などが変わったときに作り直す)。
                        const cellChildren = plain
                          ? () => props.renderCellContent(currentRow, column(), cellState)
                          : () => (
                              <>
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
                                <Show
                                  when={isAutoHeightCell()}
                                  fallback={props.renderCellContent(currentRow, column(), cellState)}
                                >
                                  <div class="ssg-autoheight-content" data-autoheight-content="">
                                    {props.renderCellContent(currentRow, column(), cellState)}
                                  </div>
                                </Show>
                              </>
                            );
                        const cellContent = keyedContent
                          ? () => {
                              rowKey();
                              return cellChildren();
                            }
                          : cellChildren;
                        return (
                          <div
                            role="gridcell"
                            aria-colindex={colIndex() + 2}
                            aria-selected={isSelected() ? 'true' : 'false'}
                            aria-readonly={readOnlyCell() ? 'true' : undefined}
                            aria-invalid={invalidMessage() !== null ? 'true' : undefined}
                            aria-description={tooltipText() ?? undefined}
                            id={isActive() ? props.activeCellDomId : undefined}
                            aria-owns={isEditing() ? props.cellEditorDomId : undefined}
                            data-ssg-col-key={column().key}
                            data-autoheight-cell={isAutoHeightCell() ? '' : undefined}
                            data-ssg-tooltip={tooltipText() ?? undefined}
                            data-ssg-tooltip-overflow={markOverflowTooltip() ? '' : undefined}
                            class={joinClasses(
                              'ssg-body-cell',
                              rowSlot().className,
                              conditionalCell().className,
                              props.slots.bodyCell?.className,
                              column().align === 'center' && 'ssg-body-cell--align-center',
                              column().align === 'right' && 'ssg-body-cell--align-right',
                              dataBar() !== null && 'ssg-body-cell--cf-bar',
                              scaleBackground() !== null && 'ssg-body-cell--cf-scale',
                              formatRules()?.chips !== undefined && size() < CHIP_COMPACT_MAX_WIDTH && 'ssg-body-cell--chip-compact',
                              isAutoHeightCell() && 'ssg-body-cell--autoheight',
                              alignTop() && 'ssg-body-cell--valign-top',
                              readOnlyCell() && !isSelected() && 'ssg-body-cell--readonly',
                              invalidMessage() !== null && 'ssg-body-cell--invalid',
                              cellNote() !== null && 'ssg-body-cell--has-note',
                              isHovered() && 'ssg-body-cell--row-hovered',
                            )}
                            onPointerDown={(event) => {
                              if (event.target instanceof Element && event.target.closest('.ssg-detail-toggle')) {
                                return;
                              }
                              props.onCellPointerDown(cell(), event);
                            }}
                            onPointerEnter={(event) => props.onCellPointerEnter(cell(), event)}
                            onClick={(event) => props.onCellClick(cell(), event)}
                            onDblClick={(event) => props.onCellDoubleClick(cell(), event)}
                            ref={markClickTarget}
                            style={{
                              ...props.slots.bodyCell?.style,
                              ...(scaleBackground() !== null ? { 'background-color': scaleBackground() as string } : null),
                              ...rowSlot().style,
                              ...conditionalCell().style,
                              left: px(props.leadingWidth + entry().paneLocalStart),
                              width: px(size()),
                              'min-width': px(size()),
                              height: px(rowSize()),
                              'word-break': column().wordBreak,
                              'line-break': column().lineBreak,
                              'z-index': isActive() ? 3 : 1,
                            }}
                          >
                            {cellContent()}
                          </div>
                        );
                      }}
                    </For>
                  </div>
                );
              }}
            </Show>
          </>
        );
      }}
    </For>
  );
}