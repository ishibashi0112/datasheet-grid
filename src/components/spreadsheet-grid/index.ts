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
  // 追加(F-async): グローバルフィルタの適用状態(slotContext.globalFilterStatus の型)。
  GlobalFilterStatus,
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
  // 追加(行選択): 行選択の公開記述子とモードです。
  RowSelectionModel,
  RowSelectionMode,
  ScrollAlign,
  CsvExportScope,
  // 追加(export-scope 再編): 後方互換エイリアス('all' / 'visible')の deprecated 型です。
  DeprecatedCsvExportScope,
  CsvExportOptions,
  // 追加(imperative API: getExportData): エクスポート用の整形済みデータ型族(導線)。
  GridExportOptions,
  GridExportCell,
  GridExportData,
  // 追加(state #1): 列状態のシリアライズ型(getState / applyState の入出力)。
  GridState,
  // 追加(state v2): 列メタ(可視 / 順序 / ピン)のシリアライズ単位(GridState.columns 要素)。
  GridColumnState,
  // 追加(THEME-2): 密度プリセットの型。
  GridDensity,
  // 追加(TH-DK-2): カラーテーマ('light' | 'dark' | 'auto')。
  GridTheme,
  // 追加: データ投入時の列幅自動フィットの発火モード('onMount' | 'onDataChange' | false)。
  AutoSizeColumnsMode,
  // 追加(バッチ②/コンテキストメニュー): セル/行の汎用コンテキストメニュー(完全カスタム)の公開型群。
  GridContextMenuTarget,
  GridContextMenuParams,
  GridContextMenuItem,
  GridContextMenuActionItem,
  GridContextMenuLabelItem,
  GridContextMenuSeparatorItem,
  GridContextMenuCustomItem,
} from './model/gridTypes';
export type { NumberFormatterOptions } from './logic/valueFormatters';