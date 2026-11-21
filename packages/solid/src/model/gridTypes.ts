// Solid 版の型の束ね。core の公開型は描画の型(node / style)を束ね型 F で受けるので、Solid の JSX.Element と
//   JSX.CSSProperties を入れるだけで同じ列定義・props の型が使えます(React 版の model/gridTypes.ts と同じ作り)。
import type { JSX } from '@solidjs/web';
import type * as Core from '@ishibashi0112/spreadsheet-grid-core';

export type SolidGridTypes = {
  node: JSX.Element;
  style: JSX.CSSProperties;
};

// 変更(段階 3-3 公開の形): React 版の model/gridTypes.ts と同じ並びで、F つきの型を Solid の束ね型で固定します。F に依存しない
//   型は core からそのまま再エクスポートします(下の同名ローカル宣言が優先されます)。F つきの型は core の入口(semver の対象)
//   から読みます(利用側が推論のまま export したとき、d.ts が core の内部のパスを指さないように。React 版と同じ)。
export type * from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridTypes.core';

export type CellRenderContext<T> = Core.CellRenderContext<T, SolidGridTypes>;
/** 展開行(Master/Detail)の設定(`detailRow` prop)。各フィールドの説明は React 版に同梱の `API_REFERENCE.md`。 */
export type DetailRowOptions<T> = Core.DetailRowOptions<T, SolidGridTypes>;
/** ラベル行(見出し / 区切り行)の設定(`labelRow` prop)。 */
export type LabelRowOptions<T, L extends T = T> = Core.LabelRowOptions<T, SolidGridTypes, L>;
/** 合計行の設定(`totalRow` prop)。 */
export type TotalRowOptions<T> = Core.TotalRowOptions<T, SolidGridTypes>;
/** `totalRow.renderCell` へ渡る合計行のセルの文脈。 */
export type TotalRowCellContext<T> = Core.TotalRowCellContext<T, SolidGridTypes>;
/** フィルハンドルの設定(`fillHandle` prop)。 */
export type FillHandleOptions<T> = Core.FillHandleOptions<T, SolidGridTypes>;
/** `fillHandle.getFillValue` へ渡る、埋めるセル 1 つぶんのパラメータ。 */
export type GridFillValueParams<T> = Core.GridFillValueParams<T, SolidGridTypes>;
export type CellStyleContext<T> = Core.CellStyleContext<T, SolidGridTypes>;
/** 条件付き書式(`GridColumn.conditionalFormat`)。`dataBar` / `colorScale` / `chips`。 */
export type GridConditionalFormat<T> = Core.GridConditionalFormat<T, SolidGridTypes>;
export type HeaderRenderContext<T> = Core.HeaderRenderContext<T, SolidGridTypes>;
export type CellValueFormatterParams<T> = Core.CellValueFormatterParams<T, SolidGridTypes>;
export type CellValueFormatter<T> = Core.CellValueFormatter<T, SolidGridTypes>;
export type GridColumnEditor<T> = Core.GridColumnEditor<T, SolidGridTypes>;
export type CellEditorContext<T> = Core.CellEditorContext<T, SolidGridTypes>;
export type CellValidationContext<T> = Core.CellValidationContext<T, SolidGridTypes>;
export type GridAggFuncParams<T> = Core.GridAggFuncParams<T, SolidGridTypes>;
export type GridAggFunc<T> = Core.GridAggFunc<T, SolidGridTypes>;
/** 列定義(`columns` prop の要素)。React 版と同じ列定義(描画の型だけが Solid の `JSX.Element` / `JSX.CSSProperties`)。 */
export type GridColumn<T> = Core.GridColumn<T, SolidGridTypes>;
export type GetFilterOptionsParams<T> = Core.GetFilterOptionsParams<T, SolidGridTypes>;
export type SpreadsheetGridSlotContext<T> = Core.SpreadsheetGridSlotContext<T, SolidGridTypes>;
export type GridContextMenuTarget<T> = Core.GridContextMenuTarget<T, SolidGridTypes>;
/** `getContextMenuItems` / `onContextMenuOpen` へ渡る右クリックの文脈。 */
export type GridContextMenuParams<T> = Core.GridContextMenuParams<T, SolidGridTypes>;
/** セル操作の通知(`onCellClick` / `onCellDoubleClick` / `onActiveCellChange`)が指すデータセル。 */
export type GridCellRef<T> = Core.GridCellRef<T, SolidGridTypes>;
/** `onCellClick` の引数(`GridCellRef` + DOM 標準の `MouseEvent`)。 */
export type GridCellEventParams<T> = Core.GridCellEventParams<T, SolidGridTypes>;
/** `onCellDoubleClick` の引数(`GridCellEventParams` + 既定の動作を止める `preventDefault()`)。 */
export type GridCellDoubleClickParams<T> = Core.GridCellDoubleClickParams<T, SolidGridTypes>;
/** スクロール位置インジケーターの設定(`scrollHint` prop)。 */
export type ScrollHintOptions<T = unknown> = Core.ScrollHintOptions<T, SolidGridTypes>;
export type GridContextMenuActionItem = Core.GridContextMenuActionItem<SolidGridTypes>;
export type GridContextMenuLabelItem = Core.GridContextMenuLabelItem<SolidGridTypes>;
export type GridContextMenuCustomItem = Core.GridContextMenuCustomItem<SolidGridTypes>;
export type GridContextMenuItem = Core.GridContextMenuItem<SolidGridTypes>;
export type GridSlotProps = Core.GridSlotProps<SolidGridTypes>;
export type GridResolvedSlot = Core.GridResolvedSlot<SolidGridTypes>;
export type GridResolvedSlots = Core.GridResolvedSlots<SolidGridTypes>;
/** パーツ別スロット(`classNames` prop)。各値は class 文字列か `{ className, style }`。 */
export type GridClassNames = Core.GridClassNames<SolidGridTypes>;
// ハンドルは F に依存しません(core の再エクスポートのまま)。

// props(React 版と同じ名前・同じ型)。段階 2 までに React 版の props をすべて受けるようになったので、core の props をそのまま
//   使い、ref だけを Solid の形にします。L は labelRow のラベル行の型です(isLabelRow の型ガードから推論。既定は T。React 版と同じ)。
/**
 * `SpreadsheetGrid` の props。React 版と同じ props です(各フィールドの説明は JSDoc と React 版に同梱の `API_REFERENCE.md`)。
 */
export type SpreadsheetGridProps<T, L extends T = T> = Core.SpreadsheetGridProps<T, SolidGridTypes, L> & {
  // Solid の ref は関数だけ(React の ref オブジェクトは無い)。命令的 API のハンドルを受け取ります。
  /**
   * 命令的 API(`SpreadsheetGridHandle`)を受け取る ref。Solid の ref と同じく関数で受けます。
   * 例: `let grid: SpreadsheetGridHandle<Row> | undefined` → `<SpreadsheetGrid ref={(h) => (grid = h)} … />`。
   */
  ref?: ((handle: Core.SpreadsheetGridHandle<T>) => void) | undefined;
};