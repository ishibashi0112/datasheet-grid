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
  // 追加(editor 基盤): セルエディタ種別(GridColumn.editor)と確定方向。
  GridColumnEditor,
  EditorCommitDirection,
  // 追加(enter-move ②): Enter 確定後の移動先(props.editorEnterMove)。
  EditorEnterMove,
  // 追加(editor: custom): custom エディタの render コンテキスト。
  CellEditorContext,
  // 追加(editor: select): select エディタの候補型(GridSelectFilterOption と同一形)。
  GridSelectEditorOption,
  // 追加(validation): セル編集バリデーションの公開型族(GridColumn.validate / validationMode、
  //   handle.getInvalidCells、エディタ commit の結果)。
  GridValidationMode,
  CellValidationContext,
  CellValidationResult,
  GridInvalidCell,
  EditorCommitResult,
  // 行キー。
  GridRowKey,
  // 追加(grouping ①): 行グルーピング(GridColumn.rowGroup / aggFunc)の公開型族です。
  GridAggFuncName,
  GridAggFuncParams,
  GridAggFunc,
  GridGroupRow,
  // select / set フィルターの候補。
  GridSelectFilterOption,
  // 追加(filter-ext E): 列定義の filterType に渡せる値('auto' 込み)と、
  //   解決後の実効 UI 種別('auto' なし)です。
  ColumnFilterTypeOption,
  ColumnFilterUiType,
  // セル / ヘッダーのカスタム描画コンテキスト(renderCell / renderHeader 引数)。
  CellRenderContext,
  HeaderRenderContext,
  // 追加(proposals ①): 条件付きセル className(cellClassName 関数版)の引数型です。
  //   CellRenderContext から setValue を除いた読み取り専用版。
  CellStyleContext,
  // 追加(proposals ⑤): 条件付き行 className(getRowClassName)の第 3 引数コンテキストです。
  RowStyleContext,
  // 追加(detail ②): 展開行(Master/Detail)の設定型と、renderCell / render へ渡すコンテキストです。
  DetailRowOptions,
  DetailRowRenderContext,
  CellDetailContext,
  // 追加(row-drag ③): 行ドラッグ並び替え(enableRowDrag / isRowDraggable / onRowMove)の公開型です。
  RowDragContext,
  RowMoveParams,
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
  // 追加(filter-ext B): 「条件 AND 選択」複合フィルター(filterType: 'numberSet')の記述子です。
  NumberSetColumnFilterValue,
  ParsedNumberFilter,
  // 追加(filter-ext C): テキスト版の複合フィルター(filterType: 'textSet')の記述子です。
  TextSetColumnFilterValue,
  ParsedTextFilter,
  // 追加(filter-ext D): 日付版の複合フィルター(filterType: 'dateSet')の記述子です。
  DateSetColumnFilterValue,
  ParsedDateFilter,
  DateFilterPreset,
  // 追加(preset-opt): dateSet プリセットの列オプション(GridColumn.dateFilterPresets)の型族です
  //   (ビルトイン ID の再利用 / カスタム { id, label, resolve } / false でチップ非表示)。
  DateFilterPresetOption,
  CustomDateFilterPreset,
  DateFilterPresetRange,
  // 追加(date-input): 日付入力スロット(props.renderFilterDateInput)の描画コンテキストです。
  FilterDateInputContext,
  TextColumnFilterValue,
  DateColumnFilterValue,
  SelectColumnFilterValue,
  CustomColumnFilterValue,
  // serverSide(SSRM)用の公開型族です。dataSource 指定時に serverSide モードへ切替わります。
  ServerSideDataSource,
  ServerSideQuery,
  ServerSideGetRowsParams,
  ServerSideGetRowsResult,
  ServerSideLoadErrorParams,
  // 追加(SSRM 書き戻し): dataSource.updateRows(セル編集の書き戻し)の型族と失敗通知
  //   (onServerSideWriteError)のパラメータです。
  ServerSideCellChange,
  ServerSideRowUpdate,
  ServerSideUpdateRowsParams,
  ServerSideUpdateRowsResult,
  ServerSideWriteErrorParams,
  // 行モデル境界型(clientSide / serverSide 共通の行取得 seam)です。
  RowModel,
  // 追加(imperative API #1): ref ハンドル(SpreadsheetGridProps.ref)と関連型です。
  SpreadsheetGridHandle,
  // 追加(行選択): 行選択の公開記述子とモードです。
  RowSelectionModel,
  RowSelectionMode,
  ScrollAlign,
  // 追加(proposals ⑧): スクロール位置 API(getScrollPosition / setScrollPosition / onScroll)の
  //   公開型です。
  GridScrollPosition,
  GridScrollEventParams,
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
  // 追加(scrollHint): スクロール位置インジケーター(props.scrollHint)の公開型群。
  ScrollHintOptions,
  ScrollHintTrigger,
  ScrollHintRenderArgs,
} from './model/gridTypes';
export type { NumberFormatterOptions } from './logic/valueFormatters';