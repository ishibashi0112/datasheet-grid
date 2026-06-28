// SpreadsheetGrid の公開エントリ(バレル)です。
// ライブラリ利用者はこの index 経由で import します。reducer / hooks / view / logic /
// selectors などの内部実装は公開しません。公開する型は API_REFERENCE.md と対応します。

// 公開コンポーネント(named のみ。default export は廃止しました)。
export { SpreadsheetGrid } from './SpreadsheetGrid';
// 値フォーマッタ(UI 表示のみ)の組み込みファクタ。利用側も CellValueFormatter で自作可。
export { numberFormatter } from './logic/valueFormatters';

// 公開型です。
export type {
  // コンポーネント props。
  SpreadsheetGridProps,
  // 列定義と固定方向。
  GridColumn,
  GridColumnPinned,
  // 行キー。
  GridRowKey,
  // select / set フィルターの候補。
  GridSelectFilterOption,
  // セル / ヘッダーのカスタム描画コンテキスト(renderCell / renderHeader 引数)。
  CellRenderContext,
  HeaderRenderContext,
  // セル表示値の整形(UI 表示のみ)の契約。
  CellValueFormatter,
  CellValueFormatterParams,
  // top / bottom バーのスロットコンテキストと、そこに載る派生 summary。
  SpreadsheetGridSlotContext,
  SpreadsheetGridDerivedSummary,
  SpreadsheetGridSelectionStats,
  // スロットコンテキストが公開する選択 / ソート / 列フィルター値の型族です。
  CellCoord,
  CellRange,
  GridSelection,
  GridSortState,
  GridSortEntry,
  GridSortDirection,
  ColumnFilterValue,
  // フィルター状態(globalText + 列フィルター記述子)。getState/applyState の GridState から参照されます。
  GridFilterState,
  SetColumnFilterValue,
  NumberColumnFilterValue,
  ParsedNumberFilter,
  TextColumnFilterValue,
  DateColumnFilterValue,
  SelectColumnFilterValue,
  CustomColumnFilterValue,
  // serverSide(SSRM)用の公開型族です。dataSource 指定時に serverSide モードへ切替わります。
  ServerSideDataSource,
  ServerSideQuery,
  ServerSideGetRowsParams,
  ServerSideGetRowsResult,
  // 行モデル境界型(clientSide / serverSide 共通の行取得 seam)です。
  RowModel,
  // 追加(imperative API #1): ref ハンドル(SpreadsheetGridProps.ref)と関連型です。
  SpreadsheetGridHandle,
  ScrollAlign,
  CsvExportScope,
  CsvExportOptions,
  // 追加(state #1): 列状態のシリアライズ型(getState / applyState の入出力)。
  GridState,
} from './model/gridTypes';
export type { NumberFormatterOptions } from './logic/valueFormatters';