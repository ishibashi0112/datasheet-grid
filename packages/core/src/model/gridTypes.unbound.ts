// 追加(非依存化 ⑤-1): フレームワーク「未束縛」の型束縛です。React 非依存の層(logic / controllers / engine /
//   model / utils)はこのファイルから型を import します(React 束縛の gridTypes.ts は React シェル / view / hooks
//   専用)。
//   - 公開型の本体(gridTypes.core.ts)は描画ノード / style をフレームワーク束ね型 F で抽象化しており、既定の F
//     (GridFrameworkTypes = { node: unknown; style: object })は「何も分からない」束縛です。ところが F は
//     F['node'] が反変位置(render 系コールバックの ctx 引数)にも現れるため、React 束縛の列型と既定 F の列型は
//     どちらの向きにも代入できず、列を受け取って返す関数すべてに F を配線する必要が生じます。
//   - 内部層は描画ノード / style の中身を一切見ない(そのまま通すだけ)ため、node / style を any にした
//     UnboundGridTypes で束縛し、React 束縛 / 将来の Solid 束縛の値をそのまま出し入れできるようにします。
//     any はこの束ね型の 2 フィールドに閉じ込め、公開 API(React 束縛 / core の既定 F)には漏らしません。
//   将来 monorepo 分割(⑤-2)で core パッケージの内部型としてそのまま持ち込みます。
import type * as Core from './gridTypes.core';

// F に依存しない型はそのまま再エクスポートします(下の同名ローカル宣言が優先されます)。
export type * from './gridTypes.core';

// 未束縛の束ね型(内部層専用)。any の理由は冒頭コメント参照。
export type UnboundGridTypes = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 描画ノードは内部層では不透明値として通すだけ(冒頭コメント参照)
  node: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- style も同上(React: CSSProperties / Solid: JSX.CSSProperties を素通し)
  style: any;
};

export type CellRenderContext<T> = Core.CellRenderContext<T, UnboundGridTypes>;
export type DetailRowOptions<T> = Core.DetailRowOptions<T, UnboundGridTypes>;
export type CellStyleContext<T> = Core.CellStyleContext<T, UnboundGridTypes>;
export type HeaderRenderContext<T> = Core.HeaderRenderContext<T, UnboundGridTypes>;
export type CellValueFormatterParams<T> = Core.CellValueFormatterParams<T, UnboundGridTypes>;
export type CellValueFormatter<T> = Core.CellValueFormatter<T, UnboundGridTypes>;
export type GridColumnEditor<T> = Core.GridColumnEditor<T, UnboundGridTypes>;
export type CellEditorContext<T> = Core.CellEditorContext<T, UnboundGridTypes>;
export type CellValidationContext<T> = Core.CellValidationContext<T, UnboundGridTypes>;
export type GridAggFuncParams<T> = Core.GridAggFuncParams<T, UnboundGridTypes>;
export type GridAggFunc<T> = Core.GridAggFunc<T, UnboundGridTypes>;
export type GridColumn<T> = Core.GridColumn<T, UnboundGridTypes>;
export type SpreadsheetGridSlotContext<T> = Core.SpreadsheetGridSlotContext<T, UnboundGridTypes>;
export type GridContextMenuTarget<T> = Core.GridContextMenuTarget<T, UnboundGridTypes>;
export type GridContextMenuParams<T> = Core.GridContextMenuParams<T, UnboundGridTypes>;
export type ScrollHintOptions<T = unknown> = Core.ScrollHintOptions<T, UnboundGridTypes>;
export type GridContextMenuActionItem = Core.GridContextMenuActionItem<UnboundGridTypes>;
export type GridContextMenuLabelItem = Core.GridContextMenuLabelItem<UnboundGridTypes>;
export type GridContextMenuCustomItem = Core.GridContextMenuCustomItem<UnboundGridTypes>;
export type GridContextMenuItem = Core.GridContextMenuItem<UnboundGridTypes>;
export type GridSlotProps = Core.GridSlotProps<UnboundGridTypes>;
export type GridResolvedSlot = Core.GridResolvedSlot<UnboundGridTypes>;
export type GridResolvedSlots = Core.GridResolvedSlots<UnboundGridTypes>;
export type GridClassNames = Core.GridClassNames<UnboundGridTypes>;
export type SpreadsheetGridProps<T> = Core.SpreadsheetGridProps<T, UnboundGridTypes>;