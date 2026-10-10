// 変更(非依存化 ①): 型定義の本体は gridTypes.core.ts(React 非依存)へ移し、本ファイルは React 束縛
//   (変更 ⑤-2: 本体は core パッケージ @ishibashi0112/spreadsheet-grid-core にあり、本ファイルは React 版パッケージ側)
//   (node = ReactNode / style = CSSProperties / ref prop)を与える薄い層になりました。既存の import
//   パス・公開型名・型引数の数は不変です(GridColumn<T> 等の 25 型は F を ReactGridTypes で固定した
//   エイリアス、それ以外は core からの再エクスポート)。将来の Solid 版は同じ core に別の束ね型を
//   渡した束縛ファイルを持ちます。
import type { CSSProperties, ReactNode, Ref } from 'react';
import type * as Core from '@ishibashi0112/spreadsheet-grid-core/model/gridTypes.core';

// F に依存しない型はそのまま再エクスポートします(下の同名ローカル宣言が優先されます)。
export type * from '@ishibashi0112/spreadsheet-grid-core/model/gridTypes.core';

// React の束ね型です(GridFrameworkTypes の React 版)。
export type ReactGridTypes = { node: ReactNode; style: CSSProperties };

export type CellRenderContext<T> = Core.CellRenderContext<T, ReactGridTypes>;
/** 展開行(Master/Detail)の設定(`detailRow` prop)。各フィールドの説明は JSDoc と同梱の `API_REFERENCE.md`。 */
export type DetailRowOptions<T> = Core.DetailRowOptions<T, ReactGridTypes>;
/** ラベル行(見出し / 区切り行)の設定(`labelRow` prop)。各フィールドの説明は JSDoc と同梱の `API_REFERENCE.md`。 */
export type LabelRowOptions<T> = Core.LabelRowOptions<T, ReactGridTypes>;
export type CellStyleContext<T> = Core.CellStyleContext<T, ReactGridTypes>;
/** 条件付き書式(`GridColumn.conditionalFormat`)。`dataBar` / `colorScale` / `chips`。 */
export type GridConditionalFormat<T> = Core.GridConditionalFormat<T, ReactGridTypes>;
export type HeaderRenderContext<T> = Core.HeaderRenderContext<T, ReactGridTypes>;
export type CellValueFormatterParams<T> = Core.CellValueFormatterParams<T, ReactGridTypes>;
export type CellValueFormatter<T> = Core.CellValueFormatter<T, ReactGridTypes>;
export type GridColumnEditor<T> = Core.GridColumnEditor<T, ReactGridTypes>;
export type CellEditorContext<T> = Core.CellEditorContext<T, ReactGridTypes>;
export type CellValidationContext<T> = Core.CellValidationContext<T, ReactGridTypes>;
export type GridAggFuncParams<T> = Core.GridAggFuncParams<T, ReactGridTypes>;
export type GridAggFunc<T> = Core.GridAggFunc<T, ReactGridTypes>;
/** 列定義(`columns` prop の要素)。各フィールドの説明は JSDoc と同梱の `API_REFERENCE.md`の「GridColumn props」表。 */
export type GridColumn<T> = Core.GridColumn<T, ReactGridTypes>;
export type GetFilterOptionsParams<T> = Core.GetFilterOptionsParams<T, ReactGridTypes>;
export type SpreadsheetGridSlotContext<T> = Core.SpreadsheetGridSlotContext<T, ReactGridTypes>;
export type GridContextMenuTarget<T> = Core.GridContextMenuTarget<T, ReactGridTypes>;
/** `getContextMenuItems` / `onContextMenuOpen` へ渡る右クリックの文脈。 */
export type GridContextMenuParams<T> = Core.GridContextMenuParams<T, ReactGridTypes>;
// 追加(G-1): セル操作の通知(onCellClick / onCellDoubleClick / onActiveCellChange)の引数型です。
/** セル操作の通知(`onCellClick` / `onCellDoubleClick` / `onActiveCellChange`)が指すデータセル。 */
export type GridCellRef<T> = Core.GridCellRef<T, ReactGridTypes>;
/** `onCellClick` の引数(`GridCellRef` + DOM 標準の `MouseEvent`)。 */
export type GridCellEventParams<T> = Core.GridCellEventParams<T, ReactGridTypes>;
/** `onCellDoubleClick` の引数(`GridCellEventParams` + 既定の動作を止める `preventDefault()`)。 */
export type GridCellDoubleClickParams<T> = Core.GridCellDoubleClickParams<T, ReactGridTypes>;
/** スクロール位置インジケーターの設定(`scrollHint` prop)。各フィールドの説明は JSDoc と同梱の `API_REFERENCE.md`。 */
export type ScrollHintOptions<T = unknown> = Core.ScrollHintOptions<T, ReactGridTypes>;
export type GridContextMenuActionItem = Core.GridContextMenuActionItem<ReactGridTypes>;
export type GridContextMenuLabelItem = Core.GridContextMenuLabelItem<ReactGridTypes>;
export type GridContextMenuCustomItem = Core.GridContextMenuCustomItem<ReactGridTypes>;
export type GridContextMenuItem = Core.GridContextMenuItem<ReactGridTypes>;
export type GridSlotProps = Core.GridSlotProps<ReactGridTypes>;
export type GridResolvedSlot = Core.GridResolvedSlot<ReactGridTypes>;
export type GridResolvedSlots = Core.GridResolvedSlots<ReactGridTypes>;
/** パーツ別スロット(`classNames` prop)。各値は class 文字列か `{ className, style }`。 */
export type GridClassNames = Core.GridClassNames<ReactGridTypes>;
// props だけは React 固有の ref prop(ref-as-prop。命令的ハンドル SpreadsheetGridHandle)を足します。
/**
 * `SpreadsheetGrid` の props。各フィールドの説明は JSDoc と同梱の `API_REFERENCE.md`の「SpreadsheetGrid props」表。
 */
export type SpreadsheetGridProps<T> = Core.SpreadsheetGridProps<T, ReactGridTypes> & {
  // 追加(imperative API #1): React 19 の ref-as-prop。forwardRef は使いません。
  /**
   * 命令的 API(`SpreadsheetGridHandle`)を受け取る ref(React 19 の ref-as-prop。`forwardRef` は不要)。
   * 例: `const gridRef = useRef<SpreadsheetGridHandle<Row>>(null)` → `<SpreadsheetGrid ref={gridRef} … />`。
   */
  ref?: Ref<Core.SpreadsheetGridHandle<T>>;
};