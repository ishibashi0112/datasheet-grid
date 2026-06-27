import { memo } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
// 変更(11-A): uiState 丸ごと依存を撤廃しました。
//   旧: GridBodyRow が uiState を受け取り selectIsActiveCell / selectIsCellSelected を
//       セルごとに評価 → uiState のあらゆる更新(選択ドラッグの毎 pointermove 等)で
//       memo の shallow 比較が全行不一致になり、全行×3ペインの再レンダーが発生。
//   新: 親(GridBodyLayer)が SelectionSnapshot + activeCell / editingCell から
//       「行ごとのプリミティブ値」へ分解して渡す。プリミティブなら shallow 比較が
//       値比較として機能するため、選択範囲が変わっても再レンダーされるのは
//       実際に選択状態が変化した行だけになる。
import type { SelectionSnapshot } from '../model/gridSelectors';
import type {
  CellCoord,
  CellRenderState,
  GridColumn,
  GridRowKey,
  // 追加(DS-3-0): 行モデルのシーム契約型です(filteredRows/Keys props を置換)。
  RowModel,
  SpreadsheetGridProps,
} from '../model/gridTypes';
// 変更(10-C): 列座標を ColumnMeasurement(グローバル) から
//             PaneColumnEntry(ペインローカル) へ切り替えます。
import type { PaneColumnEntry } from '../logic/geometry';
import type { GridPaneKind } from './GridHeaderRow';
import { getCellValue, isCellEditable } from '../utils/permissions';
// 追加(UI CSS移行): className 合成ヘルパー。
import { cx } from '../logic/cx';

type VirtualRowLike = {
  index: number;
  start: number;
  // 追加(C1): auto-height の行ごと高さ。uniform では undefined(rowHeight へフォールバック)。
  size?: number;
};

// ──────────────────────────────────────────────────────────
// A-1: 行を React.memo で切り出します(縦スクロールのチカチカ対策の本命)。
//   この GridBodyRow は下記の props がすべて「縦スクロール中は参照安定」になるよう
//   設計してあります(親側で rowHeaderCellStyle を useMemo 化、ハンドラは useCallback、
//   renderEntries は縦スクロールでは不変)。
// 変更(11-A): さらに「選択操作中も安定」へ強化しました。
//   uiState オブジェクトの代わりに、この行に関係する選択状態だけを
//   プリミティブ(number / boolean)で受け取ります。
//   - activeColInRow / editingColInRow: この行に active / editing セルがあれば
//     その論理列 index、無ければ -1。
//   - selectedColStart / selectedColEnd: この行で選択されている論理列 index の
//     閉区間。選択が掛かっていない行は -1 / -1。
//   - isRowSelected: 行選択(type 'row')でこの行が範囲内かどうか。
//   これにより選択ドラッグの毎 pointermove で再レンダーされるのは
//   「選択状態のプリミティブ値が実際に変わった行」だけになります。
//   (11-diag で実証済み: 範囲外の行は親が何回再レンダーされてもスキップされます)
// ──────────────────────────────────────────────────────────
type GridBodyRowProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  leadingWidth: number;
  rowIndex: number;
  rowKey: GridRowKey;
  row: T;
  // virtualRow.start(scrollMargin=headerHeight 込み)。行全体の translateY に使います。
  top: number;
  renderEntries: PaneColumnEntry<T>[];
  // この行の解決済み高さ(px)。uniform では rowHeight prop と同値、auto-height では行ごとの
  //   解決済み高さ(virtualRow.size)が GridBodyLayer 側で載ります。
  rowHeight: number;
  // 追加(C1): auto-height 行モードか。true かつ column.autoHeight のセルは内容駆動レイアウト
  //   (min-height + white-space:normal + 測定マーカー)になります。uniform では常に false。
  autoHeight: boolean;
  // 追加(C1-6): auto-height セルの min-height 下限(基準行高=estimate)。rowHeight(=解決済み行高/
  //   実測由来)を下限にすると一度伸びた行が縮まなくなる(min-height で測定が下げ止まる)ため、
  //   下限は実測に依存しない固定値(基準行高)にして shrink を可能にします。GridBodyLayer の基準
  //   rowHeight prop がそのまま入ります(uniform では未使用)。
  autoHeightMinHeight: number;
  rowHeaderCellStyle: CSSProperties;
  // 注記: hoveredRowIndex そのものではなく「この行がホバー中か」を boolean で渡します。
  //       これによりホバー変化時に再レンダーされるのは該当 2 行だけで済みます。
  isRowHovered: boolean;
  isWholeGridSelected: boolean;
  // 追加(11-A): 行ごとの選択状態プリミティブです(uiState 丸ごと渡しの置き換え)。
  isRowSelected: boolean;
  activeColInRow: number;
  editingColInRow: number;
  selectedColStart: number;
  selectedColEnd: number;
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  onRowHeaderPointerDown: (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onRowHeaderPointerEnter: (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onRowHeaderPointerLeave: (rowIndex: number) => void;
  onCellPointerDown: (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onCellPointerEnter: (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onCellDoubleClick: (cell: CellCoord) => void;
  // 変更(11-A): セル状態(cellState)は行側で算出し、第5引数で引き渡します。
  //             これにより親の renderCellContent は uiState 非依存になり、
  //             選択操作で参照が変わらなくなります。
  renderCellContent: (
    row: T,
    rowIndex: number,
    column: GridColumn<T>,
    colIndex: number,
    cellState: CellRenderState,
  ) => ReactNode;
  // 追加(UI CSS移行): 条件付き / スロット className(すべて文字列=プリミティブで memo 安全)。
  //   rowClassName=getRowClassName の解決結果(親で算出)。bodyCellClassName / bodyRowClassName
  //   =classNames.bodyCell / .bodyRow スロット。
  rowClassName?: string;
  bodyCellClassName?: string;
  bodyRowClassName?: string;
  // 追加(UI CSS移行・ヘッダー): 行ヘッダー「#」セルへのスロット。
  rowHeaderCellClassName?: string;
};

function GridBodyRowInner<T>({
  pane,
  ownsRowHeader,
  leadingWidth,
  rowIndex,
  rowKey,
  row,
  top,
  renderEntries,
  rowHeight,
  autoHeight,
  autoHeightMinHeight,
  rowHeaderCellStyle,
  isRowHovered,
  isWholeGridSelected,
  isRowSelected,
  activeColInRow,
  editingColInRow,
  selectedColStart,
  selectedColEnd,
  readOnly,
  canEditCell,
  onRowHeaderPointerDown,
  onRowHeaderPointerEnter,
  onRowHeaderPointerLeave,
  onCellPointerDown,
  onCellPointerEnter,
  onCellDoubleClick,
  renderCellContent,
  rowClassName,
  bodyCellClassName,
  bodyRowClassName,
  rowHeaderCellClassName,
}: GridBodyRowProps<T>) {
  return (
    <div
      data-pane={pane}
      data-row-index={rowIndex}
      className={cx('ssg-body-row', rowClassName, bodyRowClassName)}
      style={{
        height: rowHeight,
        transform: `translateY(${top}px)`,
      }}
    >
      {ownsRowHeader && (
        <div
          onPointerDown={(event) => onRowHeaderPointerDown(rowIndex, event)}
          onPointerEnter={(event) => onRowHeaderPointerEnter(rowIndex, event)}
          onPointerLeave={() => onRowHeaderPointerLeave(rowIndex)}
          className={cx(
            'ssg-header-cell',
            'ssg-row-header-cell',
            (isWholeGridSelected || isRowSelected) &&
              'ssg-header-cell--selected',
            isRowHovered && 'ssg-header-cell--hovered',
            rowClassName,
            rowHeaderCellClassName,
          )}
          style={{
            ...rowHeaderCellStyle,
            height: rowHeight,
          }}
        >
          {rowIndex + 1}
        </div>
      )}

      {renderEntries.map((entry) => {
        if (!entry) {
          return null;
        }

        const colIndex = entry.logicalIndex;
        const column = entry.column;
        const left = leadingWidth + entry.paneLocalStart;
        const size = entry.paneLocalSize;

        // 変更(11-A): セル状態は uiState セレクタではなく行プリミティブから導出します。
        //   isSelected は旧 selectIsCellSelected と等価です:
        //   - 行選択(type 'row')で行が範囲内 → isRowSelected
        //   - セル選択(type 'cell')で行が範囲内 / 列選択(type 'col')
        //       → selectedColStart..selectedColEnd の閉区間に colIndex が入るか
        const isActive = colIndex === activeColInRow;
        const isEditing = colIndex === editingColInRow;
        const isSelected =
          isRowSelected ||
          (selectedColStart >= 0 &&
            colIndex >= selectedColStart &&
            colIndex <= selectedColEnd);
        const readOnlyCell = !isCellEditable(
          { readOnly, canEditCell },
          rowIndex,
          colIndex,
          row,
          column,
        );

        // 追加(C1): auto-height モードかつ駆動列(column.autoHeight)のセルは内容駆動高さにします。
        //   高さを固定せず min-height=解決済み行高を下限に、white-space:normal で折り返します。
        //   data-autoheight-cell は C1-3 の ResizeObserver が実測対象を見つけるためのマーカーです。
        //   uniform(autoHeight=false)では常に false で、従来どおり固定高 + 中央寄せになります。
        const isAutoHeightCell = autoHeight && column.autoHeight === true;

        // 追加(UI CSS移行): セルの className を合成します。基底(.ssg-body-cell)+ 状態修飾子
        //   (autoheight / readonly / row-hovered)+ 条件付き(行=rowClassName / 列=cellClassName)
        //   + スロット(bodyCellClassName)。状態系は @layer ssg-base なので、条件付き / スロットの
        //   クラスが特異度を気にせず背景等を上書きできます。列 cellClassName が関数のときだけ
        //   値解決(getCellValue)します(未指定列は無コスト)。
        let conditionalCellClass: string | undefined;
        const columnCellClassName = column.cellClassName;
        if (columnCellClassName) {
          conditionalCellClass =
            typeof columnCellClassName === 'function'
              ? columnCellClassName({
                  row,
                  rowIndex,
                  colIndex,
                  value: getCellValue(row, column),
                  column,
                  isActive,
                  isSelected,
                  isEditing,
                  readOnly: readOnlyCell,
                })
              : columnCellClassName;
        }
        const cellClassName = cx(
          'ssg-body-cell',
          // 追加(③): セル内容の水平寄せ(align)。未指定は従来どおり左。
          column.align === 'center' && 'ssg-body-cell--align-center',
          column.align === 'right' && 'ssg-body-cell--align-right',
          isAutoHeightCell && 'ssg-body-cell--autoheight',
          readOnlyCell && !isSelected && 'ssg-body-cell--readonly',
          isRowHovered && 'ssg-body-cell--row-hovered',
          rowClassName,
          conditionalCellClass,
          bodyCellClassName,
        );

        return (
          <div
            key={`${String(rowKey)}-${column.key}`}
            data-autoheight-cell={isAutoHeightCell ? '' : undefined}
            className={cellClassName}
            onPointerDown={(event) =>
              onCellPointerDown({ row: rowIndex, col: colIndex }, event)
            }
            onPointerEnter={(event) =>
              onCellPointerEnter({ row: rowIndex, col: colIndex }, event)
            }
            onDoubleClick={() =>
              onCellDoubleClick({ row: rowIndex, col: colIndex })
            }
            style={{
              left,
              width: size,
              minWidth: size,
              // auto-height セル: 内容駆動(下限=基準行高=estimate)。通常セル: 従来どおり固定高 + 中央寄せ。
              // 変更(C1-5): uniform セルは固定行高に対し長文だと既定の white-space:normal で折り返し、
              //   overflow 未指定のため溢れた分が隣行へ被って見えていました(autoHeight:true 列を
              //   uniform 側=gate 外/トグル OFF で表示したときに顕在化)。nowrap + overflow:hidden で
              //   1 行表示・セル境界クリップへ寄せ、隣行への被りを防ぎます(短文列は元から 1 行で不変)。
              // 変更(C1-6): min-height を rowHeight(解決済み行高=実測由来)から autoHeightMinHeight
              //   (基準行高=estimate・実測非依存)へ変更。旧実装は一度伸びた行の min-height が大きい実測値で
              //   固定され、列幅拡大等で内容が減っても測定が min-height で下げ止まり行が縮みませんでした。
              //   固定下限にすることでセルが内容まで縮み、再測定で小さい値が反映されて行が shrink します。
              ...(isAutoHeightCell
                ? { minHeight: autoHeightMinHeight }
                : { height: rowHeight }),
              zIndex: isActive ? 3 : 1,
            }}
          >
            {renderCellContent(row, rowIndex, column, colIndex, {
              isActive,
              isSelected,
              isEditing,
              readOnly: readOnlyCell,
            })}
          </div>
        );
      })}
    </div>
  );
}

// memo + ジェネリック関数コンポーネントの定石です(型を保ったまま memo 化)。
const GridBodyRow = memo(GridBodyRowInner) as typeof GridBodyRowInner;

// ──────────────────────────────────────────────────────────
// 追加(①-4): serverSide(SSRM)で未ロードの行に描画するスケルトン行です。
//   ロード済み行(GridBodyRowInner)とコンテナの絶対配置・行ヘッダー・セル境界を一致させ、
//   セル内容の代わりに静的なプレースホルダーバー(薄いグレー)を描きます。
//   - 選択の親和性のため pointer ハンドラ(セル/行ヘッダーの down/enter/leave)は配線します
//     (ダブルクリック=編集は stage ① では無効のため配線しません)。
//   - keyframes / CSS 注入は使いません(本コードベースのインラインスタイル方針に整合)。
// ──────────────────────────────────────────────────────────
type GridBodySkeletonRowProps<T> = {
  pane: GridPaneKind;
  ownsRowHeader: boolean;
  leadingWidth: number;
  rowIndex: number;
  top: number;
  rowHeight: number;
  renderEntries: PaneColumnEntry<T>[];
  rowHeaderCellStyle: CSSProperties;
  isRowHovered: boolean;
  onRowHeaderPointerDown: (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onRowHeaderPointerEnter: (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onRowHeaderPointerLeave: (rowIndex: number) => void;
  onCellPointerDown: (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onCellPointerEnter: (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  // 追加(UI CSS移行): 本体スロット(skeleton も同じ .ssg-body-cell / .ssg-body-row を使うため)。
  bodyCellClassName?: string;
  bodyRowClassName?: string;
  rowHeaderCellClassName?: string;
};

// プレースホルダーバーの幅を列ごとに少し変えて機械的な均一さを避けます(列 index 駆動で
//   render をまたいで安定。Math.random は使いません)。
const SKELETON_BAR_WIDTHS = ['62%', '46%', '78%', '54%'] as const;

function GridBodySkeletonRowInner<T>({
  pane,
  ownsRowHeader,
  leadingWidth,
  rowIndex,
  top,
  rowHeight,
  renderEntries,
  rowHeaderCellStyle,
  isRowHovered,
  onRowHeaderPointerDown,
  onRowHeaderPointerEnter,
  onRowHeaderPointerLeave,
  onCellPointerDown,
  onCellPointerEnter,
  bodyCellClassName,
  bodyRowClassName,
  rowHeaderCellClassName,
}: GridBodySkeletonRowProps<T>) {
  return (
    <div
      data-pane={pane}
      data-row-index={rowIndex}
      data-skeleton-row=""
      className={cx('ssg-body-row', bodyRowClassName)}
      style={{
        height: rowHeight,
        transform: `translateY(${top}px)`,
      }}
    >
      {ownsRowHeader && (
        <div
          onPointerDown={(event) => onRowHeaderPointerDown(rowIndex, event)}
          onPointerEnter={(event) => onRowHeaderPointerEnter(rowIndex, event)}
          onPointerLeave={() => onRowHeaderPointerLeave(rowIndex)}
          className={cx(
            'ssg-header-cell',
            'ssg-row-header-cell',
            'ssg-skeleton-rowheader',
            isRowHovered && 'ssg-header-cell--hovered',
            rowHeaderCellClassName,
          )}
          style={{
            ...rowHeaderCellStyle,
            height: rowHeight,
          }}
        >
          {rowIndex + 1}
        </div>
      )}

      {renderEntries.map((entry) => {
        if (!entry) {
          return null;
        }
        const colIndex = entry.logicalIndex;
        const left = leadingWidth + entry.paneLocalStart;
        const size = entry.paneLocalSize;
        const barWidth =
          SKELETON_BAR_WIDTHS[colIndex % SKELETON_BAR_WIDTHS.length];

        return (
          <div
            key={`skeleton-${pane}-${colIndex}`}
            className={cx(
              'ssg-body-cell',
              isRowHovered && 'ssg-body-cell--row-hovered',
              bodyCellClassName,
            )}
            onPointerDown={(event) =>
              onCellPointerDown({ row: rowIndex, col: colIndex }, event)
            }
            onPointerEnter={(event) =>
              onCellPointerEnter({ row: rowIndex, col: colIndex }, event)
            }
            style={{
              left,
              width: size,
              minWidth: size,
              height: rowHeight,
              zIndex: 1,
            }}
          >
            <div
              aria-hidden="true"
              className="ssg-skeleton-bar"
              style={{ width: barWidth }}
            />
          </div>
        );
      })}
    </div>
  );
}

const GridBodySkeletonRow = memo(
  GridBodySkeletonRowInner,
) as typeof GridBodySkeletonRowInner;

type GridBodyLayerProps<T> = {
  // 追加(10-C): 描画対象のペイン種別です。
  pane: GridPaneKind;
  // 追加(10-C): true のときだけ行番号セルを描画します。
  ownsRowHeader: boolean;
  // 追加(10-C): 列の前に確保する先頭幅です(行ヘッダーを持つペインは rowHeaderWidth、他は 0)。
  leadingWidth: number;
  // 変更(DS-3-0): filteredRows: T[] / filteredRowKeys: GridRowKey[] を rowModel シームへ
  //   置換しました。行・行キーは map 内で rowModel.getRow(i) / getRowKey(i) から引きます。
  //   GridBodyRow(memo) へは解決済みの row / rowKey(プリミティブ)を渡すため、11-A の
  //   行ごとプリミティブ props 境界は不変です(rowModel 自体は GridBodyRow へ渡しません)。
  rowModel: RowModel<T>;
  virtualRows: VirtualRowLike[];
  virtualRowIndexes: Set<number>;
  // 変更(10-C): 描画対象の列エントリです(座標はペインローカル)。
  renderEntries: PaneColumnEntry<T>[];
  rowHeight: number;
  // 追加(C1): auto-height 行モード。未指定時 false(供給側 C1-3 まで uniform 経路で不変)。
  autoHeight?: boolean;
  // 追加(①-4): serverSide(SSRM)モードか。true のとき未ロード行をスケルトン描画します。
  //   未指定時 false(clientSide は従来どおり未ロード=OOB を null 返し)。
  isServerSide?: boolean;
  rowHeaderCellStyle: CSSProperties;
  hoveredRowIndex: number | null;
  isWholeGridSelected: boolean;
  // 変更(11-A): uiState の代わりに、行プリミティブの導出に必要な最小の状態だけを
  //             受け取ります。GridBodyLayer 自体は memo していない(親と同時に
  //             再レンダーされる)ため、ここは参照安定でなくても問題ありません。
  activeCell: CellCoord | null;
  editingCell: CellCoord | null;
  selectionSnapshot: SelectionSnapshot;
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  onRowHeaderPointerDown: (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onRowHeaderPointerEnter: (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onRowHeaderPointerLeave: (rowIndex: number) => void;
  onCellPointerDown: (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onCellPointerEnter: (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onCellDoubleClick: (cell: CellCoord) => void;
  renderCellContent: (
    row: T,
    rowIndex: number,
    column: GridColumn<T>,
    colIndex: number,
    cellState: CellRenderState,
  ) => ReactNode;
  // 追加(UI CSS移行): 条件付き行スタイル + 本体スロット。getRowClassName は本層(毎レンダー)で
  //   行ごとに解決し、結果文字列を GridBodyRow へ渡します(memo 安全)。
  getRowClassName?: (row: T, rowIndex: number) => string | undefined;
  bodyCellClassName?: string;
  bodyRowClassName?: string;
  rowHeaderCellClassName?: string;
};

// 変更(A-1): 本体は「仮想行を並べて GridBodyRow(memo) に委譲するだけ」の薄い層になりました。
// 変更(11-A): ここで SelectionSnapshot / activeCell / editingCell を
//             「行ごとのプリミティブ値」へ分解します。分解コストは可視行数ぶんの
//             数値比較のみで毎レンダー実行しても無視できる軽さです。
//             一方で得られる効果は大きく、選択ドラッグ・active cell 移動・編集開始の
//             いずれでも、再レンダーは値が変わった行だけに限定されます。
export function GridBodyLayer<T>({
  pane,
  ownsRowHeader,
  leadingWidth,
  rowModel,
  virtualRows,
  virtualRowIndexes,
  renderEntries,
  rowHeight,
  autoHeight = false,
  isServerSide = false,
  rowHeaderCellStyle,
  hoveredRowIndex,
  isWholeGridSelected,
  activeCell,
  editingCell,
  selectionSnapshot,
  readOnly,
  canEditCell,
  onRowHeaderPointerDown,
  onRowHeaderPointerEnter,
  onRowHeaderPointerLeave,
  onCellPointerDown,
  onCellPointerEnter,
  onCellDoubleClick,
  renderCellContent,
  getRowClassName,
  bodyCellClassName,
  bodyRowClassName,
  rowHeaderCellClassName,
}: GridBodyLayerProps<T>) {
  return (
    <>
      {virtualRows.map((virtualRow) => {
        const rowIndex = virtualRow.index;
        // 変更(①-4): 可視判定を先に評価し、範囲外行は即 null にします(skeleton 描画判定の前段)。
        //   旧版は getRow の後に !row||!visible をまとめて判定していましたが、未ロード行の
        //   skeleton 描画を可視帯に限定するため、可視判定を getRow より前へ移します。
        if (!virtualRowIndexes.has(rowIndex)) {
          return null;
        }

        // 行ごとの解決済み高さ。auto-height では virtualRow.size、uniform では rowHeight。
        //   skeleton 行も同じ解決高を用い、ロード済み行とレイアウトを一致させます。
        const rowSize = virtualRow.size ?? rowHeight;

        // 変更(DS-3-0): filteredRows[rowIndex] / filteredRowKeys[rowIndex] を rowModel 越しへ。
        //   getRow(i) は内部で rows[order[i]] を返すため、旧 filteredRows[i] と参照同一
        //   (= GridBodyRow memo の row props 安定)です。
        //   論点A(呼び出し順): rowKey は row が valid と確定した guard 後に算出します。
        //   getRowKey は内部で resolvedRowKeyGetter(row, sourceIndex) を呼ぶため、カスタム
        //   rowKeyGetter が row を参照する実装だと未ロード/OOB rowIndex で throw し得ます。
        //   そのため「row が valid と確定してから getRowKey を呼ぶ」順を維持します。
        const row = rowModel.getRow(rowIndex);
        // 追加(①-4): serverSide で未ロード(getRow===undefined)の行はスケルトンを描画します。
        //   clientSide の OOB(同じく undefined)は従来どおり null を返します。
        //   未ロード行の getRowKey は viewIndex を返す契約のため、React key は viewIndex 由来で
        //   安定し、ロード完了時に実 row キーへ切り替わって skeleton→実行の差し替えが起きます。
        if (!row) {
          if (!isServerSide) {
            return null;
          }
          const skeletonKey = rowModel.getRowKey(rowIndex) ?? rowIndex;
          return (
            <GridBodySkeletonRow
              key={String(skeletonKey)}
              pane={pane}
              ownsRowHeader={ownsRowHeader}
              leadingWidth={leadingWidth}
              rowIndex={rowIndex}
              top={virtualRow.start}
              rowHeight={rowSize}
              renderEntries={renderEntries}
              rowHeaderCellStyle={rowHeaderCellStyle}
              isRowHovered={hoveredRowIndex === rowIndex}
              onRowHeaderPointerDown={onRowHeaderPointerDown}
              onRowHeaderPointerEnter={onRowHeaderPointerEnter}
              onRowHeaderPointerLeave={onRowHeaderPointerLeave}
              onCellPointerDown={onCellPointerDown}
              onCellPointerEnter={onCellPointerEnter}
              bodyCellClassName={bodyCellClassName}
              bodyRowClassName={bodyRowClassName}
              rowHeaderCellClassName={rowHeaderCellClassName}
            />
          );
        }
        const rowKey = rowModel.getRowKey(rowIndex) ?? rowIndex;

        // 追加(11-A): この行に関係する選択状態だけをプリミティブへ分解します。
        const isRowSelected =
          selectionSnapshot.kind === 'row' &&
          rowIndex >= selectionSnapshot.startRow &&
          rowIndex <= selectionSnapshot.endRow;

        const isInCellSelectionRowRange =
          selectionSnapshot.kind === 'cell' &&
          rowIndex >= selectionSnapshot.startRow &&
          rowIndex <= selectionSnapshot.endRow;

        const selectedColStart =
          selectionSnapshot.kind === 'col'
            ? selectionSnapshot.startCol
            : isInCellSelectionRowRange
              ? selectionSnapshot.startCol
              : -1;
        const selectedColEnd =
          selectionSnapshot.kind === 'col'
            ? selectionSnapshot.endCol
            : isInCellSelectionRowRange
              ? selectionSnapshot.endCol
              : -1;

        const activeColInRow =
          activeCell && activeCell.row === rowIndex ? activeCell.col : -1;
        const editingColInRow =
          editingCell && editingCell.row === rowIndex ? editingCell.col : -1;

        // 追加(UI CSS移行): 行ごとの条件付き className を本層(毎レンダー)で解決し、結果文字列を
        //   memo 済み GridBodyRow へ渡します(関数を直接渡すと参照不安定で memo が壊れるため、
        //   文字列へ解決してから渡すのが肝です)。
        const rowClassName = getRowClassName?.(row, rowIndex);

        return (
          <GridBodyRow
            key={String(rowKey)}
            pane={pane}
            ownsRowHeader={ownsRowHeader}
            leadingWidth={leadingWidth}
            rowIndex={rowIndex}
            rowKey={rowKey}
            row={row}
            top={virtualRow.start}
            renderEntries={renderEntries}
            rowHeight={rowSize}
            autoHeight={autoHeight}
            autoHeightMinHeight={rowHeight}
            rowHeaderCellStyle={rowHeaderCellStyle}
            isRowHovered={hoveredRowIndex === rowIndex}
            isWholeGridSelected={isWholeGridSelected}
            isRowSelected={isRowSelected}
            activeColInRow={activeColInRow}
            editingColInRow={editingColInRow}
            selectedColStart={selectedColStart}
            selectedColEnd={selectedColEnd}
            readOnly={readOnly}
            canEditCell={canEditCell}
            onRowHeaderPointerDown={onRowHeaderPointerDown}
            onRowHeaderPointerEnter={onRowHeaderPointerEnter}
            onRowHeaderPointerLeave={onRowHeaderPointerLeave}
            onCellPointerDown={onCellPointerDown}
            onCellPointerEnter={onCellPointerEnter}
            onCellDoubleClick={onCellDoubleClick}
            renderCellContent={renderCellContent}
            rowClassName={rowClassName}
            bodyCellClassName={bodyCellClassName}
            bodyRowClassName={bodyRowClassName}
            rowHeaderCellClassName={rowHeaderCellClassName}
          />
        );
      })}
    </>
  );
}

export default GridBodyLayer;