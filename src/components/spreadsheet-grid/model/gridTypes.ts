import type { ReactNode, Ref } from 'react';

// 追加: row identity 用の key 型です。
export type GridRowKey = string | number;

// 追加(DS-3-0): 行モデルのシーム契約です。
//   本体は order(Int32Array)を直接触る代わりに、この 4 メソッド越しに行を引きます。
//   - clientSide(既定): 「全件メモリ rows + ビュー順 order」で実装します
//     (getRow = rows[order[i]] / getSourceIndex = order[i] / getRowKey =
//      resolvedRowKeyGetter(rows[order[i]], order[i]) / getRowCount = order.length)。
//   - 将来 serverSide: 「スパースキャッシュ + getRows ブロック取得」で実装します。
//   本体(SpreadsheetGrid / 各 consumer)はどちらのモードかを区別しません。これがシームの目的です。
//   viewIndex は「ビュー位置(フィルター/ソート適用後の表示上の行 index)」で、source index
//   (元 rows の index)とは別空間です。両者の対応付けは getSourceIndex が担います。
//   注記(DS-3-9): clientSide 実装は OOB(viewIndex >= getRowCount())で実行時 undefined を返します
//   (getRow = rows[order[OOB]] / getSourceIndex = order[OOB])。型は T / number のままですが
//   (本 repo は strictNullChecks 無効のため | undefined を付けても型保護が効かず、実態の明文化に
//   留まるため)、consumer 側は !row ガード(getRow)または === undefined 判定(getSourceIndex)で
//   OOB を no-op として吸収します。serverSide 化(DS-4+)でこの境界を再検討します。
export type RowModel<T> = {
  getRowCount: () => number;
  getRow: (viewIndex: number) => T;
  getSourceIndex: (viewIndex: number) => number;
  getRowKey: (viewIndex: number) => GridRowKey;
};

// 追加(DS-4 ②): serverSide(SSRM)用のデータ供給契約群です。dataSource 指定時に serverSide
//   モードへ切り替わり、clientSide の四段パイプライン(baseOrder→…→order)をバイパスして、
//   可視窓近傍のブロックだけを getRows で都度取得します(取得範囲を定数に縛りメモリを有界化)。
//   query は getRows へ載せるフィルター/ソート状態の枠で、stage ①(読み取り専用)では空、
//   stage ② でサーバ実行へ配線します。
export type ServerSideQuery = {
  // グローバルフィルター文字列(stage ② で配線)。
  globalText?: string;
  // 列フィルター記述子(stage ② で配線)。
  columnFilters?: Record<string, ColumnFilterValue>;
  // ソート状態(stage ② で配線)。
  sort?: GridSortState;
};

// 追加(DS-4 ②): getRows の引数です。[startIndex, endIndex) は view 空間・end 排他。
//   signal は古いリクエストのキャンセル用です(スクロールで通り過ぎた帯の取得を破棄)。
export type ServerSideGetRowsParams = {
  startIndex: number;
  endIndex: number;
  query: ServerSideQuery;
  signal: AbortSignal;
};

// 追加(DS-4 ②): getRows の戻り値です。totalRowCount はクエリ適用後の総件数で、毎回返す設計に
//   することで stage ② のフィルター件数変動にも縦ジオメトリが追従します(stage ① では不変)。
export type ServerSideGetRowsResult<T> = {
  rows: T[];
  totalRowCount: number;
};

// 追加(DS-4 ②): serverSide データ供給口です。getRows のみ必須で、残りは任意調整です。
//   - initialRowCount: 初回 fetch 前から正しい総高さ/スクロールバーを出したい場合に渡します
//     (未指定時は最初の getRows 結果が返るまで件数 0 = 全面ローディング)。
//   - blockSize: 1 ブロックの行数(既定 100)。1 リクエスト = 数ブロックに収まります。
//   - maxCachedBlocks: クライアント側 LRU 上限(既定 64)。超過分は画面外の古いブロックから退避。
//   ★利用者契約: getRows は渡された [startIndex, endIndex) を尊重し、全件返さないこと
//     (広い範囲を返すとクライアントで全件保持と同義になり SSRM の意義が消えます)。
export type ServerSideDataSource<T> = {
  getRows: (params: ServerSideGetRowsParams) => Promise<ServerSideGetRowsResult<T>>;
  initialRowCount?: number;
  blockSize?: number;
  maxCachedBlocks?: number;
};

// 追加: セル座標を表す基本型です。
export type CellCoord = {
  row: number;
  col: number;
};

// 追加: 範囲選択を表すセル範囲型です。
export type CellRange = {
  start: CellCoord;
  end: CellCoord;
};

// 追加: Grid の選択状態です。初版は cell selection を主対象にします。
export type GridSelection =
  | { type: 'cell'; range: CellRange }
  | { type: 'row'; startRow: number; endRow: number }
  | { type: 'col'; startCol: number; endCol: number }
  | null;

// 追加: フィルター状態です。初版はグローバル + 列単位の最小構成です。
// 変更(記述子化): columnFilters の値型を unknown → ColumnFilterValue(判別共用体)へ閉じました。
//   従来 set / number だけがタグ付き記述子で、text / select / date は生文字列のまま混在していました。
//   全種別を kind 付き記述子へ寄せ、値そのものから種別が一意に決まる(自己記述的)状態にしています。
export type GridFilterState = {
  globalText: string;
  columnFilters: Record<string, ColumnFilterValue>;
};

// 追加: 列単位の UI ソート方向です(null = 未ソート)。列メニューの ✓ 表示などで
//       「この列は今どちらか」を表すために使います(GridSortEntry の direction とは別物)。
export type GridSortDirection = 'asc' | 'desc' | null;

// 追加(MS-1 / マルチソート): ソート 1 件分です。配列内の direction は null を取りません。
export type GridSortEntry = {
  columnKey: string;
  direction: 'asc' | 'desc';
};

// 変更(MS-1 / マルチソート): 単一オブジェクト → エントリ配列にしました。
//   - 配列順 = ソート優先順位(先頭が最優先)
//   - [] = ソートなし
// 単一列ソートは「長さ 1 の配列」で表現します(MS-1 時点では常に長さ 0/1)。
export type GridSortState = GridSortEntry[];

// 追加: select フィルター用の候補型です。
export type GridSelectFilterOption = {
  label: string;
  value: string;
};

// 追加(12-A): set フィルター(AG Grid の Set Filter 相当)の列フィルター値です。
//             columnFilters[columnKey] にこのオブジェクトが入っているときだけ
//             set フィルターが「有効」です。全候補が選択された状態は
//             filter/clearColumn で値ごと削除し「フィルターなし」へ正規化します
//             (AG Grid と同じく、全選択 = フィルター非アクティブの扱いです)。
//             values は「表示を許可する値」の配列です(空配列 = 全行非表示)。
//             判定側(logic/filtering.ts)では Set へ変換して O(1) 照合します。
export type SetColumnFilterValue = {
  kind: 'set';
  // 追加(反転set): 既定 'include'(values=選択値)。多数選択時は 'exclude'(values=非選択値のみ)で
  //   巨大配列の生成・複製・dispatch を回避します。mode 省略時は従来どおり include 扱い(後方互換)。
  mode?: 'include' | 'exclude';
  values: string[];
};

// 追加(記述子化 / number): number フィルター式の解釈結果です。
//   旧 logic/filtering.ts 内に定義していましたが、ColumnFilterValue union(下記)が
//   number 記述子を内包する都合上、型はこちら(下層の型モジュール)へ移設しました。
//   parse/build の「ロジック」は引き続き logic/filtering.ts 側にあります(本型を import します)。
export type ParsedNumberFilter =
  | {
      mode: 'comparison';
      operator: '>' | '>=' | '<' | '<=' | '=';
      value: number;
    }
  | {
      mode: 'range';
      min: number;
      max: number;
    };

// 追加(記述子化 / number): number フィルターのタグ付き記述子です(旧 filtering.ts から移設)。
//   - raw   : ユーザー入力(trim 済み)。再オープン時の draft seed / 現在値表示 /
//             式として解釈不可だった場合の contains フォールバック needle に使います。
//   - parsed: 式の解釈結果。null = 解釈不可(→ raw で contains)。commit 時 1 回だけ parse します
//             (B-2 の Float64 key 最適化はこの parsed に依存するため、形は不変に保ちます)。
export type NumberColumnFilterValue = {
  kind: 'number';
  raw: string;
  parsed: ParsedNumberFilter | null;
};

// 追加(記述子化): text / date の部分一致フィルターのタグ付き記述子です。
//   value は trim 済みの検索文字列です(判定側で toLowerCase して contains)。
//   date は今は text と同じ部分一致述語を共有しますが、将来の相対日付(評価時に解決)のため
//   箱(kind)を分けて確保しています。number のように commit 時へ parse を焼くことはしません。
export type TextColumnFilterValue = {
  kind: 'text';
  value: string;
};

export type DateColumnFilterValue = {
  kind: 'date';
  value: string;
};

// 追加(記述子化): select の完全一致フィルターのタグ付き記述子です。
//   value は選択値そのもの(trim しない)で、判定側で文字列完全一致します。
export type SelectColumnFilterValue = {
  kind: 'select';
  value: string;
};

// 追加(記述子化 / custom): 利用者の column.filterFn が自由形で解釈するためのエスケープハッチです。
//   value は unknown のまま(任意形を保持)。filterFn を持つ列のみで使い、判定側では
//   filterFn が最優先で呼ばれます(filterFn 不在時は String(value) の部分一致へフォールバック)。
//   union 全体は kind で網羅できるため型安全のまま、custom の中身だけが自由という両立になります。
export type CustomColumnFilterValue = {
  kind: 'custom';
  value: unknown;
};

// 追加(記述子化): 列フィルター値の判別共用体です。columnFilters[columnKey] の値はこの形のいずれか。
//   値の kind だけで種別が一意に決まるため、消費側は column.filterType と突き合わせずに
//   switch(value.kind) 一本で判別できます(filterType は popover の表示分岐用にのみ残ります)。
export type ColumnFilterValue =
  | SetColumnFilterValue
  | NumberColumnFilterValue
  | TextColumnFilterValue
  | DateColumnFilterValue
  | SelectColumnFilterValue
  | CustomColumnFilterValue;

// 追加: セル描画に渡すコンテキストです。
export type CellRenderContext<T> = {
  row: T;
  rowIndex: number;
  colIndex: number;
  value: unknown;
  column: GridColumn<T>;
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  readOnly: boolean;
  setValue: (value: unknown) => void;
};

// 追加(UI CSS移行): 条件付きセル className(GridColumn.cellClassName)の関数版へ渡す
//   コンテキストです。CellRenderContext から setValue を除いた読み取り専用版で、
//   className 算出に副作用(setValue)は不要なため値解決(getCellValue)のみを伴います。
export type CellStyleContext<T> = {
  row: T;
  rowIndex: number;
  colIndex: number;
  value: unknown;
  column: GridColumn<T>;
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  readOnly: boolean;
};

// 追加(11-A): GridBodyRow がセルごとに算出し、renderCellContent へ引き渡す
//             セル状態のスナップショットです。
// 変更理由: 旧実装では renderCellContent(SpreadsheetGrid 側) が uiState から
//           isActive / isSelected / isEditing を毎回判定しており、uiState 依存に
//           よって useCallback の参照が選択操作のたびに変わり、GridBodyRow(memo)
//           を全行で破っていました。判定を行側へ移し、結果だけを渡します。
export type CellRenderState = {
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  readOnly: boolean;
};

// 追加: ヘッダー描画に渡すコンテキストです。
export type HeaderRenderContext<T> = {
  colIndex: number;
  width: number;
  column: GridColumn<T>;
  filterValue?: unknown;
  isFiltered?: boolean;
};

// 追加(10-A): AG Grid 互換の列固定方向型です。
//             'left' = 左固定、'right' = 右固定、undefined = 固定なし（中央スクロール）。
export type GridColumnPinned = 'left' | 'right';

// 追加(③): セル表示値の整形関数の契約です(UI 表示のみ)。組み込みは logic/valueFormatters.ts に集約し、
//   利用側も同じ契約で自作できます(将来パターン追加=ファクタ追加 + バレル公開で拡張)。
export type CellValueFormatterParams<T> = {
  value: unknown;
  row: T;
  column: GridColumn<T>;
};
export type CellValueFormatter<T> = (params: CellValueFormatterParams<T>) => string;

// 追加: 列定義です。将来のカスタムセル/カスタムヘッダー拡張を見据えています。
export type GridColumn<T> = {
  key: string;
  title?: string;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  // 追加(B3): JS 算出 flex(AG Grid の flex 相当)。center ペイン(非 pinned)の列でのみ有効で、
  //   「利用可能幅 − 固定列合計」を flex 比で配分します(min/max でクランプ)。pinned 列では無視されます。
  //   手動リサイズするとその列は固定 px に変わります(columns が変化するまで固定。以後は flex に復帰)。
  //   ※ 中身の長さに合わせて固定 px を決めたい場合は flex ではなく autoSize を使ってください(別概念)。
  flex?: number;
  // 追加(①): この列のリサイズ可否です。未指定時はグリッドの enableColumnResize を継承します
  //   (解決規則: column.resizable ?? enableColumnResize)。false でヘッダーのリサイズハンドルを
  //   描画しません(手動リサイズ不可)。
  resizable?: boolean;
  // 追加(②-S1): true の列を autoSize(列メニュー / ヘッダー境界ダブルクリック / すべての列の自動調整)の
  //   対象から除外し、consumer が指定した width を維持します(固定幅優先)。テキストで幅を測れない
  //   カスタムUI列(renderCell)や、固定幅で見せたい列に付ける per-column の opt-in です。
  //   未指定(undefined)は従来どおり autoSize 対象です(後方互換)。
  suppressAutoSize?: boolean;
  // 追加(②-S2): autoSize の幅見積もり関数です。指定すると、その列の autoSize は「セル内容の
  //   ピクセル幅(セルの padding / border を除く content 幅)」をこの関数から得て、全行の最大 +
  //   セル枠で確定します(テキスト計測 / 候補 / 実 DOM 計測は使いません)。テキスト長が実描画幅と
  //   相関しない renderCell カスタムUI列(例: 横並びのバッジ / チップ)向けの per-column opt-in です。
  //   未指定時は通常の 2 段計測(全行 canvas 候補 → 候補のみ実 DOM 実測)になります。
  estimateCellWidth?: (row: T, column: GridColumn<T>) => number;
  // 追加(C1): true の列が auto-height 行の高さを駆動します(複数列指定時は max を採用)。
  //   グリッド props の autoHeight 有効時のみ効きます(無効時はこのフラグは無視)。
  autoHeight?: boolean;
  visible?: boolean;
  editable?: boolean;
  readOnly?: boolean;
  // 追加(10-A): AG Grid 互換の列固定指定です。
  //             未指定 or undefined → 中央スクロール領域に配置されます。
  pinned?: GridColumnPinned;
  getValue?: (row: T) => unknown;
  setValue?: (row: T, value: unknown) => T;
  renderCell?: (ctx: CellRenderContext<T>) => ReactNode;
  // 追加(UI CSS移行): セルへ付与する追加 className(条件付きスタイル)。文字列 or 関数。
  //   関数版は CellStyleContext を受け取り、値や状態に応じてクラスを返せます(例: Tailwind)。
  //   基底クラス(.ssg-body-cell)は @layer ssg-base のため、ここで返したクラスが特異度を
  //   気にせず背景等を上書きできます(選択 / アクティブは別オーバーレイなので共存します)。
  cellClassName?: string | ((ctx: CellStyleContext<T>) => string | undefined);
  // 追加(③): セル内容の水平寄せ(UI 表示のみ・元の値は不変)。未指定は左。
  //   セル表示と編集 input の双方へ反映します(renderCell 指定時もセルコンテナへ適用)。
  align?: 'left' | 'center' | 'right';
  // 追加(③): セル表示値の整形(UI 表示のみ・元の値/編集/コピー/ソート/フィルターに影響しません)。
  //   renderCell 未指定の既定セルが本関数の返り値を表示します(renderCell 指定時は無視)。
  //   組み込みの numberFormatter 等を渡せます(バレルから公開)。
  valueFormatter?: CellValueFormatter<T>;
  renderHeader?: (ctx: HeaderRenderContext<T>) => ReactNode;
  // 変更(12-A): 'set' を追加します。AG Grid の Set Filter 相当
  //             (チェックボックス一覧 + 検索 + Select All)の UI になります。
  filterType?: 'text' | 'number' | 'date' | 'select' | 'set' | 'custom';
  // 追加: select / set フィルター時の候補です。未指定時は rows から自動収集します。
  filterOptions?: GridSelectFilterOption[];
  filterFn?: (row: T, filterValue: unknown) => boolean;
  parseClipboardValue?: (raw: string, row: T) => unknown;
  formatClipboardValue?: (value: unknown, row: T) => string;
};

// 追加: 列リサイズ用のドラッグ状態です。初版では reducer 側の設計だけ入れます。
export type ColumnResizeDragState = {
  type: 'columnResize';
  columnKey: string;
  startX: number;
  startWidth: number;
  minWidth: number;
  maxWidth: number;
};

// 追加: セル範囲選択用のドラッグ状態です。
// 変更(11-B2): current を削除しました。ドラッグ中の「現在位置」は selection 側
//              (range.end / endRow / endCol)が唯一の正であり、dragState には
//              ドラッグ開始時に確定する不変情報(anchor)のみを持たせます。
//              これにより update 系 action で dragState を作り直す必要がなくなり、
//              ドラッグ中の dragState 参照が恒久的に安定します。
export type CellSelectionDragState = {
  type: 'selection';
  selectionKind: 'cell';
  anchor: CellCoord;
};

// 追加: 行選択用のドラッグ状態です。
// 変更(11-B2): currentRow を削除しました(理由は CellSelectionDragState と同じ)。
export type RowSelectionDragState = {
  type: 'selection';
  selectionKind: 'row';
  anchorRow: number;
};

// 追加: 列選択用のドラッグ状態です。
// 変更(11-B2): currentCol を削除しました(理由は CellSelectionDragState と同じ)。
export type ColumnSelectionDragState = {
  type: 'selection';
  selectionKind: 'col';
  anchorCol: number;
};

// 追加: Grid 内部 UI state です。rows は外部 controlled とし、ここには持ちません。
export type GridUiState = {
  activeCell: CellCoord | null;
  selection: GridSelection;
  editingCell: CellCoord | null;
  dragState:
    | CellSelectionDragState
    | RowSelectionDragState
    | ColumnSelectionDragState
    | ColumnResizeDragState
    | null;
  columnWidths: Record<string, number>;
  filters: GridFilterState;
  sort: GridSortState;
};

// 追加: 選択統計の派生 summary です。
export type SpreadsheetGridSelectionStats = {
  selectedCellCount: number;
  selectedRowCount: number;
  selectedColumnCount: number;
};

// 追加: topBar / bottomBar でそのまま使える派生 summary です。
export type SpreadsheetGridDerivedSummary = {
  rowSummaryText: string;
  columnSummaryText: string;
  filterSummaryText: string;
  sortSummaryText: string;
  activeCellLabel: string;
  selectionLabel: string;
  selectionStatsText: string;
  selectionStats: SpreadsheetGridSelectionStats;
  hasGlobalFilter: boolean;
  // 追加: グローバルフィルター入力値の短縮表示です。
  globalFilterPreview: string | null;
  activeColumnFilterCount: number;
  hasAnyFilter: boolean;
  hasSorting: boolean;
  sortedColumnLabel: string | null;
};

// 追加(F-async): グローバルテキストフィルタの適用状態です。大規模データ(しきい値超)では
//   入力に対しビューを時間分割で適用するため、適用中は 'filtering'(進捗 0..1)になります。
//   空/無効は 'idle'、確定は 'ready'。serverSide では基本 'idle' / 'ready' です
//   (取得中表示は行スケルトンが担当)。
//   ローディング表示はグリッドが本体に重ねる組み込み overlay で行うため、通常はこの値を扱う必要は
//   ありません。カスタム UI(入力の無効化や独自インジケータ等)を出したい場合に slotContext 経由で
//   参照できます。
export type GlobalFilterStatus = 'idle' | 'filtering' | 'ready';

// 追加: topBar / bottomBar へ渡す公開コンテキストです。
export type SpreadsheetGridSlotContext<T> = {
  rows: T[];
  filteredRows: T[];
  columns: GridColumn<T>[];
  visibleColumns: GridColumn<T>[];
  globalFilterText: string;
  // 追加: bar summary 用に列フィルター値を公開します。
  // 変更(記述子化): 値型を unknown → ColumnFilterValue へ閉じました(state 側と一致)。
  columnFilterValues: Record<string, ColumnFilterValue>;
  // 追加: bar summary 用にソート状態を公開します。
  sortState: GridSortState;
  setGlobalFilterText: (value: string) => void;
  activeCell: CellCoord | null;
  selection: GridSelection;
  // 追加: 利用側が helper import なしで使える派生 summary です。
  derivedSummary: SpreadsheetGridDerivedSummary;
  // 追加(F-async): グローバルフィルタの適用状態と進捗です。大規模データで時間分割中のみ
  //   'filtering'(progress 0..1)になります。ローディング表示はグリッドが本体へ重ねる組み込み
  //   overlay で行うため、通常は不要です。カスタム UI を出したい場合の参照用に公開しています。
  globalFilterStatus: GlobalFilterStatus;
  globalFilterProgress: number;
};

// 追加: 公開 props です。
// 追加(UI CSS移行): 各パーツへ追加 className を差し込むスロットです。利用側はここに任意のクラス
//   (例: 別プロジェクトの Tailwind ユーティリティ)を渡して局所調整できます。基底クラスは
//   @layer ssg-base に入っているため、ここで渡したクラスが特異度を気にせず上書きできます。
//   注記: 段階移行中。現在“配線済み”は root / iconButton。他スロットは順次配線します。
export type GridClassNames = {
  root?: string;
  toolbar?: string;
  statusBar?: string;
  headerRow?: string;
  headerCell?: string;
  bodyRow?: string;
  bodyCell?: string;
  rowHeaderCell?: string;
  iconButton?: string;
};

// 追加(imperative API #1): ref ハンドルのスクロール整列指定です。
//   'auto'  : 既に可視ならスクロールしない。はみ出す側の端へ最小スクロール。
//   'start' : 対象を可視帯の先頭(ヘッダー直下 / 左固定直右)へ。
//   'center': 対象を可視帯の中央へ。
//   'end'   : 対象を可視帯の末尾(下端 / 右端)へ。
export type ScrollAlign = 'auto' | 'start' | 'center' | 'end';

// 追加(imperative API #1): CSV エクスポートの対象範囲です。
//   'all'      : 全ビュー行 × visible 列(既定)。SSRM ではロード済み行のみ出力されます。
//   'selection': 現在の選択範囲(セル/行/列)。選択なしのときは空文字を返します。
//   'visible'  : 現在の描画ウィンドウ(画面に見えている近傍)の行のみ。
export type CsvExportScope = 'all' | 'selection' | 'visible';

// 追加(imperative API #1): CSV エクスポートのオプションです。
export type CsvExportOptions = {
  // 出力範囲(既定 'all')。
  scope?: CsvExportScope;
  // 先頭にヘッダー行(列タイトル)を付けるか(既定 true)。
  includeHeaders?: boolean;
  // 区切り文字(既定 ',')。'\t' を渡せば TSV になります。
  delimiter?: string;
  // 先頭に UTF-8 BOM を付けるか(exportCsv は既定 false / downloadCsv は既定 true)。
  bom?: boolean;
};

// 追加(imperative API: getExportData): エクスポート用「整形済みデータ」のオプションです。CSV と同じ
//   scope セマンティクスを共有します(出力範囲のみ)。直列化に関わる delimiter / bom / includeHeaders は
//   持ちません(ヘッダーは columns として別途返すため、書き出すかは consumer 判断)。
export type GridExportOptions = {
  // 出力範囲(既定 'all')。CsvExportScope を共有します。
  scope?: CsvExportScope;
};

// 追加(imperative API: getExportData): エクスポート 1 セルの内容です。
//   - value: 生のセル値(getCellValue)。Excel の型付きセル / 数値書式に使えます。
//   - text : 文字列表現。CSV / クリップボードと同じ規則(formatClipboardValue ?? String(value ?? ''))。
export type GridExportCell = {
  value: unknown;
  text: string;
};

// 追加(imperative API: getExportData): 列メタ + 2 次元セルの、シリアライズ非依存なエクスポートモデルです。
//   ライブラリは xlsx を同梱せず、この「整形済みデータ」を提供します(導線)。consumer は exceljs /
//   hucre / SheetJS など任意のライブラリへ流し込みます(xlsx / ods / json など出力形式も自由)。
//   - columns: 列メタ(視覚順 / scope='selection' では選択列のみ)。key はオブジェクト系ライブラリ
//     (hucre の data / writeObjects、SheetJS の json_to_sheet 等)向け、title はヘッダー表示向けです。
//   - rows   : scope の行レンジぶんのセル 2 次元配列(SSRM 未ロード行はスキップ)。各行のセル順は
//     columns と同順です。
export type GridExportData = {
  columns: { key: string; title: string }[];
  rows: GridExportCell[][];
};

// 追加(state v2): 列メタのシリアライズ単位です(getState / applyState の GridState.columns 要素)。
//   grid UI が変更しうる列メタ(可視 / 順序 / ピン)だけを持ちます。
//   - key     : 対象列の識別子(GridColumn.key)。applyState はこの key で現 columns へマージします。
//   - visible : 列の表示 / 非表示(Column Chooser)。未指定=表示(既定)。
//   - pinned  : 列固定(列メニュー / ヘッダー D&D)。未指定=非固定(center)。
//   順序は「配列順」で表現します(GridState.columns の並び = 列順)。
//   flex / width は意図的に持ちません:
//   - flex は grid UI が変更しないため(consumer 宣言値が常に正)、保存すると古い値が再読込で
//     上書きしてしまう(stale-override)だけで利得がありません。
//   - width(手動リサイズ幅)は GridState.columnWidths で既にカバー済みです(二重表現の回避)。
export type GridColumnState = {
  key: string;
  visible?: boolean;
  pinned?: GridColumnPinned;
};

// 追加(state #1): 列状態のシリアライズ可能スナップショットです(getState / applyState の入出力)。
//   永続化(localStorage 等)は consumer に委ね、グリッドは get/apply + version だけを提供します。
//   対象は reducer 内の永続スライス(手動リサイズ幅 / フィルター / ソート)と、列メタ(v2: 可視 / 順序 /
//   ピン)です。activeCell / selection などの一時 UI は含めません。columnWidths は手動リサイズした列
//   のみを含みます(flex 列はエントリを持たない規約)。columns は列メタで、配列順 = 列順です。
//   version は形式変更時に applyState 側で旧バージョンを移行するための番号です。
//   - v1: columns フィールド無し。applyState では columns:undefined 扱いで列メタを触りません(後方互換)。
//   - v2: columns を含めます。column 順序 / visible / pinned を get/apply します。
export type GridState = {
  version: number;
  columnWidths: Record<string, number>;
  filters: GridFilterState;
  sort: GridSortState;
  // 追加(state v2): 列メタ(可視 / 順序 / ピン)。配列順 = 列順。undefined = 列メタ未適用(v1 後方互換)。
  //   applyState は onColumnsChange が指定されているときのみ反映します(getState は read-only で常に出力)。
  columns?: GridColumnState[];
};

// 追加(imperative API #1): ref ハンドル(SpreadsheetGridProps.ref で受け取る命令的 API)です。
//   設計方針: 状態(列幅/可視/sort/filter 等)は controlled のまま。ここには「prop で表現できない
//   一発操作」だけを載せます(スクロール / 選択操作 / CSV / 状態の保存・復元)。
//   - viewRowIndex / colIndex は「ビュー座標」です(フィルター/ソート適用後の表示上の index。
//     colIndex は視覚順 = 固定列を含む左→中央→右の並び)。範囲外の index は内部でクランプ/無視します。
export type SpreadsheetGridHandle<T> = {
  // ── viewport(スクロール)──
  // 指定行が可視になるようスクロールします(align 既定 'auto')。
  scrollToRow: (viewRowIndex: number, options?: { align?: ScrollAlign }) => void;
  // 指定セルが可視になるよう縦横スクロールします(固定列は横スクロール対象外)。
  scrollToCell: (
    viewRowIndex: number,
    colIndex: number,
    options?: { align?: ScrollAlign },
  ) => void;
  // 先頭 / 末尾へスクロールします。
  scrollToTop: () => void;
  scrollToBottom: () => void;
  // 現在描画中の行ウィンドウ [startIndex, endIndex)(end 排他)。空のときは null。
  getVisibleRowRange: () => { startIndex: number; endIndex: number } | null;

  // ── 選択 / アクティブセル ──
  // 現在のアクティブセル座標(なければ null)。
  getActiveCell: () => CellCoord | null;
  // アクティブセルを設定(null で解除)。scrollIntoView:true で可視化も行います。
  setActiveCell: (
    cell: CellCoord | null,
    options?: { scrollIntoView?: boolean },
  ) => void;
  // 現在の選択状態。
  getSelection: () => GridSelection;
  // 単一セルを選択(クリック相当)。scrollIntoView:true で可視化も行います。
  selectCell: (
    viewRowIndex: number,
    colIndex: number,
    options?: { scrollIntoView?: boolean },
  ) => void;
  // セル範囲を選択(ドラッグ選択相当)。アンカーは range.start です。
  selectRange: (range: CellRange, options?: { scrollIntoView?: boolean }) => void;
  // 選択を解除します。
  clearSelection: () => void;
  // 選択に交差する行(distinct)を返します。SSRM はロード済み行のみ。
  getSelectedRows: () => T[];

  // ── エクスポート ──
  // CSV 文字列を返します(純粋・副作用なし)。
  exportCsv: (options?: CsvExportOptions) => string;
  // exportCsv の結果をファイルとしてダウンロードします(Blob + 一時 anchor の DOM 副作用)。
  //   bom は未指定時 true(Excel 互換)。filename 既定 'export.csv'。
  downloadCsv: (filename?: string, options?: CsvExportOptions) => void;
  // 追加(imperative API: getExportData): エクスポート用の整形済みデータ(列メタ + 2 次元セル)を返します
  //   (純粋・副作用なし)。scope / 列順 / フィルター・ソート適用は exportCsv と同一規則です。xlsx 等の
  //   生成は consumer 側で任意のライブラリ(exceljs / hucre / SheetJS …)を使って行います(本ライブラリは
  //   Excel ライブラリを同梱しません)。複数シートは consumer 側で本メソッドを scope 別 / グリッド別に
  //   呼び出して組み立てます(グリッドは「1 表」を返すプリミティブに徹します)。
  getExportData: (options?: GridExportOptions) => GridExportData;

  // ── 状態の保存 / 復元 ──
  // 永続化対象(手動リサイズ幅 / フィルター / ソート / 列メタ=可視・順序・ピン)のスナップショット
  //   (GridState v2)を返します(純粋・副作用なし・read-only)。列メタは columns prop から配列順で抽出
  //   します。返り値は新規オブジェクト/配列で、そのまま JSON.stringify して保存できます。
  getState: () => GridState;
  // getState のスナップショット(または互換な部分形)を適用します。外部入力は内部で防御的に正規化され、
  //   幅 reset / フィルター一括 / ソート set の 3 dispatch(1 イベント = 1 再レンダー)で反映します。
  //   clientSide / serverSide 双方に効きます(SSRM では filters/sort 変化がクエリへ載り再取得)。
  //   列メタ(columns)は onColumnsChange が指定されているときのみ、現 columns へ key ベースでマージして
  //   onColumnsChange 経由で反映します(未指定時はスキップ=幅/フィルター/ソートのみ。v1 完全互換)。
  //   v1 保存値(columns フィールド無し)も読めます(列メタは触りません)。
  applyState: (state: GridState) => void;
};

export type SpreadsheetGridProps<T> = {
  // 追加(imperative API #1): React 19 の ref-as-prop。命令的ハンドル(SpreadsheetGridHandle)を受け取ります。
  //   forwardRef は使いません(React 19 で deprecated 予定のため)。状態は controlled のまま、prop で
  //   表現できない一発操作(スクロール/選択操作/CSV)だけをハンドルで提供します。
  ref?: Ref<SpreadsheetGridHandle<T>>;
  // 追加(state #2): 永続スライス(手動リサイズ幅 / フィルター / ソート / 列メタ=可視・順序・ピン)が
  //   実際に変化したときに、最新の GridState(v2)を渡して呼ばれる通知口です。consumer はこれを保存
  //   タイミングの signal にできます(例: localStorage への自動保存)。発火規約:
  //   - 列リサイズ / 選択のドラッグ中は確定まで保留し、確定後に 1 回だけ評価します(毎フレーム発火しない)。
  //   - 初回マウントでは発火しません(初期状態は通知対象外)。
  //   - 前回通知と構造等価(永続スライス + 列メタが不変)なら発火しません(activeCell 等の一時 UI では
  //     発火しない)。列の可視 / 順序 / ピン変更でも発火します(columns prop 変化を監視)。
  //   - applyState による反映も「状態変化」として発火します(復元直後に同値を 1 回保存する可能性あり)。
  //   毎レンダーで新しいインライン関数を渡しても問題ありません(latest-ref 経由で読むため再評価しません)。
  onStateChange?: (state: GridState) => void;
  // 変更(DS-4 ②/①-3): rows を optional 化しました。dataSource(serverSide)指定時は rows 不要のため。
  //   clientSide でも SpreadsheetGrid 側で既定値(EMPTY_ROWS)を当てるため、未指定でも従来どおり動作します。
  rows?: T[];
  // 追加(DS-4 ②): serverSide データ供給口です。指定時に serverSide モードへ切り替えます
  //   (rows と排他・dataSource 優先)。①-3 で本 prop を消費してモード分岐します。
  dataSource?: ServerSideDataSource<T>;
  // 追加(stage ③): serverSide のソフトリフレッシュ用トークンです。値を増やすと、クエリ
  //   (フィルター/ソート/グローバル)を変えずにキャッシュを破棄し、現在の可視レンジをサーバから
  //   取り直します。スクロール位置は保持し、件数は到着ブロックの totalRowCount で追従します
  //   (queryKey 変化=結果総入れ替え→先頭リセットとは別物)。clientSide では無視されます。
  serverSideRefreshToken?: number;
  columns: GridColumn<T>[];
  onRowsChange?: (nextRows: T[]) => void;
  onColumnsChange?: (nextColumns: GridColumn<T>[]) => void;
  rowKeyGetter?: (row: T, index: number) => GridRowKey;
  createRow?: () => T;
  createOverflowColumn?: (columnIndex: number) => GridColumn<T>;
  rowHeight?: number;
  // 追加(C1): auto-height 行モードを有効化します。autoHeight:true の列が行高を駆動し、
  //   行ごとに内容量で高さが変わります。論理全高が行数 gate を超える場合は uniform 行高へ
  //   フォールバックします(供給側の配線は C1-3)。
  autoHeight?: boolean;
  // 追加(C1): auto-height の未測定行に使う 1 行の推定高さ(px)。未指定時は rowHeight。
  estimateRowHeight?: number;
  headerHeight?: number;
  rowHeaderWidth?: number;
  // 追加: スクロールコンテナの明示高さ。'100%' で親要素に追従(親が確定高さを持つ前提)。
  //   number は px。未指定時は maxHeight によるクリップ挙動(従来)になります。
  //   height と maxHeight は併用可です(height + 上限 maxHeight)。
  height?: number | string;
  // 追加: スクロールコンテナの高さ上限。height・maxHeight が共に未指定のときのみ
  //   既定 480px が適用されます(従来挙動・後方互換)。明示時はその値を上限にします。
  maxHeight?: number | string;
  readOnly?: boolean;
  canEditCell?: (
    rowIndex: number,
    colIndex: number,
    row: T,
    column: GridColumn<T>,
  ) => boolean;
  enableRangeSelection?: boolean;
  enableGlobalFilter?: boolean;
  enableColumnFilter?: boolean;
  enableSorting?: boolean;
  // 追加(①): 列幅の手動リサイズ可否のグリッド既定です(既定 true=現行挙動)。
  //   各列の column.resizable が未指定のとき本値を継承します(column.resizable ?? enableColumnResize)。
  enableColumnResize?: boolean;
  // 追加(UI hover): 行ホバー時に行全体を薄くハイライトします。既定 true。
  enableRowHover?: boolean;
  // 追加(UI hover): 列ヘッダーのホバー時にヘッダーセルを薄くハイライトします。既定 true。
  enableColumnHeaderHover?: boolean;
  // 追加(13-A): 列メニュー(「⋮」ボタン + ヘッダー右クリック)の有効化フラグです。
  //             既定は true。メニューからの列固定切替は columns が controlled のため
  //             onColumnsChange が指定されている場合にのみ反映されます
  //             (未指定時はメニュー項目が無効表示になります)。
  enableColumnMenu?: boolean;
  // 追加(12-B): フィルター結果 0 行時に表示するテキストです
  //             (AG Grid の "No Matching Rows" オーバーレイ相当)。
  noMatchingRowsText?: string;
  // 追加(12-B): rows 自体が 0 件のときに表示するテキストです
  //             (AG Grid の "No Rows To Show" 相当)。
  noRowsText?: string;
  // 追加: 上部バー(ツールバー)を表示するかどうかです。既定 true。
  //   false にすると renderTopBar / enableGlobalFilter に関わらず上部バーを一切描画しません
  //   (表示のマスタースイッチ。矛盾指定時は renderTopBar より優先されます)。
  showTopBar?: boolean;
  // 追加: 既定トップバーの summary chips(件数/フィルター/ソート)を表示するかどうかです。既定 true。
  //   既定トップバー(renderTopBar 未指定)のときのみ効きます。これと showTopBarFilter の両方が
  //   非表示(かつフィルター入力も出ない)場合、トップバーは描画されません(空バーは出しません)。
  showTopBarSummary?: boolean;
  // 追加: 既定トップバーの Rows / Columns 件数 chips を表示するかどうかです。既定 true。
  //   既定トップバー(renderTopBar 未指定)かつ showTopBarSummary=true のときのみ効きます
  //   (Filter / Sort chips は本値の対象外で、showTopBarSummary に従います)。
  showTopBarCounts?: boolean;
  // 追加: 既定トップバーのグローバルフィルター入力欄を表示するかどうかです。既定 true。
  //   既定トップバー(renderTopBar 未指定)のときのみ効きます。enableGlobalFilter=false のときは
  //   本値に関わらず入力欄を出しません(無効な機能の入力欄を出さないため)。
  showTopBarFilter?: boolean;
  // 追加: 下部バー(ステータスバー)を表示するかどうかです。既定 true。
  //   false にすると renderBottomBar に関わらず下部バーを一切描画しません
  //   (表示のマスタースイッチ。矛盾指定時は renderBottomBar より優先されます)。
  showBottomBar?: boolean;
  // 追加: 既定ボトムバーの Rows / Columns 件数 chips(左側)を表示するかどうかです。既定 true。
  //   既定ボトムバー(renderBottomBar 未指定)のときのみ効きます。右側の Active / Selection /
  //   選択統計 / Cols chips は本値の対象外で常時表示です。
  showBottomBarCounts?: boolean;
  // 追加: Grid 上部カスタム領域です。未指定時は既定ツールバー(summary chips + グローバルフィルター
  //   入力)を表示します。既定バーの内訳は showTopBarSummary / showTopBarFilter で出し分けできます
  //   (フィルター入力は enableGlobalFilter=true が前提)。showTopBar=false のときは本指定に関わらず
  //   描画しません。
  renderTopBar?: (context: SpreadsheetGridSlotContext<T>) => ReactNode;
  // 追加: Grid 下部カスタム領域です。未指定時は既定ステータスバーを表示します。
  //   showBottomBar=false のときは本指定に関わらず描画しません。
  renderBottomBar?: (context: SpreadsheetGridSlotContext<T>) => ReactNode;
  className?: string;
  // 追加(UI CSS移行): パーツ別の追加 className スロット(詳細は GridClassNames)。
  classNames?: GridClassNames;
  // 追加(UI CSS移行): 行ごとの追加 className を返すコールバック(条件付き行スタイル)。
  //   返り値は行コンテナと各データセルへ付与され、Tailwind 等での行ハイライトに使えます。
  //   (注記: 行ヘッダー「#」セルはヘッダー系スタイルと共有のため現状この対象外です。)
  getRowClassName?: (row: T, rowIndex: number) => string | undefined;
};