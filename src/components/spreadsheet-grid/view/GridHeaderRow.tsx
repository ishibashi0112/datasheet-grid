// 変更(11-B5): GridHeaderRow を React.memo 化するため memo を追加 import します。
// 変更(13-A): ヘッダー右クリック(contextmenu)用に MouseEvent 型を追加 import します。
import {
  memo,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from 'react';
// 変更(11-A): uiState 丸ごと依存を撤廃し、正規化済み SelectionSnapshot を受け取ります。
// 変更理由: GridBodyRow と同じく、uiState のあらゆる更新で props が変わるのを防ぎ、
//           将来ヘッダー行を memo 化する際の布石にもなります。
import type { SelectionSnapshot } from '../model/gridSelectors';
import type {
  GridColumn,
  GridSortState,
} from '../model/gridTypes';
// 変更(10-C): 列座標を ColumnMeasurement(グローバル) から
//             PaneColumnEntry(ペインローカル) へ切り替えます。
import type { PaneColumnEntry } from '../logic/geometry';
// 追加(12-A): set フィルター対応のフィルター有効判定を共有します。
import { isActiveColumnFilterValue } from '../logic/filtering';
import { toExcelColumnName } from '../utils/excelColumnName';

// 追加(10-C): このヘッダーがどのペインを描画しているかの種別です。
export type GridPaneKind = 'left' | 'center' | 'right';

type GridHeaderRowProps<T> = {
  // 追加(10-C): 描画対象のペイン種別です。
  pane: GridPaneKind;
  // 追加(10-C): true のときだけ左上コーナーセル(#)を描画します。
  //             行ヘッダーを持つペイン(左固定があれば左、無ければ中央)だけが true です。
  ownsRowHeader: boolean;
  // 追加(10-C): 列の前に確保する先頭幅です。
  //             行ヘッダーを持つペインでは rowHeaderWidth、それ以外は 0 です。
  //             各列は leadingWidth + entry.paneLocalStart に配置されます。
  leadingWidth: number;
  rowHeaderWidth: number;
  headerHeight: number;
  rowHeaderCellStyle: CSSProperties;
  headerCellBaseStyle: CSSProperties;
  isCornerHovered: boolean;
  isWholeGridSelected: boolean;
  filteredRowsLength: number;
  visibleColumnsLength: number;
  // 変更(10-C): 描画対象の列エントリです。
  //             中央ペインは仮想化済みの部分集合、固定ペインは全エントリが渡されます。
  //             座標はすべてペインローカル(entry.paneLocalStart 起点)です。
  renderEntries: PaneColumnEntry<T>[];
  // 注記(10-C): hoveredColumnIndex / 各種 colIndex は entry.logicalIndex 空間です。
  hoveredColumnIndex: number | null;
  // 変更(11-A): 列選択判定用の正規化済みスナップショットです(uiState の置き換え)。
  selectionSnapshot: SelectionSnapshot;
  columnFilterValues: Record<string, unknown>;
  sortState: GridSortState;
  getHeaderActionButtonStyle: (isActive: boolean) => CSSProperties;
  getSortIndicator: (columnKey: string) => string;
  onCornerPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onCornerPointerEnter: () => void;
  onCornerPointerLeave: () => void;
  onColumnHeaderPointerDown: (
    colIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onColumnHeaderPointerEnter: (
    colIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onColumnHeaderPointerLeave: (colIndex: number) => void;
  onColumnSortButtonPointerDown: (
    columnKey: string,
    event: PointerEvent<HTMLButtonElement>,
  ) => void;
  onColumnFilterButtonPointerDown: (
    column: GridColumn<T>,
    event: PointerEvent<HTMLButtonElement>,
  ) => void;
  onColumnResizePointerDown: (
    column: GridColumn<T>,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  // 追加(13-A): 列メニュー(「⋮」ボタン + ヘッダー右クリック)関連の props です。
  //             enableColumnMenu=false のときはボタンを描画せず、右クリックも
  //             ブラウザ標準メニューのままにします(controller 側でガード済み)。
  enableColumnMenu: boolean;
  // 追加(13-A): メニューを開いている列の key です(「⋮」ボタンの active 表示と、
  //             hover が外れてもボタンを出し続ける判定に使います)。
  // 注記: open/close の 1 回ずつだけ値が変わる string | null のため、
  //       memo(GridHeaderRow) への影響は開閉時の 3 ペイン各 1 レンダーのみです。
  openedMenuColumnKey: string | null;
  onColumnMenuButtonPointerDown: (
    column: GridColumn<T>,
    event: PointerEvent<HTMLButtonElement>,
  ) => void;
  onColumnHeaderContextMenu: (
    column: GridColumn<T>,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
  // 追加(13-B3-2): バッジ(Excel 列名)を grip にした列 D&D 並べ替えの pointerdown です。
  //   latest-ref 安定のため参照は不変。未指定(reorder 不可)時はバッジを通常表示にします
  //   (ハンドラ内で stopPropagation し、ヘッダー本体の列範囲選択とは衝突させません)。
  onColumnDragHandlePointerDown?: (
    column: GridColumn<T>,
    event: PointerEvent<HTMLSpanElement>,
  ) => void;
};

// 変更(10-C): sticky header 行を「1ペイン分」描画する汎用コンポーネントにしました。
//             ownsRowHeader が true のペインのみ左上コーナーセルを描画します。
// 変更(11-B5): React.memo 化のため実装本体を Inner に分離します(export は末尾参照)。
// 変更理由: ライブリサイズ中、幅が変わっていない固定ペインのヘッダーまで親再レンダーに
//           引きずられて再描画されていました。11-B4 で renderEntries はペイン単位で
//           安定済み、11-B5 で onColumnResizePointerDown も latest-ref 化により恒久安定と
//           なったため、shallow 比較で props 全一致が成立し memo が機能します。
//           なお中央ペインは virtualColumns 依存で renderEntries が横スクロール/リサイズの
//           たびに変わるため再レンダーされますが、これは表示更新に必要な仕様どおりの挙動です。
function GridHeaderRowInner<T>({
  pane,
  ownsRowHeader,
  leadingWidth,
  rowHeaderWidth,
  headerHeight,
  rowHeaderCellStyle,
  headerCellBaseStyle,
  isCornerHovered,
  isWholeGridSelected,
  filteredRowsLength,
  visibleColumnsLength,
  renderEntries,
  hoveredColumnIndex,
  selectionSnapshot,
  columnFilterValues,
  sortState,
  getHeaderActionButtonStyle,
  getSortIndicator,
  onCornerPointerDown,
  onCornerPointerEnter,
  onCornerPointerLeave,
  onColumnHeaderPointerDown,
  onColumnHeaderPointerEnter,
  onColumnHeaderPointerLeave,
  onColumnSortButtonPointerDown,
  onColumnFilterButtonPointerDown,
  onColumnResizePointerDown,
  // 追加(13-A): 列メニュー関連 props です。
  enableColumnMenu,
  openedMenuColumnKey,
  onColumnMenuButtonPointerDown,
  onColumnHeaderContextMenu,
  // 追加(13-B3-2): バッジ grip の pointerdown(列 D&D)。
  onColumnDragHandlePointerDown,
}: GridHeaderRowProps<T>) {
  return (
    <div
      data-pane={pane}
      style={{
        height: headerHeight,
        position: 'sticky',
        top: 0,
        zIndex: 6,
        backgroundColor: '#f8fafc',
      }}
    >
      {ownsRowHeader && (
        <div
          onPointerDown={onCornerPointerDown}
          onPointerEnter={onCornerPointerEnter}
          onPointerLeave={onCornerPointerLeave}
          style={{
            ...rowHeaderCellStyle,
            // 左上コーナーセル専用に見た目を明示して、
            // 高さ・中央寄せ・境界線のズレを抑えます。
            position: 'absolute',
            top: 0,
            left: 0,
            width: rowHeaderWidth,
            minWidth: rowHeaderWidth,
            height: headerHeight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            padding: 0,
            lineHeight: 1,
            zIndex: 7,
            backgroundColor: isWholeGridSelected
              ? isCornerHovered
                ? '#bfdbfe'
                : '#dbeafe'
              : isCornerHovered
                ? '#e2e8f0'
                : '#f8fafc',
            borderRight: '1px solid #e5e7eb',
            borderBottom: '1px solid #d7dce3',
            cursor:
              filteredRowsLength > 0 && visibleColumnsLength > 0
                ? 'pointer'
                : 'default',
          }}
        >
          #
        </div>
      )}

      {renderEntries.map((entry) => {
        // 変更(10-C): 仮想化のガードは SpreadsheetGrid 側で済ませているため、
        //             ここでは渡されたエントリをそのまま描画します。
        if (!entry) {
          return null;
        }

        const colIndex = entry.logicalIndex;
        const column = entry.column;
        const left = leadingWidth + entry.paneLocalStart;
        const size = entry.paneLocalSize;

        // 変更(12-A): set フィルター値(オブジェクト)も正しく「フィルター済み」と
        //             判定できるよう、共通 helper へ置き換えます。
        const isColumnFiltered = isActiveColumnFilterValue(
          columnFilterValues[column.key],
        );
        // 変更(11-A): selectIsColumnSelected(uiState, ...) と等価の判定を
        //             SelectionSnapshot のプリミティブ比較で行います。
        const isColumnSelected =
          selectionSnapshot.kind === 'col' &&
          colIndex >= selectionSnapshot.startCol &&
          colIndex <= selectionSnapshot.endCol;

        // 追加(13-A): この列のメニューを開いているかです(「⋮」の active 表示に使います)。
        // 変更(13-A2): 「⋮」ボタンを hover 時表示 → 常時表示へ変更します。
        // 変更理由: 旧実装は hoveredColumnIndex === colIndex を表示条件にしていましたが、
        //           ヘッダーに配線している onColumnHeaderPointerEnter は
        //           useGridPointerInteractions のドラッグ選択更新ハンドラであり、
        //           hoveredColumnIndex を set する経路がどこにも無いため、
        //           ボタンは「メニューが開いている列」でしか表示されませんでした
        //           (= 右クリックでメニューを開いたときだけ「⋮」が出現する症状)。
        //           hover 表示を復活させる案もありますが、hover のたびに memo 化済み
        //           ヘッダー 3 ペインが再レンダーされるため、常時表示(AG Grid の
        //           suppressMenuHide 相当)を採用します。anchor ボタンが常に DOM に
        //           存在するため、開いている列の表示継続ガードも不要になります。
        const isMenuOpenForColumn = openedMenuColumnKey === column.key;
        const showColumnMenuButton = enableColumnMenu;

        return (
          <div
            key={column.key}
            onPointerDown={(event) => onColumnHeaderPointerDown(colIndex, event)}
            onPointerEnter={(event) =>
              onColumnHeaderPointerEnter(colIndex, event)
            }
            onPointerLeave={() => onColumnHeaderPointerLeave(colIndex)}
            // 追加(13-A): ヘッダー右クリックで列メニューを開きます
            //             (enableColumnMenu=false 時は controller 側で何もせず、
            //              ブラウザ標準メニューが出ます)。
            onContextMenu={(event) => onColumnHeaderContextMenu(column, event)}
            style={{
              position: 'absolute',
              top: 0,
              left,
              ...headerCellBaseStyle,
              width: size,
              minWidth: size,
              height: headerHeight,
              backgroundColor: isWholeGridSelected
                ? hoveredColumnIndex === colIndex
                  ? '#bfdbfe'
                  : '#dbeafe'
                : isColumnSelected
                  ? hoveredColumnIndex === colIndex
                    ? '#bfdbfe'
                    : '#dbeafe'
                  : hoveredColumnIndex === colIndex
                    ? '#e2e8f0'
                    : '#f8fafc',
            }}
          >
            {/* 変更(13-B3-2): Excel 列名バッジを掴み手(grip)に再利用します。
                onPointerDown 内で stopPropagation するため、ヘッダー本体の列範囲選択
                (onColumnHeaderPointerDown)とは衝突しません。reorder 不可時は通常表示。 */}
            <span
              onPointerDown={
                onColumnDragHandlePointerDown
                  ? (event) => onColumnDragHandlePointerDown(column, event)
                  : undefined
              }
              title={
                onColumnDragHandlePointerDown ? 'ドラッグで列を移動' : undefined
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 22,
                height: 22,
                borderRadius: 9999,
                backgroundColor: isColumnFiltered ? '#bfdbfe' : '#e2e8f0',
                color: isColumnFiltered ? '#1d4ed8' : '#475569',
                fontSize: 11,
                fontWeight: 700,
                // 追加(13-B3-2): grip の視覚 + タッチでのスクロール抑止 + 文字選択抑止。
                cursor: onColumnDragHandlePointerDown ? 'grab' : 'default',
                touchAction: onColumnDragHandlePointerDown ? 'none' : undefined,
                userSelect: 'none',
              }}
            >
              {toExcelColumnName(colIndex)}
            </span>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                minWidth: 0,
                flex: 1,
                gap: 6,
              }}
            >
              <div
                style={{
                  minWidth: 0,
                  flex: 1,
                  color: isColumnFiltered ? '#1d4ed8' : '#334155',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {column.renderHeader
                  ? column.renderHeader({
                      colIndex,
                      width: size,
                      column,
                      filterValue: columnFilterValues[column.key],
                      isFiltered: isColumnFiltered,
                    })
                  : column.title || column.key}
              </div>

              <button
                type="button"
                onPointerDown={(event) =>
                  onColumnSortButtonPointerDown(column.key, event)
                }
                title="並び替え"
                style={getHeaderActionButtonStyle(
                  sortState.columnKey === column.key &&
                    sortState.direction !== null,
                )}
              >
                {getSortIndicator(column.key)}
              </button>

              <button
                type="button"
                onPointerDown={(event) =>
                  onColumnFilterButtonPointerDown(column, event)
                }
                title="列フィルター"
                style={getHeaderActionButtonStyle(isColumnFiltered)}
              >
                {isColumnFiltered ? '●' : '○'}
              </button>

              {/* 変更(13-A2): 列メニュー(「⋮」)ボタンです。常時表示します
                  (AG Grid の suppressMenuHide: true 相当。右クリックでも
                   同じメニューが開きます)。 */}
              {showColumnMenuButton && (
                <button
                  type="button"
                  onPointerDown={(event) =>
                    onColumnMenuButtonPointerDown(column, event)
                  }
                  title="列メニュー"
                  style={getHeaderActionButtonStyle(isMenuOpenForColumn)}
                >
                  ⋮
                </button>
              )}
            </div>

            <div
              onPointerDown={(event) => onColumnResizePointerDown(column, event)}
              style={{
                position: 'absolute',
                top: 0,
                right: -3,
                width: 6,
                height: '100%',
                cursor: 'col-resize',
                zIndex: 3,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// 追加(11-B5): memo ラップ本体です。
// 注記: ジェネリックコンポーネントを memo すると型引数 <T> が失われるため、
//       `as typeof GridHeaderRowInner` でジェネリックシグネチャを復元します。
//       比較関数は渡さず既定の shallow 比較を使います(全 props がプリミティブ or
//       親側で useMemo / useCallback / latest-ref により参照安定化済みのため)。
export const GridHeaderRow = memo(
  GridHeaderRowInner,
) as typeof GridHeaderRowInner;

export default GridHeaderRow;