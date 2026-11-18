// Solid 版の型の束ね(試作)。core の公開型は描画の型(node / style)を束ね型 F で受けるので、Solid の JSX.Element と
//   JSX.CSSProperties を入れるだけで同じ列定義・props の型が使えます(React 版の model/gridTypes.ts と同じ作り)。
import type { JSX } from '@solidjs/web';
import type * as Core from '@ishibashi0112/spreadsheet-grid-core';

export type SolidGridTypes = {
  node: JSX.Element;
  style: JSX.CSSProperties;
};

export type GridColumn<T> = Core.GridColumn<T, SolidGridTypes>;
export type CellRenderContext<T> = Core.CellRenderContext<T, SolidGridTypes>;
export type SpreadsheetGridHandle<T> = Core.SpreadsheetGridHandle<T>;

// 試作で受ける props(React 版と同じ名前・同じ型)。全部で 114 ある props のうち、表示・スクロール・選択・text の編集・
//   キー操作・コピー貼り付け・元に戻すに要るものだけです。
type SupportedPropKeys =
  | 'rows'
  | 'columns'
  | 'onRowsChange'
  | 'rowKeyGetter'
  | 'rowHeight'
  | 'headerHeight'
  | 'density'
  | 'rowHeaderWidth'
  | 'height'
  | 'maxHeight'
  | 'readOnly'
  | 'canEditCell'
  | 'enableUndoRedo'
  | 'undoHistoryLimit'
  | 'enableClearOnDelete'
  | 'editorEnterMove'
  | 'enableRangeSelection'
  | 'enableRowHover'
  | 'enableColumnHeaderHover'
  | 'enableSorting'
  | 'ariaLabel'
  | 'className'
  | 'style'
  | 'theme'
  | 'onActiveCellChange';

export type SpreadsheetGridProps<T> = Pick<Core.SpreadsheetGridProps<T, SolidGridTypes>, SupportedPropKeys> & {
  // Solid の ref は関数だけ(React の ref オブジェクトは無い)。命令的 API のハンドルを受け取ります。
  ref?: ((handle: SpreadsheetGridHandle<T>) => void) | undefined;
};