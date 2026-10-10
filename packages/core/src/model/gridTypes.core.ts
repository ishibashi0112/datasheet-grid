// 変更(非依存化 ①): 公開型の本体です(React 非依存)。React 型(ReactNode / CSSProperties / Ref)は
//   直接 import せず、フレームワーク束ね型 F(GridFrameworkTypes)経由で F['node'](描画ノード)/
//   F['style'](インライン style)として参照します。React 版の束縛は model/gridTypes.ts
//   (ReactGridTypes = { node: ReactNode; style: CSSProperties } + ref prop)が与え、既存の import
//   パス・公開型名・型引数の数はそこで従来どおりに保たれます。将来の Solid 版は
//   { node: JSX.Element; style: JSX.CSSProperties } を F に渡すだけで同じ型を共用できます。
//   F に依存する型(25 個)だけが末尾に F を持ち、それ以外の型は無変更です。

// フレームワーク束ね型です。node = 描画スロット(renderCell 等)の戻り値、style = インライン style。
export type GridFrameworkTypes = { node: unknown; style: object };

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
  // 追加(grouping ②): 行グルーピング有効時のみ定義される任意アクセサです。ビュー行が
  //   グループ行のとき記述子(GridGroupRow)を返し、leaf 行 / OOB では undefined を返します。
  //   グループ行の viewIndex では getRow / getSourceIndex が実行時 undefined になります
  //   (DS-3-9 の OOB と同じ「型は T / number のまま・実行時 undefined」の契約に合流。
  //   既存 consumer の !row ガード / === undefined 判定がそのままグループ行を no-op として
  //   吸収します)。グルーピング無効(clientSide 非グループ / serverSide)では未定義です。
  getGroupRow?: (viewIndex: number) => GridGroupRow | undefined;
  // 追加(label-row ①): ラベル行(見出し / 区切り行)有効時のみ定義される任意アクセサです。ビュー行が
  //   ラベル行のとき記述子(GridLabelRow)を返し、データ行 / OOB では undefined を返します。
  //   ラベル行の viewIndex では getRow / getSourceIndex が実行時 undefined になります(グループ行と
  //   同じ契約 = 既存 consumer の !row ガードがラベル行を no-op として吸収します)。getRowKey は
  //   ラベル行でも定義され、rowKeyGetter(row, sourceIndex) の値を返します。
  getLabelRow?: (viewIndex: number) => GridLabelRow<T> | undefined;
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
  // 追加(SSRM 書き戻し): セル編集の書き戻し口です(任意)。指定するとセル編集(エディタ確定 /
  //   ペースト / Delete クリア / setValue / checkbox)が楽観更新つきでここへ届きます。
  //   resolve = 確定(rows を返せばサーバー確定行をキャッシュへマージ)/ reject = ロールバック
  //   (グリッドが編集前の値へ自動で戻します)。未指定なら SSRM では編集が従来どおり無効です。
  updateRows?: (
    params: ServerSideUpdateRowsParams<T>,
  ) => Promise<ServerSideUpdateRowsResult<T> | void>;
  initialRowCount?: number;
  blockSize?: number;
  maxCachedBlocks?: number;
};

// 追加(SSRM 書き戻し): セル単位の変更内容です(columnKey は GridColumn.key)。
//   previousValue は「直前に表示されていた値」(確定済み or 先行する楽観値)です。
export type ServerSideCellChange = {
  columnKey: string;
  previousValue: unknown;
  newValue: unknown;
};

// 追加(SSRM 書き戻し): updateRows へ渡す行単位の更新記述子です。同一行への複数セル変更
//   (ペースト等)は 1 エントリに集約されます。rowIndex は view 空間(フィルター/ソート適用後)、
//   row は楽観更新後の行、previousRow は更新前の行です。
export type ServerSideRowUpdate<T> = {
  rowKey: GridRowKey;
  rowIndex: number;
  row: T;
  previousRow: T;
  changes: ServerSideCellChange[];
};

// 追加(SSRM 書き戻し): updateRows の引数です。1 回のユーザー操作 = 1 呼び出しに束ねます。
export type ServerSideUpdateRowsParams<T> = {
  updates: ServerSideRowUpdate<T>[];
};

// 追加(SSRM 書き戻し): updateRows の戻り値です。rows を返す場合は updates と同順・同長で
//   「サーバー確定後の行」を返してください(サーバー計算列の反映用にキャッシュへマージされます)。
//   void / rows 省略は「楽観値をそのまま確定」を意味します。
export type ServerSideUpdateRowsResult<T> = {
  rows?: T[];
};

// 追加(batch 9): getRows 失敗通知(onServerSideLoadError)のパラメータです。失敗した要求の
//   view 空間レンジ([startIndex, endIndex)・end 排他)を渡します。error は getRows の reject 値
//   そのもの(unknown)で、コールバック第 1 引数に載せます(abort は失敗扱いにしません)。
export type ServerSideLoadErrorParams = {
  startIndex: number;
  endIndex: number;
};

// 追加(SSRM 書き戻し): updateRows 失敗通知(onServerSideWriteError)のパラメータです。
//   updates は失敗した updateRows 呼び出しへ渡した行更新(グリッド側はロールバック済み)です。
//   error は updateRows の reject 値そのもの(unknown)で、コールバック第 1 引数に載せます。
export type ServerSideWriteErrorParams<T> = {
  updates: ServerSideRowUpdate<T>[];
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

// 追加(undo/redo 通知): onUndoRedoStateChange の通知ペイロードです。
export type UndoRedoState = {
  canUndo: boolean;
  canRedo: boolean;
};

// 追加: Grid の選択状態です。初版は cell selection を主対象にします。
export type GridSelection =
  | { type: 'cell'; range: CellRange }
  | { type: 'row'; startRow: number; endRow: number }
  | { type: 'col'; startCol: number; endCol: number }
  | null;

// 追加(行選択): チェックボックス行選択の内部状態です(セル範囲選択 GridSelection とは別レイヤー)。
//   参照性能を落とさないため判定は Set の O(1)、「全選択」は exclude モード(除外集合)で
//   キーを materialize せずに表現します。純ロジックは logic/rowSelection.ts。
//   mode 'include': keys は選択キー集合 / mode 'exclude': keys は除外キー集合(全選択の裏)。
export type RowSelectionState = {
  mode: 'include' | 'exclude';
  keys: ReadonlySet<GridRowKey>;
};

// 追加(行選択): 公開の行選択記述子です(controlled prop rowSelection /
//   onRowSelectionChange / handle でやり取り)。exclude を素直に表現できるため、
//   controlled でも全選択をキー列挙せずに扱えます。
export type RowSelectionModel =
  | { type: 'include'; rowKeys: GridRowKey[] }
  | { type: 'exclude'; rowKeys: GridRowKey[] };

// 追加(行選択): 行選択モードです。'single'=単一 / 'multiple'=複数(既定)。
export type RowSelectionMode = 'single' | 'multiple';

// 追加(行選択): ヘッダ全選択チェックの 3 状態です。
export type SelectAllState = 'none' | 'some' | 'all';

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

// 追加(async-options): set / select / 複合(numberSet / textSet / dateSet)の候補を利用側から非同期に
//   供給するコールバック(グリッド prop getFilterOptions)の引数 / 戻り値です。popover を開くたびに呼ばれ、
//   閉じる / 列切替で signal が abort されます(ライブラリはキャッシュを持たない。必要なら利用側で
//   columnKey + columnFilters をキーに Promise を保持する)。
export type GetFilterOptionsParams<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  columnKey: string;
  column: GridColumn<T, F>;
  // 開いている列を除いた、他列の有効な列フィルター(Excel と同じく候補を他列の条件で絞るための材料)。
  columnFilters: Record<string, ColumnFilterValue>;
  globalText: string;
  signal: AbortSignal;
};

export type GetFilterOptionsResult = {
  // value は記述子の values にそのまま載る文字列。dateSet 列は 'YYYY-MM-DD'、空白(NULL)は '' を渡す。
  options: GridSelectFilterOption[];
  // 件数上限で打ち切ったら true(popover に「先頭のみ」の注記が出る。反転 = NOT IN で候補外の値も扱える)。
  truncated?: boolean;
};

// 追加(filter-ext E): フィルター popover が実際に描画する UI 種別です('auto' を含まない
//   「解決済み」の型)。column.filterType が 'auto' のときは開いた時点で本型のいずれかへ
//   解決され(logic/inferFilterType.ts)、以降の popover / 候補収集 / commit 経路は
//   すべて解決済みの値で分岐します。
export type ColumnFilterUiType =
  | 'text'
  | 'textSet'
  | 'number'
  | 'numberSet'
  | 'date'
  | 'dateSet'
  | 'select'
  | 'set'
  | 'custom';

// 追加(filter-ext E): 列定義で指定できるフィルター種別です。'auto' は列の値(と editor 種別)
//   から numberSet / textSet / dateSet を自動判定する opt-in オプションで、判定は
//   「popover を初回に開いた時点」で 1 回だけ行われ、以後その列では固定されます
//   (適用済みフィルター値がある列は、その記述子の kind が優先されます)。
export type ColumnFilterTypeOption = ColumnFilterUiType | 'auto';

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
// 変更(filter-ext A): 演算子セレクト UI 化に伴い '!='(等しくない)と blank / notBlank
//   (空白 / 空白でない)を追加しました。いずれも判別共用体への追加拡張のため、
//   保存済みの旧値(comparison / range のみ)はそのまま読めます(後方互換)。
export type ParsedNumberFilter =
  | {
      mode: 'comparison';
      operator: '>' | '>=' | '<' | '<=' | '=' | '!=';
      value: number;
    }
  | {
      mode: 'range';
      min: number;
      max: number;
    }
  | {
      mode: 'blank';
    }
  | {
      mode: 'notBlank';
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

// 追加(filter-ext B): 「条件 AND 選択」複合フィルター(AG Grid の Multi Filter 相当)の
//   記述子です。1 つの popover に条件(述語)と値(Set 一覧)を縦に並べ、AND で結合します。
//   - condition: 数値条件(ParsedNumberFilter)。null = 条件なし。
//   - set      : Set 選択(形は SetColumnFilterValue と同じ mode + values)。null = 全選択。
//   condition と set が両方 null の状態は保存せず clearColumn へ正規化します(commit 側の責務)。
//   条件を変えても set の選択は破棄されません(候補外の値の選択も保持し、条件を戻せば復活)。
export type NumberSetColumnFilterValue = {
  kind: 'numberSet';
  condition: ParsedNumberFilter | null;
  set: {
    mode?: 'include' | 'exclude';
    values: string[];
  } | null;
};

// 追加(filter-ext C): テキスト条件の解釈結果です(ParsedNumberFilter のテキスト版)。
//   value は trim 済み・判定は大文字小文字無視(既存 text フィルターの contains と同じ規則)。
//   Set の検索欄は「候補を選ぶための絞り込み」で述語として残らないため、「含む」等を
//   述語として保持したい場合はこちら(条件欄)を使います(引き継ぎ §3.3)。
export type ParsedTextFilter =
  | {
      mode: 'contains' | 'equals' | 'startsWith' | 'endsWith';
      value: string;
    }
  | {
      mode: 'blank';
    }
  | {
      mode: 'notBlank';
    };

// 追加(filter-ext C): テキスト列の「条件 AND 選択」複合フィルターです(numberSet の
//   テキスト版。構造・正規化・選択保持の規約は NumberSetColumnFilterValue と同一)。
export type TextSetColumnFilterValue = {
  kind: 'textSet';
  condition: ParsedTextFilter | null;
  set: {
    mode?: 'include' | 'exclude';
    values: string[];
  } | null;
};

// 追加(filter-ext D): 相対日付プリセットです。合意済み仕様: 相対のまま保存し、フィルター
//   評価時に「今日」を基準へ解決します(翌日開くと範囲が追従する)。絶対日付へ固定したい
//   場合は range 等の絶対条件を使います。
export type DateFilterPreset = 'today' | 'thisMonth' | 'last30days';

// 追加(preset-opt): カスタムプリセットの resolve が返す絶対範囲です。両端は含みます。
//   'YYYY-MM-DD' 文字列か Date を受け付け、片側のみなら 以降 / 以前 として評価されます
//   (両方 undefined は「条件なし」)。
export type DateFilterPresetRange = {
  from?: string | Date;
  to?: string | Date;
};

// 追加(preset-opt): 列定義で渡すカスタムプリセットです。id が保存値(相対のまま)になり、
//   評価のたびに resolve(now) で絶対範囲へ解決されます(ビルトインと同じ意味論)。
export type CustomDateFilterPreset = {
  id: string;
  label: string;
  resolve: (now: Date) => DateFilterPresetRange;
};

// 追加(preset-opt): GridColumn.dateFilterPresets の要素です
//   (ビルトイン ID の再利用 or カスタム定義)。
export type DateFilterPresetOption = DateFilterPreset | CustomDateFilterPreset;

// 追加(date-input): 日付入力スロット(SpreadsheetGridProps.renderFilterDateInput)の
//   描画コンテキストです。value は 'YYYY-MM-DD' か ''(未入力)。onChange には
//   'YYYY-MM-DD' 文字列のほか Date / null(クリア)/ 表記ゆれ文字列('2026/7/1' 等)を
//   渡せます(内部で正規化。日付として解釈できない値はクリア扱い)。
export type FilterDateInputContext = {
  value: string;
  onChange: (value: string | Date | null) => void;
  // '開始日' / '終了日' / '条件の日付'(既定 UI の aria-label と同じ文言)。
  ariaLabel: string;
  // 範囲の from / to か、単一値かの区別です(プレースホルダ等の出し分けに)。
  slot: 'single' | 'from' | 'to';
  // 対象列のキーです(列ごとに出し分けたい場合に)。
  columnKey: string;
};

// 追加(filter-ext D): 日付条件の解釈結果です。日付は 'YYYY-MM-DD'(ゼロ埋め ISO)へ正規化して
//   保持し、比較は文字列比較で行います(同形式なら辞書順 = 時系列順)。セル値の正規化は
//   logic/dateFilterCondition の toDateKey(解釈不可 = 比較不一致)が担います。
export type ParsedDateFilter =
  | {
      mode: 'range';
      from: string;
      to: string;
    }
  | {
      mode: 'onOrAfter' | 'onOrBefore' | 'equals' | 'notEquals';
      value: string;
    }
  | {
      mode: 'blank';
    }
  | {
      mode: 'notBlank';
    }
  | {
      mode: 'preset';
      // 変更(preset-opt): ビルトイン ID に加えカスタムプリセットの id も保存されるため
      //   string です(ビルトインは resolveDateFilterPreset、カスタムは列定義の resolve が
      //   評価時に解決します。列定義に無い ID は「条件なし」評価)。
      preset: string;
    };

// 追加(filter-ext D): 日付列の「条件 AND 選択」複合フィルターです。set.values は
//   セル生値ではなく **正規化済み日付キー('YYYY-MM-DD'。空白 = '' / 非日付 = 生値)** です
//   (popover の年月日ツリーが日付キー単位で選択するため。判定側もキー変換して照合します)。
export type DateSetColumnFilterValue = {
  kind: 'dateSet';
  condition: ParsedDateFilter | null;
  set: {
    mode?: 'include' | 'exclude';
    values: string[];
  } | null;
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
  | NumberSetColumnFilterValue
  | TextColumnFilterValue
  | TextSetColumnFilterValue
  | DateColumnFilterValue
  | DateSetColumnFilterValue
  | SelectColumnFilterValue
  | CustomColumnFilterValue;

// 追加: セル描画に渡すコンテキストです。
// 追加(context 拡張): rowIndex は「ビュー行 index」(ソート / フィルター適用後の表示位置)で、
//   並べ替えで source と別空間になります。source 行基準の突き合わせ(例: getInvalidCells の
//   結果や外部のエラー行 index 集合との照合)には sourceRowIndex / rowKey を使ってください
//   (sourceRowIndex = 元 rows の index。serverSide では view 順が正準のため viewIndex と同値)。
export type CellRenderContext<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  row: T;
  rowIndex: number;
  sourceRowIndex: number;
  rowKey: GridRowKey;
  colIndex: number;
  value: unknown;
  column: GridColumn<T, F>;
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  readOnly: boolean;
  setValue: (value: unknown) => void;
  // 追加(detail ②): 展開行(detailRow prop)有効時のみ定義されます。任意の列の renderCell から
  //   自前のトグル UI を置くための口です(専用トグル列を使わない配置 = T2)。
  //   expandable が false の行では toggle / setExpanded は no-op です。
  detail?: CellDetailContext;
};

// 追加(detail ②): renderCell 側から展開行を操作するためのコンテキストです。
export type CellDetailContext = {
  // この行の展開行が開いているか。
  expanded: boolean;
  // この行が展開可能か(detailRow.isExpandable の判定結果。未指定なら常に true)。
  expandable: boolean;
  toggle: () => void;
  setExpanded: (expanded: boolean) => void;
};

// 追加(detail ②): 展開行(detail)のレンダラーへ渡すコンテキストです。
//   rowIndex はビュー行 index(CellRenderContext と同基準)、sourceRowIndex は元 rows の index。
export type DetailRowRenderContext<T> = {
  row: T;
  rowKey: GridRowKey;
  rowIndex: number;
  sourceRowIndex: number;
  // この展開行を閉じます(パネル内の「閉じる」ボタン等から)。
  collapse: () => void;
};

// 追加(detail ②): 展開行(Master/Detail)の設定です。SpreadsheetGrid の detailRow prop に渡した
//   ときだけ機能が有効になり、未指定なら既存の描画・状態・イベント経路は一切変わりません。
//   展開行は「マスター行の直下に続く全幅の帯」として、行の順序(view index)を変えずに
//   描画されます(行グルーピングとは別機能で、併用もできます。clientSide / serverSide 両対応)。
/**
 * 展開行(Master/Detail)の設定です(`detailRow` prop)。指定したときだけ機能が有効になります。
 *
 * 各フィールドの説明は React 版パッケージ `@ishibashi0112/spreadsheet-grid` に同梱の `API_REFERENCE.md`
 * の「展開行(Master/Detail)」節と同じ内容です。
 */
export type DetailRowOptions<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  // 展開行の中身を描画します。自前のサブグリッド / フォーム / 任意の React 要素を返せます。
  //   帯の内側(カード)に描画され、画面外へスクロールするとアンマウントされます
  //   (再表示時に再マウント。保持したい状態は消費側で rowKey をキーに持ってください)。
  /**
   * 展開行の中身。`ctx = { row, rowKey, rowIndex, sourceRowIndex, collapse }`(`rowIndex` はビュー行
   * index、`collapse()` はその展開行を閉じる)。帯の内側のカード要素(`.ssg-detail-card`、
   * `data-ssg-detail` 属性つき)に描画される。
   */
  render: (ctx: DetailRowRenderContext<T>) => F['node'];
  // 展開行の帯の高さ(px、既定 200)。固定高で、中身が超える場合はカード内でスクロールします。
  /**
   * 帯の高さ(px)。**固定高**で、中身が超えるとカード内でスクロールする(auto 高は非対応)。
   *
   * @defaultValue `200`
   */
  height?: number;
  // 行ごとに展開可否を決めます(未指定 = 全行展開可)。false の行はトグルが描画されず、
  //   命令的 API / ctx.detail からの展開も no-op です。
  /**
   * 行ごとの展開可否。`false` の行はトグルが描画されず、命令的 API / `ctx.detail.toggle()`
   * からの展開も no-op。
   *
   * @defaultValue 全行展開可
   */
  isExpandable?: (row: T, ctx: { rowKey: GridRowKey; sourceRowIndex: number }) => boolean;
  // 専用トグル列(幅 28px、行ヘッダーの右隣 = 先頭列)を自動挿入するか(既定 true)。
  //   false にした場合は renderCell の ctx.detail.toggle() で任意の列にトグルを置いてください。
  /**
   * 専用トグル列(幅 28px・タイトル無し、行ヘッダーの右隣 = 先頭列。左固定列があるときは左固定側)
   * を自動挿入する。`false` にすると列は挿入されず、任意の列の `renderCell` から
   * `ctx.detail.toggle()` でトグルを自前配置する(下記)。
   *
   * @defaultValue `true`
   */
  showToggleColumn?: boolean;
  // 帯の内側のカード要素(data-ssg-detail を持つ境界要素)へ追加する className。
  // 変更(slot-props): `{ className, style }` 形(StyleX の stylex.props() 戻り値)も受けます。
  /**
   * カード要素へ追加する class(または `{ className, style }`。`classNames.detailCard`
   * に加えて付与)。
   */
  className?: GridSlotProps<F>;
};

// ── 追加(label-row ①): ラベル行(見出し / 区切り行)──
//   rows 配列の中で labelRow.isLabelRow(row) が true を返す行を「ラベル行」として扱います。ラベル行は
//   データ行ではなく(行数に数えず、編集 / 選択 / コピー / エクスポートの既定対象外)、置いた位置の
//   見出しとして 3 ペインを跨ぐ 1 本の帯で描画されます。行グルーピング(rowGroup)とは別機能で、
//   集計 / ツリー / 開閉は持ちません(併用不可: rowGroup 有効時はラベル行を非表示にします)。
//   ソート / フィルター時の扱いは LabelRowSortMode を参照(既定 'section' = ラベル行から次のラベル行
//   までを 1 区間とみなし、並べ替えは区間内で行う)。
export type LabelRowSortMode =
  // ラベル行をセクション境界として扱い、並べ替えは各セクションの中だけで行います(境界は動かない)。
  //   フィルターで中身が 0 件になったセクションはラベルごと消えます(keepEmptySections で残せる)。
  | 'section'
  // 全体を並べ替え、ラベル行は「元のセクションの先頭に来るデータ行」の直前に付いて移動します。
  //   中身が 0 件になったセクションのラベルは消えます(keepEmptySections で末尾側にまとめて残せる)。
  | 'follow'
  // ソート / フィルター適用中はラベル行を表示しません(行ドラッグと同じ割り切り)。
  | 'hide';

// ラベル行の公開記述子です(rowModel.getLabelRow が返す型)。
export type GridLabelRow<T> = {
  kind: 'label';
  // ラベル行そのもの(rows 配列の要素)。
  row: T;
  // 元 rows の index です。
  sourceIndex: number;
  // 表示文字列(labelRow.getLabel(row))。
  label: string;
  // このセクション(次のラベル行まで)のデータ行数(フィルター後・表示中の件数)。
  //   serverSide(SSRM)では区間を数えられないため undefined です。
  sectionRowCount: number | undefined;
};

// ラベル行のレンダラー(labelRow.render)へ渡すコンテキストです。rowIndex はビュー行 index
//   (CellRenderContext と同基準)、sourceRowIndex は元 rows の index。
export type LabelRowRenderContext<T> = {
  row: T;
  rowKey: GridRowKey;
  rowIndex: number;
  sourceRowIndex: number;
  // labelRow.getLabel(row) の値です。
  label: string;
  // このセクションのデータ行数(GridLabelRow.sectionRowCount と同じ。SSRM では undefined)。
  sectionRowCount: number | undefined;
};

// ラベル行の設定です。SpreadsheetGrid の labelRow prop に渡したときだけ機能が有効になり、未指定なら
//   既存の描画・状態・イベント経路は一切変わりません。clientSide / serverSide 両対応(serverSide では
//   サーバーがブロック内にラベル行を含めて返し、totalRowCount にも数えます。並べ替えはサーバー責務)。
/**
 * ラベル行(見出し / 区切り行)の設定です(`labelRow` prop)。指定したときだけ機能が有効になります。
 *
 * 各フィールドの説明は React 版パッケージ `@ishibashi0112/spreadsheet-grid` に同梱の `API_REFERENCE.md`
 * の「ラベル行(見出し / 区切り行)」節と同じ内容です。
 */
export type LabelRowOptions<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  // ラベル行の識別です(必須)。true を返した行をラベル行として扱います。sourceIndex は元 rows の index。
  //   rows / 本関数の参照が変わったときに全行を 1 パス評価するため、純粋・軽量であること。
  /**
   * ラベル行の識別。`rows` / 本関数が変わったときに全行を 1 パス評価するため純粋・軽量であること。
   */
  isLabelRow: (row: T, sourceIndex: number) => boolean;
  // 表示文字列です(必須)。既定描画(render 未指定時)/ エクスポート / aria-label に使います。
  /** 表示文字列。既定描画(`render` 未指定時)/ エクスポート / `aria-label` に使う。 */
  getLabel: (row: T) => string;
  // ラベル行の中身を任意の描画ノードで差し替えます(装飾)。未指定なら getLabel の文字列を既定スタイルで
  //   表示します。中身は中央ペインに描画され、横スクロールしてもビューポート左端(左固定ペインの右隣)に
  //   留まります(展開行カードと同じ機構)。
  /**
   * 中身の React 描画(装飾)。
   * `ctx = { row, rowKey, rowIndex, sourceRowIndex, label, sectionRowCount }`(`sectionRowCount`
   * はフィルター後のセクション内データ行数。serverSide では `undefined`)。
   */
  render?: (ctx: LabelRowRenderContext<T>) => F['node'];
  // ラベル行の高さ(px)。未指定は rowHeight(データ行と同じ)。行ごとに変えるときは関数を渡します。
  /**
   * ラベル行の高さ(px)。行ごとに変えるときは関数。
   *
   * @defaultValue `rowHeight`
   */
  height?: number | ((row: T) => number);
  // ラベル行の行要素へ追加する className(または { className, style })。classNames.labelRow に加えて付与。
  /** 行要素へ追加する class(または `{ className, style }`)。`classNames.labelRow` に加えて付与。 */
  className?: GridSlotProps<F> | ((row: T) => GridSlotProps<F> | undefined);
  // 縦スクロール中、現在のセクションのラベル行を列ヘッダー直下に固定表示します(既定 false)。
  //   次のラベル行が到達すると押し上げられて交代します。
  /**
   * 縦スクロール中、現在セクションのラベル行を列ヘッダー直下に固定する。
   * 次のラベル行が到達すると押し上げられて交代する(clientSide のみ)。
   *
   * @defaultValue `false`
   */
  sticky?: boolean;
  // ソート / フィルター適用時のラベル行の扱いです(既定 'section')。
  /**
   * ソート / フィルター適用時の扱い(下記)。
   *
   * @defaultValue `'section'`
   */
  sortMode?: LabelRowSortMode;
  // フィルターで中身が 0 件になったセクションのラベル行を残すか(既定 false)。
  /**
   * フィルターで中身が 0 件になったセクションのラベル行を残す。
   *
   * @defaultValue `false`
   */
  keepEmptySections?: boolean;
  // エクスポート(includeLabelRows: true)時のラベル行の出力値です。文字列なら先頭列に置き他列は空、
  //   配列なら列順(エクスポート列の並び)にそのまま並べます。未指定は getLabel(row) を先頭列へ。
  /**
   * エクスポート(`includeLabelRows: true`)時の出力値。文字列は先頭列(他列は空)、
   * 配列は列順にそのまま。
   *
   * @defaultValue `getLabel` を先頭列へ
   */
  exportText?: (row: T) => string | ReadonlyArray<string | number | null | undefined>;
};

// 追加(row-drag ③): 行ドラッグ並び替え(enableRowDrag)の行ごとの可否判定(isRowDraggable)へ
//   渡すコンテキストです。sourceRowIndex は元 rows の index。
export type RowDragContext = {
  rowKey: GridRowKey;
  sourceRowIndex: number;
};

// 追加(row-drag ③): 行移動の確定通知(onRowMove)のパラメータです。fromIndex / toIndex は
//   元 rows 配列の index(ドラッグは表示順が恒等のときだけ許可されるため view index とも一致)。
//   rows は移動後の新配列で、直前に onRowsChange へ渡したものと同じ参照です。
export type RowMoveParams<T> = {
  rowKey: GridRowKey;
  fromIndex: number;
  toIndex: number;
  rows: T[];
};

// 追加(UI CSS移行): 条件付きセル className(GridColumn.cellClassName)の関数版へ渡す
//   コンテキストです。CellRenderContext から setValue を除いた読み取り専用版で、
//   className 算出に副作用(setValue)は不要なため値解決(getCellValue)のみを伴います。
//   rowIndex(view)と sourceRowIndex(source)の違いは CellRenderContext の注記を参照。
export type CellStyleContext<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  row: T;
  rowIndex: number;
  sourceRowIndex: number;
  rowKey: GridRowKey;
  colIndex: number;
  value: unknown;
  column: GridColumn<T, F>;
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  readOnly: boolean;
};

// 追加(proposals ⑤): 条件付き行 className(getRowClassName)の第 3 引数コンテキストです。
//   rowIndex(view)と sourceRowIndex(source)の違いは CellRenderContext の注記を参照
//   (getInvalidCells() の返す sourceRowIndex / rowKey と同一基準)。
//   isSelected はチェックボックス行選択(enableRowSelection)の選択状態です(範囲選択とは別)。
//   注記: グループ行(grouping 有効時)は専用描画のため getRowClassName の対象外です
//   (本コンテキストにグループ行フラグは持ちません)。
export type RowStyleContext<T> = {
  row: T;
  rowIndex: number;
  sourceRowIndex: number;
  rowKey: GridRowKey;
  isSelected: boolean;
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
export type HeaderRenderContext<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  colIndex: number;
  width: number;
  column: GridColumn<T, F>;
  filterValue?: unknown;
  isFiltered?: boolean;
};

// 追加(10-A): AG Grid 互換の列固定方向型です。
//             'left' = 左固定、'right' = 右固定、undefined = 固定なし（中央スクロール）。
export type GridColumnPinned = 'left' | 'right';

// 追加(③): セル表示値の整形関数の契約です(UI 表示のみ)。組み込みは logic/valueFormatters.ts に集約し、
//   利用側も同じ契約で自作できます(将来パターン追加=ファクタ追加 + バレル公開で拡張)。
export type CellValueFormatterParams<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  value: unknown;
  row: T;
  column: GridColumn<T, F>;
};
export type CellValueFormatter<T, F extends GridFrameworkTypes = GridFrameworkTypes> = (params: CellValueFormatterParams<T, F>) => string;

// 追加(editor 基盤): editor 確定後の移動方向です(Enter=down / Tab=right / Shift+Tab=left)。
//   CellEditorLayer.tsx から移設しました(エディタ種別 API の公開型化に伴い model へ集約)。
// 変更(enter-move ②): 'up' を追加しました(editorEnterMove='up' の確定移動用。
//   custom エディタの ctx.commit からも指定できます)。
export type EditorCommitDirection = 'down' | 'up' | 'right' | 'left';

// 追加(enter-move ②): 組み込みエディタの Enter 確定後にアクティブセルをどこへ移すかです
//   (Excel の「Enter キーを押したら、セルを移動する(方向)」相当)。'none' は移動せず
//   その場に留まります。Tab / Shift+Tab(右 / 左)には影響しません。
export type EditorEnterMove = 'down' | 'up' | 'right' | 'left' | 'none';

// 追加(editor: select): select エディタの候補型です。select / set フィルターの候補
//   (GridSelectFilterOption)と共有し、同じ配列を filterOptions と使い回せます。
export type GridSelectEditorOption = GridSelectFilterOption;

// 追加(editor 基盤): 列のセルエディタ種別です(判別キーは type。ColumnFilterValue の kind と
//   同じ判別共用体の流儀で、種別ごとの付随オプションを型で強制します)。未指定は text と同じ
//   既定エディタです。種別は段階的に追加します(date / checkbox / custom は後続)。
export type GridColumnEditor<T, F extends GridFrameworkTypes = GridFrameworkTypes> =
  | { type: 'text' }
  | {
      // 数値エディタ(<input type="number">)。min / max / step はネイティブ属性へ反映します。
      //   既定パーサ: '' → null / 数値文字列 → number / 非数値 → 生文字列のまま
      //   (parseClipboardValue 明示指定が常に優先。logic/editorValues.ts 参照)。
      type: 'number';
      min?: number;
      max?: number;
      step?: number;
    }
  | {
      // select エディタ(候補ドロップダウン)。候補は静的配列 or 行依存の動的関数で指定します
      //   (動的関数はレンダー中に呼ばれるため純粋であること)。確定値は option.value(string)を
      //   列パーサへ流します(候補は「許可される値」なので rows からの自動収集はしません)。
      type: 'select';
      options:
        | GridSelectEditorOption[]
        | ((row: T) => GridSelectEditorOption[]);
    }
  | {
      // 日付エディタ(ネイティブ <input type="date">)。ドラフトは 'YYYY-MM-DD' | ''。
      //   既定パーサ: '' → null / 日付として解釈可能な文字列 → 'YYYY-MM-DD' へ正規化 /
      //   解釈不可 → 生文字列のまま(logic/editorValues.ts の toDateInputValue 参照)。
      type: 'date';
    }
  | {
      // checkbox エディタ(直接トグル方式)。編集セッションを開かず、クリック / Space で即トグル
      //   します(ダブルクリック / Enter / F2 でもエディタは開きません)。renderCell 未指定時は
      //   組み込みのチェックボックスセルを描画します(renderCell 指定時はそちらが優先)。
      //   checked 判定は Object.is(value, checkedValue) のみ、それ以外はすべて unchecked 扱い。
      type: 'checkbox';
      checkedValue?: unknown; // 既定 true
      uncheckedValue?: unknown; // 既定 false
    }
  | {
      // カスタムエディタ。render(ctx) の返り値を編集セルのオーバーレイ内に描画します。
      //   フォーカス管理・キーバインド(Enter / Tab / Esc)は consumer 側の責務で、確定 /
      //   キャンセルは ctx.commit / ctx.cancel を呼びます(組み込みの既定バインドは供給しません)。
      type: 'custom';
      render: (ctx: CellEditorContext<T, F>) => F['node'];
    };

// 追加(editor: custom): custom エディタの render へ渡すコンテキストです。
export type CellEditorContext<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  row: T;
  // ビュー行 index(ソート / フィルター適用後)です。
  rowIndex: number;
  // 追加(context 拡張): source 行 index(元 rows の index)と行キーです。ソート / フィルター
  //   に依らず安定な行参照が要る場合はこちらを使います(CellRenderContext の注記と同じ規則)。
  sourceRowIndex: number;
  rowKey: GridRowKey;
  // 論理列 index(視覚順)です。
  colIndex: number;
  column: GridColumn<T, F>;
  // 編集開始時のセル生値です。
  value: unknown;
  // 印字キー開始時はそのキー 1 文字 / それ以外は String(value ?? '') です。
  initialText: string;
  align?: 'left' | 'center' | 'right';
  // 確定します。string は列パーサ(parseClipboardValue ?? editor 既定)を通し、非 string は
  //   ドメイン値としてそのまま書き込みます(パースのバイパス)。返り値で reject 列の検証結果
  //   (rejected)を受け取れます(無視しても安全 — その場合は編集継続になるだけです)。
  commit: (
    value: unknown,
    direction?: EditorCommitDirection,
  ) => EditorCommitResult;
  cancel: () => void;
};

// 追加(validation): セル編集バリデーションの動作モードです。
//   'mark'(既定): 検証 NG でも値は書き込み、セルに invalid 表示 + メッセージツールチップを出します
//     (ペースト / クリア / 初期データ / undo 復元後も rows と常に整合する表示時導出)。
//   'reject': 検証 NG の書き込み自体を拒否します(エディタ commit は確定拒否・編集継続、
//     ペースト / クリアは該当セルのみスキップ、renderCell setValue / checkbox トグルは no-op)。
export type GridValidationMode = 'mark' | 'reject';

// 追加(validation): validate へ渡す検証コンテキストです。row は書き込み前の行です
//   (ビュー index はソート / フィルターで不安定なため渡しません)。
export type CellValidationContext<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  value: unknown;
  row: T;
  column: GridColumn<T, F>;
};

// 追加(validation): validate の返り値です。true = 有効 / false = 無効(既定メッセージ)/
//   string・{ message } = 無効 + メッセージ。
export type CellValidationResult = boolean | string | { message: string };

// 追加(validation): getInvalidCells が返す invalid セルの記述子です(source 行基準)。
export type GridInvalidCell = {
  rowKey: GridRowKey;
  sourceRowIndex: number;
  columnKey: string;
  message: string;
};

// 追加(validation): エディタ commit の結果です。'rejected' は reject 列の検証 NG
//   (確定拒否・エディタ継続)、'noop' は二重発火ガード等で何もしなかったことを表します。
export type EditorCommitResult =
  | { status: 'committed' }
  | { status: 'rejected'; message: string }
  | { status: 'noop' };

// 追加(grouping ①): 行グルーピングの組み込み集計関数名です(GridColumn.aggFunc の文字列指定)。
export type GridAggFuncName = 'sum' | 'min' | 'max' | 'avg' | 'count';

// 追加(grouping ①): カスタム集計関数の引数です。values はグループ配下 leaf の当該列セル値
//   (getValue 経由)、rows は同じ leaf 行の並びです(いずれもソート適用後の表示順)。
export type GridAggFuncParams<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  values: unknown[];
  rows: T[];
  column: GridColumn<T, F>;
};

// 追加(grouping ①): カスタム集計関数です。返り値がグループ行の当該列セルに表示されます。
//   グループツリー再構築(rows / order / 対象列の変化)のたびに全グループぶん呼ばれるため、
//   純粋・軽量であること(cellClassName 関数と同じコスト階級)。
export type GridAggFunc<T, F extends GridFrameworkTypes = GridFrameworkTypes> = (params: GridAggFuncParams<T, F>) => unknown;

// 追加(grouping ①): グループ行の公開記述子です。行グルーピング有効時、ビュー行は
//   「leaf 行(従来どおり)or グループ行」になり、グループ行はこの形で表現されます
//   (rowModel.getGroupRow が返す型。leaf 行アクセサ getRow / getSourceIndex はグループ行の
//   viewIndex に対して undefined を返します)。
export type GridGroupRow = {
  kind: 'group';
  // 階層パスを一意に表す開閉状態キーです(列 key + 値の型タグ付き文字列表現を階層連結)。
  //   値ベースのため、データ再取得(行オブジェクト再生成)をまたいで安定します。
  groupKey: string;
  // グループ元の列 key です。
  columnKey: string;
  // グループ値です(空白グループは null)。
  value: unknown;
  // 表示ラベルです(String(value)。空白グループは '(空白)')。
  label: string;
  // グループ階層です(最上位 0)。
  level: number;
  // 配下の leaf 行数です(子グループを再帰的に含む)。
  leafCount: number;
  // 列 key → 集計値です(aggFunc 指定列のみ。数値対象が 0 件の sum / avg / min / max は
  //   undefined = 空セル表示)。
  aggregates: Record<string, unknown>;
};

// 追加: 列定義です。将来のカスタムセル/カスタムヘッダー拡張を見据えています。
/**
 * 列定義です(`columns` prop の要素)。
 *
 * 各フィールドの説明は React 版パッケージ `@ishibashi0112/spreadsheet-grid` に同梱の `API_REFERENCE.md`
 * の「GridColumn props」表と同じ内容です。
 * 説明中の「〜節」「下記」は同ファイル内の節を指します。
 */
export type GridColumn<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  // 追加(非依存化 ⑤-1): 束ね型 F を推論可能にする型専用マーカーです(実行時には存在しません)。F は
  //   F['node'] / F['style'] の位置からは推論されないため、列(GridColumn<T, F>)を受け取る React 非依存の
  //   関数が呼び出し側の F(ReactGridTypes 等)をそのまま返せるよう、列型に F を直接載せます。
  /** 型推論用の内部マーカーです(実行時には存在しません)。指定しないでください。 */
  readonly __framework?: F;
  /** 列の一意キー。 */
  key: string;
  // 明確化(proposals ⑦-b): 未指定 / 空文字('')のときはヘッダー・列メニュー・フィルター
  //   パネル・CSV ヘッダー等の列名表示が key へフォールバックします(現状維持を仕様として明記)。
  //   見出しを空にしたい列は空白 1 文字(' ')等を指定してください。
  /**
   * ヘッダーの表示ラベル。**未指定 / 空文字(`''`)のときは `key` を表示**(列メニュー /
   * フィルターパネル / CSV ヘッダー等の列名表示も同じフォールバック)。
   * ボタン専用列などで見出しを空にしたい場合は空白 1 文字(`' '`)等を指定する。
   */
  title?: string;
  /** 列幅(px)。 */
  width: number;
  /** リサイズ時の下限幅。flex 配分時の下限クランプにも使用(flex 列で未指定なら内部既定 50px)。 */
  minWidth?: number;
  /**
   * 上限幅。**未指定なら上限なし**(autoSize は内容にぴったり合わせ、
   * 手動リサイズも自由に広げられます。既定の上限は設けません)。指定すると autoSize / 手動リサイズ /
   * flex 配分の上限クランプに使われます。
   */
  maxWidth?: number;
  // 追加: 折り返し時(= autoHeight 列)の CSS word-break です。'auto-phrase' は Chromium(Chrome / Edge)で
  //   BudouX による文節折り返しを行います(Firefox / 一部 Safari は未対応)。nowrap(非 autoHeight)列では
  //   折り返し自体が起きないため視覚的効果はありません。既定は未指定(ブラウザ標準 = 禁則つき文字折り返し)。
  /**
   * 折り返し時(= `autoHeight` 列)の CSS `word-break`。`'auto-phrase'` は Chromium(Chrome / Edge)で
   * BudouX による文節折り返し(Firefox / 一部 Safari 未対応)。**nowrap(非 `autoHeight`)
   * 列では折り返し自体が起きないため効果なし**。既定(未指定)はブラウザ標準=禁則つき文字折り返し。
   * 詳細は「日本語テキストの折り返し」節。
   */
  wordBreak?: 'normal' | 'break-all' | 'keep-all' | 'break-word' | 'auto-phrase';
  // 追加: 折り返し時の CSS line-break です(禁則処理の強さ)。'strict' で禁則を厳格化します。既定は未指定。
  /**
   * 折り返し時の CSS `line-break`(禁則処理の強さ)。`'strict'` で禁則を厳格化。`wordBreak` 同様、
   * 折り返す列でのみ効果あり。
   */
  lineBreak?: 'auto' | 'loose' | 'normal' | 'strict' | 'anywhere';
  // 追加(B3): JS 算出 flex(AG Grid の flex 相当)。center ペイン(非 pinned)の列でのみ有効で、
  //   「利用可能幅 − 固定列合計」を flex 比で配分します(min/max でクランプ)。pinned 列では無視されます。
  //   手動リサイズするとその列は固定 px に変わります(columns が変化するまで固定。以後は flex に復帰)。
  //   ※ 中身の長さに合わせて固定 px を決めたい場合は flex ではなく autoSize を使ってください(別概念)。
  /**
   * center 列(非 pinned)の伸縮比。余り幅(コンテナ幅 − 行ヘッダー − pinned 合計 − `width`
   * 固定列の合計)を flex 比で配分し `minWidth`/`maxWidth` でクランプ。
   * コンテナ追従でリアクティブに伸縮。手動リサイズで固定 px へ変化(その列の `flex` / `pinned` /
   * `width` 指定が変わるか列のリセットまで固定 → 以後 flex 復帰)。pinned 列では無視。
   * 詳細は下記「flex と autoSize」節。
   */
  flex?: number;
  // 追加(①): この列のリサイズ可否です。未指定時はグリッドの enableColumnResize を継承します
  //   (解決規則: column.resizable ?? enableColumnResize)。false でヘッダーのリサイズハンドルを
  //   描画しません(手動リサイズ不可)。
  /**
   * この列の手動リサイズ可否。`false` でヘッダーのリサイズハンドルを非表示。
   * リサイズハンドルの**ダブルクリック**でその列を内容幅へ autoSize(`false`
   * 時はハンドルが無いため不可。列メニューからの autoSize は引き続き可能)。
   *
   * @defaultValue グリッドの `enableColumnResize` を継承
   */
  resizable?: boolean;
  // 追加(②-S1): true の列を autoSize(列メニュー / ヘッダー境界ダブルクリック / すべての列の自動調整)の
  //   対象から除外し、consumer が指定した width を維持します(固定幅優先)。テキストで幅を測れない
  //   カスタムUI列(renderCell)や、固定幅で見せたい列に付ける per-column の opt-in です。
  //   未指定(undefined)は従来どおり autoSize 対象です(後方互換)。
  /**
   * `true` で autoSize の対象外(列メニュー / 境界ダブルクリック /
   * すべての列の自動調整すべてでスキップ)。consumer 指定の `width` を維持(固定幅優先)。
   * テキストで測れないカスタムUI列や固定で見せたい列向けの per-column opt-in。
   *
   * @defaultValue `false`
   */
  suppressAutoSize?: boolean;
  // 追加(②-S2): autoSize の幅見積もり関数です。指定すると、その列の autoSize は「セル内容の
  //   ピクセル幅(セルの padding / border を除く content 幅)」をこの関数から得て、全行の最大 +
  //   セル枠で確定します(テキスト計測 / 候補 / 実 DOM 計測は使いません)。テキスト長が実描画幅と
  //   相関しない renderCell カスタムUI列(例: 横並びのバッジ / チップ)向けの per-column opt-in です。
  //   未指定時は通常の 2 段計測(全行 canvas 候補 → 候補のみ実 DOM 実測)になります。
  /**
   * autoSize の幅見積もり。指定列は「セル内容の content 幅(px・セルの padding/border を除く)」
   * をこの関数から得て、**全行の最大 + セル枠**で確定します(テキスト/候補/実 DOM 計測を使わず、
   * React mount もしません)。テキスト長が実描画幅と相関しない renderCell
   * カスタムUI列(横並びバッジ等)向けの opt-in。返す値は `renderCell` の実描画幅と一致させること。
   */
  estimateCellWidth?: (row: T, column: GridColumn<T, F>) => number;
  // 追加(C1): true の列が auto-height 行の高さを駆動します(複数列指定時は max を採用)。
  //   グリッド props の autoHeight 有効時のみ効きます(無効時はこのフラグは無視)。
  /**
   * この列が auto-height 行の高さを駆動(グリッドの `autoHeight` 有効時のみ)。**autoSize
   * の対象外**(折り返し前提のため。下記「flex と autoSize」の制約を参照)。
   */
  autoHeight?: boolean;
  /**
   * 列の表示/非表示。非表示にしても、その列に載った列フィルター / ソートは行の絞り込み /
   * 並べ替えに効き続ける(クイックフィルター = グローバル検索は可視列のみが対象)。
   */
  visible?: boolean;
  /**
   * この列の編集可否。**未指定の列は編集可**で、`false` または `readOnly: true`
   * で編集不可になる(グリッド全体は `readOnly`、セル単位は `canEditCell`)。
   *
   * @defaultValue `true`(未指定 = 編集可)
   */
  editable?: boolean;
  /** この列を読み取り専用にする。 */
  readOnly?: boolean;
  // 追加(10-A): AG Grid 互換の列固定指定です。
  //             未指定 or undefined → 中央スクロール領域に配置されます。
  /**
   * 列固定の方向。
   *
   * @defaultValue undefined = 中央スクロール
   */
  pinned?: GridColumnPinned;
  // 追加(grouping ①): true でこの列を行グルーピングの対象にします。複数列指定時は columns
  //   配列内の出現順が階層順です。グルーピング有効時、この列は表示から自動的に外れ、先頭の
  //   自動グループ列(ツリー表示)へ集約されます。clientSide 行モデル限定で、SSRM
  //   (dataSource 指定時)では無効です(開発時警告)。
  /**
   * `true` でこの列を行グルーピングの対象にする(複数指定時は `columns` 配列の出現順が階層順)。
   * 有効時はグループ元列が表示から外れ、先頭に自動グループ列(ツリー表示)が注入される。**clientSide
   * 限定**(serverSide では無視 + 開発時警告)。詳細は「行グルーピング + 集計」節。
   */
  rowGroup?: boolean;
  // 追加(grouping ①): グルーピング時のこの列の集計です。組み込み(GridAggFuncName)または
  //   カスタム関数(GridAggFunc)。組み込みは値駆動の数値集計で、Number() 変換で有限に
  //   ならない値と空値(null / undefined / '')は対象外です(count のみ leaf 行数)。
  //   rowGroup 列がないときは無視されます。
  /**
   * グルーピング時のこの列の集計。組み込みは値駆動の数値集計(`Number()`
   * で有限になる値のみ対象・空値除外、`count` は配下 leaf 行数)。
   * 関数でカスタム集計可(返り値がグループ行に表示)。`rowGroup` 列がないときは無視。
   */
  aggFunc?: GridAggFuncName | GridAggFunc<T, F>;
  /**
   * 値アクセサ。
   *
   * @defaultValue `row[key]`
   */
  getValue?: (row: T) => unknown;
  /** 値ライター(新しい行を返す)。 */
  setValue?: (row: T, value: unknown) => T;
  /**
   * カスタムセル描画。
   *
   * @defaultValue プレーン `<span>`
   */
  renderCell?: (ctx: CellRenderContext<T, F>) => F['node'];
  // 追加(UI CSS移行): セルへ付与する追加 className(条件付きスタイル)。文字列 or 関数。
  //   関数版は CellStyleContext を受け取り、値や状態に応じてクラスを返せます(例: Tailwind)。
  //   基底クラス(.ssg-body-cell)は @layer ssg-base のため、ここで返したクラスが特異度を
  //   気にせず背景等を上書きできます(選択 / アクティブは別オーバーレイなので共存します)。
  // 変更(slot-props): 文字列に加えて `{ className, style }` 形(StyleX の stylex.props() 戻り値)も
  //   受けます(関数版も同じ形を返せます)。style はセル要素へインラインで付与され、座標 / 寸法
  //   (left / width / height 等)はグリッドが後勝ちで上書きします。
  /**
   * セルへ付与する追加 class(条件付きスタイル)。`GridSlotProps` = `string | { className?, style? }`
   * で、StyleX の `stylex.props(...)` をそのまま返せる(`style` はセルへインライン付与。座標 /
   * 寸法はグリッドが後勝ち)。関数版は値 / 状態に応じて返せる。`ctx` には view の `rowIndex` に加え
   * source 基準の `sourceRowIndex` / `rowKey` が入る(ソート / フィルター ON でも source
   * 行基準のデータと突き合わせ可能。「補助型」節参照)。基底 `.ssg-body-cell` は未レイヤー・特異度
   * (0,1,0)。確実な上書きは `.ssg-body-cell.my-class` の連結を推奨。
   */
  cellClassName?:
    | GridSlotProps<F>
    | ((ctx: CellStyleContext<T, F>) => GridSlotProps<F> | undefined);
  // 追加(G-3): セルのメモ(FarPoint SPREAD のセルメモ / Excel のメモ相当)。文字列を返したセルに右上の印
  //   (.ssg-body-cell--has-note。色は --ssg-note-indicator)を出し、マウスを乗せるとその文字列を既存のカスタム
  //   ツールチップ(data-ssg-tooltip)で表示します(\n で改行)。入力エラー(validate の mark)と同じセルでは
  //   「エラー → 改行 → メモ」の順につなぎます。描画中のセルだけ評価します(cellClassName の関数版と同コスト階級)。
  //   CSV / TSV / クリップボード / getExportData には含めません。
  /**
   * セルのメモ(FarPoint SPREAD のセルメモ / Excel のメモ相当)。文字列を返したセルの右上に印(10px
   * の三角。色はトークン `--ssg-note-indicator`)を出し、
   * マウスを乗せるとその文字列をツールチップで表示する(`\n` で改行)。`undefined` / `null` /
   * 空文字(空白だけを含む)なら何も出さない。`ctx` は `cellClassName` の関数版と同じ。
   * 入力エラー(`validate` の mark)と同じセルでは、エラーの 6px
   * の赤い三角がメモの三角の上に重なって両方見え、ツールチップは「エラー → 改行 → メモ」の順。
   * 描画中のセルだけ評価する(`cellClassName` 関数と同じコスト階級)。CSV / TSV / クリップボード /
   * `getExportData` には含めない。詳細は「セルのメモ(`cellNote`)」節。
   */
  cellNote?: (ctx: CellStyleContext<T, F>) => string | null | undefined;
  // 追加(③): セル内容の水平寄せ(UI 表示のみ・元の値は不変)。未指定は左。
  //   セル表示と編集 input の双方へ反映します(renderCell 指定時もセルコンテナへ適用)。
  /**
   * セル内容の水平寄せ(UI 表示のみ・元の値は不変)。セル表示と編集 input に反映。
   *
   * @defaultValue `'left'`
   */
  align?: 'left' | 'center' | 'right';
  // 追加(③): セル表示値の整形(UI 表示のみ・元の値/編集/コピー/ソート/フィルターに影響しません)。
  //   renderCell 未指定の既定セルが本関数の返り値を表示します(renderCell 指定時は無視)。
  //   組み込みの numberFormatter 等を渡せます(バレルから公開)。
  /**
   * セル表示値の整形(UI 表示のみ)。`renderCell` 未指定の既定セルが返り値を表示。組み込み
   * `numberFormatter` 等を渡せる。元の値/編集/コピー/ソート/フィルターには影響しない。
   */
  valueFormatter?: CellValueFormatter<T, F>;
  /** カスタムヘッダー描画。 */
  renderHeader?: (ctx: HeaderRenderContext<T, F>) => F['node'];
  // 変更(12-A): 'set' を追加します。AG Grid の Set Filter 相当
  //             (チェックボックス一覧 + 検索 + Select All)の UI になります。
  // 変更(filter-ext B): 'numberSet' を追加します。数値条件(演算子 + 値)と Set 一覧を
  //             1 つの popover に縦に並べて AND 結合する複合フィルターです。条件を適用すると
  //             Set 候補が条件を満たす値だけに連動して絞られます。
  // 変更(filter-ext C): 'textSet' を追加します(numberSet のテキスト版。演算子は
  //             含む / 等しい / 始まる / 終わる / 空白 / 空白でない)。
  // 変更(filter-ext D): 'dateSet' を追加します(日付版。条件は 範囲 / 以降 / 以前 / 等しい /
  //             等しくない / 空白 / 空白でない + 相対プリセット(今日 / 今月 / 過去 30 日)。
  //             Set 部分は年 / 月 / 日の 3 階層ツリーになります)。
  // 変更(filter-ext E): 'auto' を追加します(列の値から numberSet / textSet / dateSet を
  //             自動判定。詳細は ColumnFilterTypeOption / logic/inferFilterType.ts)。
  /**
   * フィルター UI の種別。`'auto'` は列の値から `numberSet` / `textSet` / `dateSet` を自動判定する
   * opt-in(下記「filterType: 'auto'(自動判定)」節)。`'numberSet'` / `'textSet'` / `'dateSet'`
   * は条件(演算子 + 値)と Set 一覧を 1 つの popover に縦に並べて **AND
   * 結合**する複合フィルター(条件を適用すると Set 候補が連動して絞られる。
   * 候補外になった値の選択は破棄せず保持)。numberSet の演算子は 以上 / より大きい / 以下 / 未満 /
   * に等しい / に等しくない / 範囲 / 空白 / 空白でない、textSet は を含む / に等しい / で始まる /
   * で終わる / 空白 / 空白でない(判定は大文字小文字無視)。dateSet は 範囲 / 以降 / 以前 / に等しい
   * / に等しくない / 空白 / 空白でない + 相対プリセット(今日 / 今月 / 過去 30
   * 日。**相対のまま保存され評価のたびに解決**)で、Set 部分は年 / 月 / 日の 3 階層ツリー(親は 3
   * 状態チェック)になる。
   */
  filterType?: ColumnFilterTypeOption;
  // 追加: select / set フィルター時の候補です。未指定時は rows から自動収集します。
  // 変更(proposals ②): readonly 配列も受け付けます(as const 定義の候補をそのまま渡せます)。
  /**
   * select / set / numberSet / textSet / dateSet の候補(readonly / `as const` 配列も可)。
   *
   * @defaultValue rows から自動収集
   */
  filterOptions?: readonly GridSelectFilterOption[];
  // 追加(preset-opt): dateSet フィルターの相対プリセットチップの構成です。
  //   - 未指定: ビルトイン 3 種(今日 / 今月 / 過去 30 日)を表示(従来挙動)。
  //   - false または []: チップ行そのものを非表示にします(オプトアウト)。
  //   - 配列: 表示順どおりに描画します。ビルトイン ID('today' 等)の再利用と、
  //     カスタム定義({ id, label, resolve })を混在できます。カスタムの評価は
  //     フィルター再計算のたびに resolve(now) で解決されます(ビルトイン同様の相対保存)。
  //     注記: 保存値には id だけが載るため、列定義からカスタム ID を外すと既存の保存
  //     フィルターは「条件なし」として評価されます(serverSide では id がそのまま
  //     dataSource へ渡るため、解釈はサーバ側の責務です)。
  /**
   * dateSet の相対プリセットチップの構成。`false` / `[]` でチップ行を非表示(オプトアウト)。
   * 配列はビルトイン ID(`'today'` / `'thisMonth'` / `'last30days'`)の再利用とカスタム定義
   * `{ id, label, resolve }` を表示順のまま混在可。詳細は下記「dateSet
   * の相対プリセット(dateFilterPresets)」節。
   *
   * @defaultValue ビルトイン 3 種
   */
  dateFilterPresets?: false | readonly DateFilterPresetOption[];
  /** カスタムフィルター述語。 */
  filterFn?: (row: T, filterValue: unknown) => boolean;
  // 追加(editor 基盤): セルエディタ種別です。未指定は text(プレーンテキスト編集)。
  //   編集可否は従来どおり editable / readOnly / canEditCell で判定されます(editor は種別のみ)。
  /**
   * セルエディタ種別(判別共用体)。
   * `{ type: 'text' | 'number' | 'select' | 'date' | 'checkbox' | 'custom', ... }`。
   * 詳細は「セルエディタ」節。
   *
   * @defaultValue text 相当
   */
  editor?: GridColumnEditor<T, F>;
  // 追加(validation): セル値の検証関数です。純粋・軽量であること(cellClassName 関数と同じ
  //   コスト階級で、描画中の可視セルごとに毎レンダー評価されます)。
  /**
   * セル値の検証。`true`=有効 / `false`=無効(既定メッセージ)/
   * `string`・`{ message }`=無効+メッセージ。**純粋・軽量であること**(描画中の可視セルごとに毎レンダー評価。
   * `cellClassName` 関数と同コスト階級)。詳細は「バリデーション」節。
   */
  validate?: (ctx: CellValidationContext<T, F>) => CellValidationResult;
  // 追加(validation): 検証 NG 時の動作です。既定 'mark'(値は入るが invalid 表示)。
  /**
   * 検証 NG 時の動作。`'mark'`=値は入るがセルに invalid 表示 / `'reject'`=書き込み自体を拒否。
   *
   * @defaultValue `'mark'`
   */
  validationMode?: GridValidationMode;
  /**
   * 「文字列 → セル値」のパーサ(貼り付け / クリア / エディタ commit
   * で共通)。**明示指定が常に優先**。未指定で `editor` が number / date / checkbox
   * のときは種別の既定パーサが自動供給されます(「セルエディタ」節の表参照)。
   *
   * @defaultValue editor 既定パーサ
   */
  parseClipboardValue?: (raw: string, row: T) => unknown;
  /** コピー時のフォーマッタ。 */
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
  // 追加(行選択): チェックボックス行選択の状態(セル範囲選択 selection とは別)。
  rowSelection: RowSelectionState;
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
  // 追加(grouping ②): 折りたたみ中のグループキー集合です(GridGroupRow.groupKey。既定 =
  //   空集合 = 全展開)。値ベースのキーのため rows 再取得をまたいで維持され、存在しない
  //   キーは flatten 時に単に無視されます(グルーピング列変更後の残骸キーは無害)。
  //   undo/redo の履歴対象外です(表示状態であってデータ変更ではないため)。
  collapsedGroupKeys: ReadonlySet<string>;
  // 追加(detail ②): 展開中の展開行(detail)のマスター行キー集合です(rowKeyGetter の値。
  //   既定 = 空集合 = 全て閉)。値ベースのキーのためソート / フィルター / rows 差し替えを
  //   またいで維持され、表示中に存在しないキーは単に描画されません(無害)。
  //   undo/redo の履歴対象外です(表示状態であってデータ変更ではないため)。
  expandedDetailRowKeys: ReadonlySet<GridRowKey>;
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
export type SpreadsheetGridSlotContext<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  rows: T[];
  filteredRows: T[];
  columns: GridColumn<T, F>[];
  visibleColumns: GridColumn<T, F>[];
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

// ── 追加(バッチ②/コンテキストメニュー): セル/行の汎用コンテキストメニュー(完全カスタム)の公開型群 ──
//   完全カスタム設計: ライブラリは固定の既定項目を一切持ちません。右クリック時のみ getContextMenuItems が
//   呼ばれ、返した項目でメニューを描画します。項目が空([])または getContextMenuItems 未指定のときは
//   ブラウザ標準の右クリックメニューへフォールスルーします(空のパネルは表示しません)。
//   ヘッダー右クリックは列メニュー(enableColumnMenu)が担当し、本メニューはボディ(セル/行NO ガター)専用です。

// 右クリック対象の識別です。
//   'cell'      : ボディのデータセル(列あり)。
//   'rowHeader' : 行NO ガター(列なし = 行そのものが対象)。
//   rowIndex はビュー行 index、colIndex は論理列 index(視覚順 左→中央→右 = handle.selectCell と同一空間)。
export type GridContextMenuTarget<T, F extends GridFrameworkTypes = GridFrameworkTypes> =
  | {
      type: 'cell';
      rowIndex: number;
      colIndex: number;
      rowKey: GridRowKey;
      row: T;
      column: GridColumn<T, F>;
      value: unknown;
    }
  | {
      type: 'rowHeader';
      rowIndex: number;
      rowKey: GridRowKey;
      row: T;
    };

// getContextMenuItems / onContextMenuOpen に渡す右クリックコンテキストです。
//   - clientX/clientY : 右クリックのビューポート座標(メニュー配置に使用済み。consumer の判断材料にも)。
//   - selection       : 現在のセル範囲選択(チェックボックス行選択は handle.getRowSelection で別途取得)。
//   - activeCell      : 現在のアクティブセル。
//   - isTargetSelected: 対象(cell はそのセル / rowHeader はその行)が selection に含まれるか。
//     「選択範囲に対する操作」か「単一対象への操作」かを consumer が分岐するための簡便値です。
/**
 * `getContextMenuItems` / `onContextMenuOpen` へ渡る右クリックの文脈です。
 *
 * 各フィールドの説明は React 版パッケージ `@ishibashi0112/spreadsheet-grid` に同梱の `API_REFERENCE.md`
 * の「コンテキストメニュー」節と同じ内容です。
 */
export type GridContextMenuParams<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  /**
   * 右クリック対象。`{ type:'cell', rowIndex, colIndex, rowKey, row, column, value }` か
   * `{ type:'rowHeader', rowIndex, rowKey, row }`(行NO ガター)。`rowIndex` はビュー行 index、
   * `colIndex` は論理列 index(視覚順 左→中央→右 = `handle.selectCell` と同一空間)。
   */
  target: GridContextMenuTarget<T, F>;
  /**
   * `clientX` / `clientY`: 右クリックのビューポート座標(メニュー配置に使用済み。
   * 分岐の判断材料にも)。
   */
  clientX: number;
  /**
   * `clientX` / `clientY`: 右クリックのビューポート座標(メニュー配置に使用済み。
   * 分岐の判断材料にも)。
   */
  clientY: number;
  /** 現在のセル範囲選択。チェックボックス行選択は `handle.getRowSelection()` で別途取得。 */
  selection: GridSelection;
  /** 現在のアクティブセル。 */
  activeCell: CellCoord | null;
  /**
   * 対象(cell はそのセル / rowHeader はその行)が `selection` に含まれるか。「選択範囲への操作」
   * か「単一対象への操作」かを分岐する簡便値。
   */
  isTargetSelected: boolean;
};

// アクション項目です。クリックで onSelect 実行後にメニューを自動で閉じます。
//   - id     : React key 用(省略時は配列 index)。
//   - icon   : 左 14px アイコン枠に表示(省略時は空スペーサで他項目とラベル左端を揃えます)。
//   - danger : 危険操作(削除等)の赤系強調(Mantine の color="red" 相当)。既定 false。
//   - kind   : 省略可(既定 'action')。
export type GridContextMenuActionItem<F extends GridFrameworkTypes = GridFrameworkTypes> = {
  kind?: 'action';
  id?: string;
  label: F['node'];
  icon?: F['node'];
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
};

// セクション見出し(非インタラクティブ / Mantine の Menu.Label 相当)です。項目群のグルーピング表示に使います。
export type GridContextMenuLabelItem<F extends GridFrameworkTypes = GridFrameworkTypes> = {
  kind: 'label';
  id?: string;
  label: F['node'];
};

// 区切り線です。
export type GridContextMenuSeparatorItem = {
  kind: 'separator';
  id?: string;
};

// 完全自由描画のエスケープハッチ項目(「レンダラ」)です。
//   render に渡る close() でメニューを閉じられます(項目内のボタン等から任意タイミングで)。
export type GridContextMenuCustomItem<F extends GridFrameworkTypes = GridFrameworkTypes> = {
  kind: 'custom';
  id?: string;
  render: (ctx: { close: () => void }) => F['node'];
};

// コンテキストメニュー項目の判別共用体です(action=既定 / label=見出し / separator / custom)。
//   ライブラリは既定項目を一切持たず、この配列が空(または getContextMenuItems 未指定)なら
//   ブラウザ標準メニューへフォールスルーします。
export type GridContextMenuItem<F extends GridFrameworkTypes = GridFrameworkTypes> =
  | GridContextMenuActionItem<F>
  | GridContextMenuLabelItem<F>
  | GridContextMenuSeparatorItem
  | GridContextMenuCustomItem<F>;

// ── 追加(G-1): セル操作の通知(onCellClick / onCellDoubleClick / onActiveCellChange)の公開型群 ──
//   対象はデータ行 × 利用側の列のセルだけです(列ヘッダー / 行番号 / グループ行 / ラベル行 / 展開行 /
//   SSRM の未ロード行 / 合成列 = 展開トグル・行ドラッグハンドル・自動グループ列は対象外)。
//   監査 RD-4(canEditCell の rowIndex の基準が経路で違う)と同じ混乱を避けるため、行は index ではなく
//   行データ + rowKey を主に渡し、index は view / source の両方を明示した名前で添えます(CellStyleContext と同基準)。
//   event はブラウザ標準(DOM)の MouseEvent です(React の合成イベントではない = core はフレームワーク非依存)。
//   束ね型 F へ項目を足すと既存の束縛型を壊すため、DOM 標準型で受けます。
/**
 * セル操作の通知(`onCellClick` / `onCellDoubleClick` / `onActiveCellChange`)が指すデータセル。
 * `rowIndex` はビュー行 index(フィルター / ソート後の表示位置 = `handle.selectCell` と同じ空間)、
 * `sourceRowIndex` は元 `rows` の index(serverSide では view index と同値)、`colIndex` は論理列 index
 * (視覚順 左→中央→右)。`value` はセルの生値(`getValue` 指定列はその戻り値。`valueFormatter` 適用前)。
 */
export type GridCellRef<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  row: T;
  rowKey: GridRowKey;
  rowIndex: number;
  sourceRowIndex: number;
  column: GridColumn<T, F>;
  columnKey: string;
  colIndex: number;
  value: unknown;
};

/**
 * `onCellClick` の引数。`GridCellRef` に、発火元のブラウザ標準(DOM)の `MouseEvent` を足したもの
 * (修飾キー `ctrlKey` / `shiftKey` / `metaKey` / `altKey` などを見たいとき用)。
 */
export type GridCellEventParams<T, F extends GridFrameworkTypes = GridFrameworkTypes> = GridCellRef<T, F> & {
  event: MouseEvent;
};

/**
 * `onCellDoubleClick` の引数。`preventDefault()` を呼ぶと既定の動作(編集可能セルなら編集開始)を
 * 行わない(`event.preventDefault()` ではなく本関数)。タッチのダブルタップでは `event` は離したときの
 * `PointerEvent`(`MouseEvent` の派生)。
 */
export type GridCellDoubleClickParams<T, F extends GridFrameworkTypes = GridFrameworkTypes> =
  GridCellEventParams<T, F> & {
    preventDefault: () => void;
  };

// 追加: 公開 props です。
// 追加(slot-props / StyleX 併用): className 系スロットが受ける値の形です。
//   - string: 従来どおりの class 文字列。
//   - { className?, style? }: StyleX の stylex.props(...) の戻り値と同形。StyleX の動的スタイル
//     (関数スタイル)は「class + style 側の CSS 変数」の組で出力されるため、この形で受けないと
//     欠落します。style は当該パーツのルート要素へインラインで付与され、グリッドが位置決めに使う
//     座標 / 寸法(left / top / width / height / transform 等)はグリッド側が後勝ちで上書きします
//     (レイアウトは壊せません)。インライン style は状態クラス(選択 / ホバー等の背景)にも勝つため、
//     状態で切り替えたい装飾は className 側で行ってください。
//   - tooltip / dragGhost は命令的 DOM(document.body 直下)のため、style の数値は単位なしのまま
//     設定されます(px が必要な値は '12px' のように文字列で渡してください)。
export type GridSlotProps<F extends GridFrameworkTypes = GridFrameworkTypes> = string | { className?: string; style?: F['style'] };

// 解決済みスロット(内部用。view へ渡す形。参照は親で署名 memo 済み)。
export type GridResolvedSlot<F extends GridFrameworkTypes = GridFrameworkTypes> = { className?: string; style?: F['style'] };
export type GridResolvedSlots<F extends GridFrameworkTypes = GridFrameworkTypes> = Partial<
  Record<keyof GridClassNames<F>, GridResolvedSlot<F>>
>;

// 追加(UI CSS移行): 各パーツへ追加 className を差し込むスロットです。利用側はここに任意のクラス
//   (例: 別プロジェクトの Tailwind ユーティリティ / StyleX の stylex.props())を渡して局所調整
//   できます。基底クラスは未レイヤー・特異度 (0,1,0)(THEME-1)のため、同特異度のクラスは
//   読み込み順で勝敗が決まります(確実に勝たせるには連結セレクタ、または style.layer.css)。
// 変更(slot-props): 各値は GridSlotProps(string | { className, style })。全スロット配線済み。
//   StyleX は子孫セレクタを書けない(要素自身のクラスでしか装飾できない)ため、ここに無い内部要素
//   (ポップオーバー内のボタン / 入力欄等)はデザイントークン(--ssg-*)で調整してください。
/**
 * パーツ別スロット(`classNames` prop)です。各値は class 文字列か `{ className, style }` です。
 *
 * 各スロットの付与先は React 版パッケージ `@ishibashi0112/spreadsheet-grid` に同梱の `API_REFERENCE.md`
 * の「パーツ別スロット」節と同じ内容です。
 */
export type GridClassNames<F extends GridFrameworkTypes = GridFrameworkTypes> = {
  // グリッドのルート要素(.ssg-root。className / style prop と同じ要素)。
  /** 付与先: ルート要素 `.ssg-root`(`className` / `style` prop と同じ要素) */
  root?: GridSlotProps<F>;
  // 既定トップバー(.ssg-bar--top)。renderTopBar 指定時はカスタム側が markup を持つため対象外。
  /**
   * `toolbar` / `statusBar`: 付与先: 既定トップバー `.ssg-bar--top` / 既定ボトムバー
   * `.ssg-bar--bottom`(`renderTopBar` / `renderBottomBar` 指定時は対象外)
   */
  toolbar?: GridSlotProps<F>;
  // 既定ボトムバー(.ssg-bar--bottom)。renderBottomBar 指定時は対象外。
  /**
   * `toolbar` / `statusBar`: 付与先: 既定トップバー `.ssg-bar--top` / 既定ボトムバー
   * `.ssg-bar--bottom`(`renderTopBar` / `renderBottomBar` 指定時は対象外)
   */
  statusBar?: GridSlotProps<F>;
  // ヘッダー行(.ssg-header-row。3 ペイン分)。
  /**
   * `headerRow` / `headerCell`: 付与先: ヘッダー行 /
   * 列ヘッダーセル(コーナー・行ヘッダーセルは含まない)
   */
  headerRow?: GridSlotProps<F>;
  // 列ヘッダーセル(.ssg-header-cell。コーナー / 行ヘッダーセルは含まない)。
  /**
   * `headerRow` / `headerCell`: 付与先: ヘッダー行 /
   * 列ヘッダーセル(コーナー・行ヘッダーセルは含まない)
   */
  headerCell?: GridSlotProps<F>;
  // 本体行(.ssg-body-row。データ行 / スケルトン行 / グループ行)。
  /** `bodyRow` / `bodyCell`: 付与先: 本体行(データ / スケルトン / グループ行)/ データセル */
  bodyRow?: GridSlotProps<F>;
  // データセル(.ssg-body-cell。グループ行のセルにも付与)。
  /** `bodyRow` / `bodyCell`: 付与先: 本体行(データ / スケルトン / グループ行)/ データセル */
  bodyCell?: GridSlotProps<F>;
  // 行ヘッダー「#」セル(.ssg-row-header-cell)とコーナーセル(両方)。
  /**
   * `rowHeaderCell` / `cornerCell`: 付与先: 行ヘッダー「#」セルとコーナーセル(`rowHeaderCell`
   * は両方、`cornerCell` はコーナーのみ)
   */
  rowHeaderCell?: GridSlotProps<F>;
  // ヘッダーのアイコンボタン(.ssg-icon-btn。列メニュー ⋮ 等)。
  /** 付与先: ヘッダーのアイコンボタン `.ssg-icon-btn` */
  iconButton?: GridSlotProps<F>;
  // 左上コーナーセル(.ssg-corner-cell。rowHeaderCell に加えて付与)。
  /**
   * `rowHeaderCell` / `cornerCell`: 付与先: 行ヘッダー「#」セルとコーナーセル(`rowHeaderCell`
   * は両方、`cornerCell` はコーナーのみ)
   */
  cornerCell?: GridSlotProps<F>;
  // グループ行(.ssg-body-row[data-ssg-group-row]。bodyRow に加えて付与)。
  /**
   * `groupRow` / `groupCell`: 付与先: グループ行 / グループ行のセル(`bodyRow` / `bodyCell`
   * に加えて付与)
   */
  groupRow?: GridSlotProps<F>;
  // グループ行のセル(.ssg-group-cell。bodyCell に加えて付与)。
  /**
   * `groupRow` / `groupCell`: 付与先: グループ行 / グループ行のセル(`bodyRow` / `bodyCell`
   * に加えて付与)
   */
  groupCell?: GridSlotProps<F>;
  // 展開行の帯(.ssg-detail-band。3 ペイン分)。
  /**
   * `detailBand` / `detailCard`: 付与先: 展開行の帯 / カード(`detailRow.className` に加えて付与)
   */
  detailBand?: GridSlotProps<F>;
  // 展開行のカード(.ssg-detail-card。detailRow.className に加えて付与)。
  /**
   * `detailBand` / `detailCard`: 付与先: 展開行の帯 / カード(`detailRow.className` に加えて付与)
   */
  detailCard?: GridSlotProps<F>;
  // 追加(label-row ②): ラベル行(.ssg-body-row[data-ssg-label-row]。bodyRow に加えて付与)。
  /**
   * `labelRow` / `labelRowContent`: 付与先: ラベル行(見出し / 区切り行)の行要素
   * `.ssg-body-row[data-ssg-label-row]`(`bodyRow` / `labelRow.className` に加えて付与。
   * 縦固定の複製にも付く)/ 中身の器 `.ssg-label-row-content`
   */
  labelRow?: GridSlotProps<F>;
  // 追加(label-row ②): ラベル行の中身の器(.ssg-label-row-content。中央ペインの sticky 要素)。
  /**
   * `labelRow` / `labelRowContent`: 付与先: ラベル行(見出し / 区切り行)の行要素
   * `.ssg-body-row[data-ssg-label-row]`(`bodyRow` / `labelRow.className` に加えて付与。
   * 縦固定の複製にも付く)/ 中身の器 `.ssg-label-row-content`
   */
  labelRowContent?: GridSlotProps<F>;
  // ポータル系パネルのルート(列メニュー / フィルター / コンテキストメニュー / select エディタ候補 /
  //   ツールパネル。document.body 直下に描画されるため .ssg-root の子孫ではありません)。
  /**
   * 付与先: ポータル系パネルの root(列メニュー / フィルター / コンテキストメニュー / select
   * エディタ候補 / ツールパネル。`document.body` 直下)
   */
  popover?: GridSlotProps<F>;
  // メニュー項目(.ssg-menu-item。列メニュー / コンテキストメニュー)。
  /** 付与先: メニュー項目 `.ssg-menu-item`(列メニュー / コンテキストメニュー) */
  menuItem?: GridSlotProps<F>;
  // カスタムツールチップ(.ssg-tooltip。body 直下のシングルトン。複数グリッド同居時は最後に
  //   マウント / 更新したグリッドの値が使われます)。
  /**
   * 付与先: カスタムツールチップ `.ssg-tooltip`(body 直下のシングルトン。
   * 複数グリッド同居時は最後に更新したグリッドの値)
   */
  tooltip?: GridSlotProps<F>;
  // 列 / 行ドラッグのゴースト([data-grid-drag-ghost]。body 直下、ドラッグ開始時に生成)。
  /** 付与先: 列 / 行ドラッグのゴースト `[data-grid-drag-ghost]` */
  dragGhost?: GridSlotProps<F>;
  // 行選択 / checkbox 列のチェックボックス glyph(.ssg-row-checkbox)。
  /** 付与先: 行選択 / checkbox 列のチェックボックス glyph `.ssg-row-checkbox` */
  checkbox?: GridSlotProps<F>;
  // セルエディタの枠(.ssg-cell-editor)。
  /** 付与先: セルエディタの枠 `.ssg-cell-editor` */
  cellEditor?: GridSlotProps<F>;
  // 0 行時の空状態(.ssg-empty-state)。
  /** 付与先: 0 行時の空状態 `.ssg-empty-state` */
  emptyState?: GridSlotProps<F>;
  // フィルターチップバー(.ssg-filter-chip-bar)。
  /** 付与先: フィルターチップバー `.ssg-filter-chip-bar` */
  filterChipBar?: GridSlotProps<F>;
  // SSRM のエラーバー(.ssg-ssrm-error-bar。取得失敗 / 保存失敗)。
  /** 付与先: SSRM のエラーバー `.ssg-ssrm-error-bar` */
  errorBar?: GridSlotProps<F>;
  // スクロール位置インジケーター(.ssg-scroll-hint)。
  /** 付与先: スクロール位置インジケーター `.ssg-scroll-hint` */
  scrollHint?: GridSlotProps<F>;
  // アクティブセル枠(.ssg-active-cell-overlay)。
  /** `activeCellOverlay` / `selectionOverlay`: 付与先: アクティブセル枠 / 範囲選択の塗り */
  activeCellOverlay?: GridSlotProps<F>;
  // 範囲選択の塗り(.ssg-selection-overlay)。
  /** `activeCellOverlay` / `selectionOverlay`: 付与先: アクティブセル枠 / 範囲選択の塗り */
  selectionOverlay?: GridSlotProps<F>;
  // 追加(motion-4 / M-3): コピー範囲の動く点線(.ssg-copy-range-overlay)。
  /** 付与先: コピー範囲の動く点線 `.ssg-copy-range-overlay` */
  copyRangeOverlay?: GridSlotProps<F>;
};

// 追加(imperative API #1): ref ハンドルのスクロール整列指定です。
//   'auto'  : 既に可視ならスクロールしない。はみ出す側の端へ最小スクロール。
//   'start' : 対象を可視帯の先頭(ヘッダー直下 / 左固定直右)へ。
//   'center': 対象を可視帯の中央へ。
//   'end'   : 対象を可視帯の末尾(下端 / 右端)へ。
export type ScrollAlign = 'auto' | 'start' | 'center' | 'end';

// 追加(proposals ⑧): スクロール位置(px)です。値はスクロールコンテナの生の
//   scrollTop / scrollLeft(getScrollPosition / setScrollPosition / onScroll で同一基準)。
export type GridScrollPosition = {
  top: number;
  left: number;
};

// 追加(proposals ⑧): onScroll 通知のパラメータです。source は変化の由来で、
//   'api' = setScrollPosition / scrollTo* 系(命令的 API)由来、'user' = それ以外
//   (ホイール / ドラッグ / キーボード等)。利用側は 2 グリッドの双方向スクロール同期で
//   'api' を無視することでループを止められます。
export type GridScrollEventParams = {
  top: number;
  left: number;
  source: 'user' | 'api';
};

// 変更(export-scope 再編): エクスポートの対象範囲を「意味論ベース」の 4 値へ再編します。実利用で
//   「'visible' = フィルターで見えている行」という誤読が発生した(実体は仮想化ウィンドウ = 描画中の
//   行のため、出力行数がスクロール位置に依存して変わる)ことを受け、仮想化の内部事情が名前に漏れない
//   語彙に改めました。旧 'all' / 'visible' は後方互換エイリアスとして受け付け続けます(実行時挙動は
//   従来と完全同一)。正規化は logic/exportScope.ts の normalizeExportScope が担います。
/**
 * エクスポートの対象範囲です(exportCsv / downloadCsv / getExportData で共通)。
 * - `'view'`     : ビュー行全体(フィルター/ソート/列可視・固定順を反映)。**既定値**。スクロール位置に依存しません。
 * - `'raw'`      : 全ソース行(`rows` 配列順)。フィルターもソートも無視します(列は可視列・固定順に従います)。
 *                  serverSide はソース行配列を持たないため `'view'` 相当へフォールバックします(console.warn を出力)。
 * - `'rendered'` : 仮想化ウィンドウ(いま描画中の行のみ・オーバースキャン込み)。結果はスクロール位置に依存します。
 * - `'selection'`: 現在の選択範囲(セル/行/列)。選択なしのときは空(CSV は空文字 / データは空配列)を返します。
 */
export type CsvExportScope =
  | 'view'
  | 'raw'
  | 'rendered'
  | 'selection'
  | DeprecatedCsvExportScope;

/**
 * 後方互換エイリアスです(実行時挙動は新名称と完全同一): `'all'` → `'view'` / `'visible'` → `'rendered'`。
 * @deprecated `'visible'` は「フィルターで見えている行」ではなく「描画中の行(仮想化ウィンドウ)」を
 *   指すため誤読のもとになります。新規コードでは `'view'` / `'rendered'` を使用してください。
 */
export type DeprecatedCsvExportScope = 'all' | 'visible';

// 追加(imperative API #1): CSV エクスポートのオプションです。
export type CsvExportOptions = {
  // 出力範囲(既定 'view' = フィルター/ソート後のビュー行全体)。各値の意味は CsvExportScope の JSDoc 参照。
  scope?: CsvExportScope;
  // 先頭にヘッダー行(列タイトル)を付けるか(既定 true)。
  includeHeaders?: boolean;
  // 区切り文字(既定 ',')。'\t' を渡せば TSV になります。
  delimiter?: string;
  // 先頭に UTF-8 BOM を付けるか(exportCsv は既定 false / downloadCsv は既定 true)。
  bom?: boolean;
  // 追加(label-row ④): ラベル行(labelRow)を出力に含めるか(既定 false)。true のとき、ラベル行は
  //   labelRow.exportText(未指定なら getLabel を先頭列・他列は空)の 1 行として出力されます。
  includeLabelRows?: boolean;
};

// 追加(imperative API: getExportData): エクスポート用「整形済みデータ」のオプションです。CSV と同じ
//   scope セマンティクスを共有します(出力範囲のみ)。直列化に関わる delimiter / bom / includeHeaders は
//   持ちません(ヘッダーは columns として別途返すため、書き出すかは consumer 判断)。
export type GridExportOptions = {
  // 出力範囲(既定 'view')。CsvExportScope を共有します(各値の意味は型定義の JSDoc 参照)。
  scope?: CsvExportScope;
  // 追加(label-row ④): ラベル行を含めるか(既定 false)。true のとき rows にラベル行が混ざり、
  //   GridExportData.rowKinds で行種を判別できます。
  includeLabelRows?: boolean;
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
  // 追加(label-row ④): rows と同じ長さの行種配列です(includeLabelRows: true のときのみ存在)。
  //   'label' の行は labelRow.exportText 由来のセル列で、Excel 側で結合セル / 書式を当てる判定に使えます。
  rowKinds?: Array<'data' | 'label'>;
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
/**
 * 命令的 API です(`ref` prop で受け取るハンドル)。状態は props で controlled のまま、props で表現しづらい
 * 一発操作(スクロール / 選択 / エクスポート / 状態の保存・復元など)だけを提供します。
 * `viewRowIndex` / `colIndex` はビュー座標(フィルター / ソート適用後の表示 index。`colIndex` は固定列を含む
 * 左→中央→右の視覚順)です。
 *
 * 各メソッドの説明は React 版パッケージ `@ishibashi0112/spreadsheet-grid` に同梱の `API_REFERENCE.md`
 * の「命令的 API」節の表と同じ内容です。
 */
export type SpreadsheetGridHandle<T> = {
  // ── viewport(スクロール)──
  // 指定行が可視になるようスクロールします(align 既定 'auto')。
  /**
   * 指定行を可視域へ。`align`(既定 `'auto'`): `'auto'`(最小スクロール) / `'start'` / `'center'` /
   * `'end'`。
   */
  scrollToRow: (viewRowIndex: number, options?: { align?: ScrollAlign }) => void;
  // 指定セルが可視になるよう縦横スクロールします(固定列は横スクロール対象外)。
  /** 指定セルを縦横とも可視域へ。固定列(左右ピン)は常に可視のため横スクロールしない。 */
  scrollToCell: (
    viewRowIndex: number,
    colIndex: number,
    options?: { align?: ScrollAlign },
  ) => void;
  // 先頭 / 末尾へスクロールします。
  /**
   * `scrollToTop()` / `scrollToBottom()`: 先頭 / 末尾へ。行高を実測するモード(auto-height 列 /
   * 展開行)でも、`scrollToBottom()` は直後の計測で総高が伸びた分を短時間(約 1
   * 秒・上スクロールで中断)自動で再補正し、1 回の呼び出しで末尾に届く。
   */
  scrollToTop: () => void;
  /**
   * `scrollToTop()` / `scrollToBottom()`: 先頭 / 末尾へ。行高を実測するモード(auto-height 列 /
   * 展開行)でも、`scrollToBottom()` は直後の計測で総高が伸びた分を短時間(約 1
   * 秒・上スクロールで中断)自動で再補正し、1 回の呼び出しで末尾に届く。
   */
  scrollToBottom: () => void;
  // 現在描画中の行ウィンドウ [startIndex, endIndex)(end 排他)。空のときは null。
  /** 現在描画中の行ウィンドウ `{ startIndex, endIndex }`(end 排他)。空は `null`。 */
  getVisibleRowRange: () => { startIndex: number; endIndex: number } | null;
  // 追加(proposals ⑧): スクロール位置(px)の取得です。値はスクロールコンテナの生の
  //   scrollTop / scrollLeft で、setScrollPosition / onScroll と同一基準(往復で一貫)。
  //   コンテナ未マウント時は null を返します。
  /**
   * 現在のスクロール位置 `{ top, left }`(px)。値はスクロールコンテナの生の `scrollTop` /
   * `scrollLeft` で、`setScrollPosition` / `onScroll` と同一基準(往復で一貫)。未マウント時は
   * `null`。
   */
  getScrollPosition: () => GridScrollPosition | null;
  // 追加(proposals ⑧): スクロール位置(px)の設定です。top / left は省略側を現状維持し、
  //   スクロール可能範囲へクランプします。既定 behavior は 'auto'(即時)。
  //   2 グリッドの双方向同期では 'auto' を推奨します('smooth' は途中フレームの onScroll が
  //   source:'user' になり得るため)。
  /**
   * スクロール位置の設定(px)。省略側は現状維持・スクロール可能範囲へクランプ。`behavior` は
   * `'auto'`(既定・即時)/ `'smooth'`。2 グリッドの双方向同期では `'auto'` を推奨(`'smooth'`
   * は途中フレームの `onScroll` が `source:'user'` になり得る)。
   */
  setScrollPosition: (
    position: { top?: number; left?: number },
    options?: { behavior?: 'auto' | 'smooth' },
  ) => void;

  // ── 選択 / アクティブセル ──
  // 現在のアクティブセル座標(なければ null)。
  /** 現在のアクティブセル `{ row, col }`(なければ `null`)。 */
  getActiveCell: () => CellCoord | null;
  // アクティブセルを設定(null で解除)。scrollIntoView:true で可視化も行います。
  /** アクティブセル設定(`null` で解除)。`scrollIntoView` で可視化も行う。 */
  setActiveCell: (
    cell: CellCoord | null,
    options?: { scrollIntoView?: boolean },
  ) => void;
  // 現在の選択状態。
  /** 現在の選択状態(`GridSelection`)。 */
  getSelection: () => GridSelection;
  // 単一セルを選択(クリック相当)。scrollIntoView:true で可視化も行います。
  /** 単一セル選択(クリック相当)。 */
  selectCell: (
    viewRowIndex: number,
    colIndex: number,
    options?: { scrollIntoView?: boolean },
  ) => void;
  // セル範囲を選択(ドラッグ選択相当)。アンカーは range.start です。
  /** セル範囲選択(ドラッグ相当)。アンカーは `range.start`。 */
  selectRange: (range: CellRange, options?: { scrollIntoView?: boolean }) => void;
  // 選択を解除します。
  /** 選択解除。 */
  clearSelection: () => void;
  // 選択に交差する行(distinct)を返します。SSRM はロード済み行のみ。
  /** 選択に交差する行(distinct)を返す。serverSide はロード済み行のみ。 */
  getSelectedRows: () => T[];

  // ── エクスポート ──
  // CSV 文字列を返します(純粋・副作用なし)。
  /** CSV 文字列を返す(純粋・副作用なし)。 */
  exportCsv: (options?: CsvExportOptions) => string;
  // exportCsv の結果をファイルとしてダウンロードします(Blob + 一時 anchor の DOM 副作用)。
  //   bom は未指定時 true(Excel 互換)。filename 既定 'export.csv'。
  /**
   * `exportCsv` の結果を `.csv` としてダウンロード(`filename` 既定 `'export.csv'`、`bom` 既定
   * `true`)。
   */
  downloadCsv: (filename?: string, options?: CsvExportOptions) => void;
  // 追加(imperative API: getExportData): エクスポート用の整形済みデータ(列メタ + 2 次元セル)を返します
  //   (純粋・副作用なし)。scope / 列順 / フィルター・ソート適用は exportCsv と同一規則です。xlsx 等の
  //   生成は consumer 側で任意のライブラリ(exceljs / hucre / SheetJS …)を使って行います(本ライブラリは
  //   Excel ライブラリを同梱しません)。複数シートは consumer 側で本メソッドを scope 別 / グリッド別に
  //   呼び出して組み立てます(グリッドは「1 表」を返すプリミティブに徹します)。
  /** 列メタ + 2 次元セルの、シリアライズ非依存な整形済みデータを返す(純粋・副作用なし)。 */
  getExportData: (options?: GridExportOptions) => GridExportData;

  // ── 状態の保存 / 復元 ──
  // 永続化対象(手動リサイズ幅 / フィルター / ソート / 列メタ=可視・順序・ピン)のスナップショット
  //   (GridState v2)を返します(純粋・副作用なし・read-only)。列メタは columns prop から配列順で抽出
  //   します。返り値は新規オブジェクト/配列で、そのまま JSON.stringify して保存できます。
  /**
   * 永続化対象(手動リサイズ幅 / フィルター / ソート)のスナップショット `GridState`
   * を返す(純粋・副作用なし)。新規オブジェクトなのでそのまま `JSON.stringify` して保存できる。
   */
  getState: () => GridState;
  // getState のスナップショット(または互換な部分形)を適用します。外部入力は内部で防御的に正規化され、
  //   幅 reset / フィルター一括 / ソート set の 3 dispatch(1 イベント = 1 再レンダー)で反映します。
  //   clientSide / serverSide 双方に効きます(SSRM では filters/sort 変化がクエリへ載り再取得)。
  //   列メタ(columns)は onColumnsChange が指定されているときのみ、現 columns へ key ベースでマージして
  //   onColumnsChange 経由で反映します(未指定時はスキップ=幅/フィルター/ソートのみ。v1 完全互換)。
  //   v1 保存値(columns フィールド無し)も読めます(列メタは触りません)。
  /**
   * `getState()` の値(または互換な部分形)を適用する。外部入力は内部で防御的に正規化され、幅 reset /
   * フィルター一括 / ソート set の 3 dispatch(1 イベント = 1 再レンダー)で反映。clientSide /
   * serverSide 双方に効く(SSRM は `filters`/`sort` 変化がクエリへ載り再取得)。
   */
  applyState: (state: GridState) => void;

  // ── 行選択(チェックボックス選択。getSelectedRows()=セル範囲由来とは別物)──
  // 現在の行選択記述子を返します(include/exclude)。
  /** 現在の行選択記述子(`RowSelectionModel`)。 */
  getRowSelection: () => RowSelectionModel;
  // 行選択記述子を設定します(controlled 時は onRowSelectionChange 経由で親へ委譲)。
  /**
   * 行選択記述子を設定。controlled 時は `onRowSelectionChange` 経由で親へ委譲(内部 state
   * は書かない)。
   */
  setRowSelection: (model: RowSelectionModel) => void;
  // 選択されている行キーの配列です。include はそのまま、exclude は現在の全行から
  //   除外を差し引いて列挙します(SSRM はロード済みキーのみ)。
  /**
   * 選択中の行キー配列。`include` はそのまま O(選択数)、`exclude`
   * は現在の全行から除外を差し引いて列挙(O(行数))。serverSide はロード済みキーのみ。
   */
  getSelectedRowKeys: () => GridRowKey[];
  // 選択されている行データです(SSRM はロード済み行のみ)。大規模データでは行の探索が
  //   必要なため、キーだけで足りる場合は getSelectedRowKeys を推奨します。
  /**
   * 選択中の行データ。行の探索が要るため O(行数)。キーで足りるなら `getSelectedRowKeys()` を推奨。
   * serverSide はロード済み行のみ。
   */
  getSelectedRowData: () => T[];
  // 選択件数です(exclude 時は 総行数 − 除外数 で一定コスト)。
  /** 選択件数。`exclude` は 総行数 − 除外数 で一定コスト。 */
  getSelectedRowCount: () => number;
  // 指定キーが選択中かを O(1) で判定します。
  /** 指定キーが選択中かを O(1) 判定。 */
  isRowSelected: (rowKey: GridRowKey) => boolean;
  // 全行を選択します(exclude モード=キーを列挙しません)。
  /** 全行を選択(exclude モード=キーを列挙しない)。 */
  selectAllRows: () => void;
  // 行選択をすべて解除します。
  /** 行選択をすべて解除。 */
  clearRowSelection: () => void;

  // ── undo / redo(編集履歴)──
  // 直近のグリッド編集(セル編集 / ペースト / renderCell の setValue)を取り消します。
  //   キーボードの Ctrl/Cmd+Z と同じ操作です。有効条件(enableUndoRedo(既定 on)+ clientSide +
  //   onRowsChange 指定 + readOnly=false)を満たさないときは no-op です。
  /** 直近のグリッド編集を取り消す(`Ctrl/Cmd+Z` 相当)。無効条件下・履歴が空のときは no-op。 */
  undo: () => void;
  // undo で取り消した編集をやり直します(Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y と同じ)。
  //   undo 後に新しい編集が入った時点で redo 系譜は破棄されます。
  /**
   * undo で取り消した編集をやり直す(`Ctrl/Cmd+Shift+Z` / `Ctrl/Cmd+Y` 相当)。undo
   * 後に新しい編集が入った時点で redo 系譜は破棄される。
   */
  redo: () => void;
  // undo / redo 可能か(履歴が空でなく、上記の有効条件を満たすか)を返します。
  /** `canUndo()` / `canRedo()`: undo / redo 可能かを返す(無効条件下では常に `false`)。 */
  canUndo: () => boolean;
  /** `canUndo()` / `canRedo()`: undo / redo 可能かを返す(無効条件下では常に `false`)。 */
  canRedo: () => boolean;
  // 編集履歴を破棄します(rows は変更しません)。rows を外部から大きく差し替える前などに
  //   明示的に呼べますが、外部差し替えはグリッド側でも自動検知して履歴を破棄します。
  /**
   * 編集履歴を破棄する(rows は変更しない)。rows
   * の外部差し替えはグリッド側でも自動検知して破棄するため、通常は呼ばなくてよい。
   */
  clearUndoHistory: () => void;

  // ── 行グルーピング ──
  // 追加(grouping ④): 指定グループの開閉を設定します(collapsed: true = 折りたたみ)。
  //   groupKey は getGroupRows() の記述子(GridGroupRow.groupKey)から取得します。
  //   グルーピング無効時・未知キーの折りたたみ解除は no-op です。
  /**
   * 指定グループを開閉する(`collapsed: true` = 折りたたみ)。`groupKey` は `getGroupRows()`
   * の記述子から取得。同一イベント内の連続呼び出しも正しく積み重なる。
   */
  setGroupCollapsed: (groupKey: string, collapsed: boolean) => void;
  // 追加(grouping ④): すべてのグループを展開 / 折りたたみます(グルーピング無効時は no-op)。
  /** `expandAllGroups()` / `collapseAllGroups()`: すべてのグループを展開 / 折りたたむ。 */
  expandAllGroups: () => void;
  /** `expandAllGroups()` / `collapseAllGroups()`: すべてのグループを展開 / 折りたたむ。 */
  collapseAllGroups: () => void;
  // 追加(grouping ④): 全グループ行の記述子を DFS 順(表示順)で返します(開閉状態に
  //   関わらず全件。グルーピング無効時は空配列)。
  /** 全グループ行の記述子(`GridGroupRow[]`)を DFS 順(表示順)で返す。開閉状態に関わらず全件。 */
  getGroupRows: () => GridGroupRow[];

  // ── 展開行(detail) ──
  // 追加(detail ②): 指定行キー(rowKeyGetter の値)の展開行を開閉します。detailRow 未指定・
  //   isExpandable が false の行への展開は no-op です。表示中でない行(フィルター除外 / 未ロード)の
  //   キーも状態としては保持され、表示されたときに開きます。
  /**
   * 指定行キー(`rowKeyGetter` の値)の展開行を開閉する。`isExpandable` が `false` の行は no-op。
   * 行がまだロードされていない / フィルターで除外中でもキーは保持され、
   * 表示可能になった時点で帯が出る。同一イベント内の連続呼び出しも正しく積み重なる。
   */
  setDetailRowExpanded: (rowKey: GridRowKey, expanded: boolean) => void;
  // 追加(detail ②): 展開中の行キーを返します(detailRow 未指定時は空配列)。
  /** 展開中の行キーを返す(`GridRowKey[]`)。 */
  getExpandedDetailRowKeys: () => GridRowKey[];
  // 追加(detail ②): すべての展開行を閉じます(展開はビューポート内の全行を開くと重いため
  //   「すべて開く」は提供しません。必要なら setDetailRowExpanded を行ごとに呼んでください)。
  /**
   * すべての展開行を閉じる。「すべて開く」
   * は提供しない(表示中の全行をまとめて開くと帯の合計高が大きくなりやすいため。必要なら
   * `setDetailRowExpanded` を行ごとに呼ぶ)。
   */
  collapseAllDetailRows: () => void;

  // ── 行ドラッグ並び替え ──
  // 追加(row-drag ③): rowKey の行を元配列の toIndex へ移動します(clientSide + onRowsChange 時のみ。
  //   enableRowDrag / ソート / フィルターの状態には依存しません)。onRowsChange(履歴ラッパ経由)
  //   → onRowMove の順に呼ばれます。未知のキー / 同一位置 / 範囲外は no-op です。
  /**
   * 指定行キーの行を元 `rows` 配列の `toIndex` へ移動する(clientSide + `onRowsChange` 指定時のみ。
   * `enableRowDrag` / ソート / フィルターの状態には依存しない)。`onRowsChange`(履歴ラッパ経由 =
   * undo 対象)→ `onRowMove` の順に呼ばれる。未知のキー / 同一位置 / 範囲外は no-op。serverSide
   * では開発時警告 + no-op。
   */
  moveRow: (rowKey: GridRowKey, toIndex: number) => void;

  // ── バリデーション ──
  // 追加(validation): validate 指定列 × 全ソース行のオンデマンド全走査です(保存前チェック用)。
  //   invalid 表示は表示時導出のため状態を持たず、本メソッドは呼ばれた時だけ計算します
  //   (明示的な呼び出し = 明示的なコスト)。clientSide 専用で、serverSide は全行を保持しない
  //   ため空配列を返します(console.warn 付き)。
  /**
   * `validate` 指定列 × 全ソース行をオンデマンドで全走査し、invalid セルの一覧(`GridInvalidCell[]`
   * = `{ rowKey, sourceRowIndex, columnKey, message }`)を返す。保存前チェック用。invalid
   * 表示は表示時導出のため状態を持たず、**呼ばれた時だけ計算**する(明示的な呼び出し =
   * 明示的なコスト)。**`showValidationMarks`
   * の表示状態と無関係に常に動作する**(マーク非表示中の送信前チェックに使える)。
   * 非表示列も対象(見えない列の不正値も検出)。clientSide 専用で、serverSide
   * は全行を保持しないため空配列 + `console.warn`。
   */
  getInvalidCells: () => GridInvalidCell[];

  // ── serverSide(SSRM)──
  // 追加(batch 8): serverSide(dataSource)のソフトリフレッシュです。クエリ(フィルター/
  //   ソート/グローバル)を変えずにキャッシュを破棄し、スクロール位置を保ったまま現在の
  //   可視レンジを即時取り直します(`serverSideRefreshToken` を増やすのと同じ挙動の命令的版)。
  //   件数は到着ブロックの totalRowCount で追従します。clientSide(rows)では警告付き no-op です。
  /**
   * serverSide(`dataSource`)のソフトリフレッシュ。クエリ(フィルター/ソート/グローバル)
   * を変えずにキャッシュを破棄し、**スクロール位置を保ったまま現在の可視レンジを即時**(debounce
   * なし)取り直す。件数は到着ブロックの `totalRowCount` で追従。宣言的に扱いたい場合は同挙動の
   * `serverSideRefreshToken` prop もある(「serverSide モード」の節を参照)。clientSide(`rows`)
   * では警告付き no-op。
   */
  refreshServerSide: () => void;
  // 追加(監査 C-7): 失敗中のブロックだけを取り直します(エラーバーの「再試行」の命令的版)。
  //   失敗ブロックはスクロールでは自動再要求しなくなったため、独自 UI からの再試行口として公開します。
  /**
   * serverSide(`dataSource`)で取得に失敗中のブロック**だけ**を即時取り直す(エラーバーの「再試行」
   * と同じ。キャッシュ済みブロックには触れない)。失敗ブロックはスクロールでは自動再要求しないため、
   * 独自のエラー UI から再試行させたい場合に使う。失敗が無ければ何もしない。clientSide(`rows`)
   * では警告付き no-op。
   */
  retryServerSideLoads: () => void;

  // ── UI パネル(FM-3)──
  // フィルター管理パネル(FM-1: 適用中の列フィルターの一覧 / ジャンプ編集 / 個別・全クリア /
  //   追加)を開きます。enableColumnFilter=false のときは何もしません。列メニューの
  //   「フィルターを管理…」/ 既定トップバーの Filters chip クリックと同じパネルです。
  //   getContextMenuItems から呼べば「右クリック → フィルターを管理…」の導線を利用側で
  //   作れます(API_REFERENCE のコンテキストメニュー節のレシピ参照)。
  //   変更(UP-1): パネルは統合ツールパネル(フィルター / 列 / 並び替えのタブ切替)になり、
  //   本 API はその「フィルター」タブを開きます(既に開いていればタブ切替のみ)。
  /**
   * フィルター管理パネル(適用中の列フィルターの一覧 / 該当列へジャンプして編集 / 個別・全クリア /
   * 追加)を開く。`enableColumnFilter=false` のときは何もしない。列メニューの「フィルターを管理…」/
   * 既定トップバーの **Filters chip クリック**(`enableColumnFilter=true` 時にクリック可能)
   * と同じパネル。
   */
  openFilterManager: () => void;
  // フィルター管理パネルを閉じます(開いていなければ何もしません)。
  //   変更(UP-1): 統合ツールパネルが「フィルター」タブを表示中のときだけ閉じます
  //   (別タブ表示中のパネルは巻き込みません)。
  /** フィルター管理パネルを閉じる(開いていなければ何もしない)。 */
  closeFilterManager: () => void;
};

// 追加(THEME-2): グリッド全体の密度プリセットです。'standard' が従来既定と同値。
//   rowHeight / headerHeight の既定値と寸法トークン(styles.css の ssg-root--density-*)を
//   一括切替します。
export type GridDensity = 'compact' | 'standard' | 'comfortable';

// 追加(TH-DK-2): グリッドのカラーテーマです。'auto' は OS / ブラウザの配色設定
//   (prefers-color-scheme)へ追従します。Mantine / HeroUI 等のクラスベース dark 運用では、
//   利用側のカラースキーム(useMantineColorScheme 等)の解決値を 'light' | 'dark' で
//   渡す使い方が本命です。
export type GridTheme = 'light' | 'dark' | 'auto';
// 追加(motion-0): モーション(アニメーション / トランジション)の有効化です。'auto' は OS / ブラウザの
//   prefers-reduced-motion: reduce を尊重して 'on' / 'off' に解決します(logic/motion.ts)。
export type GridMotion = 'auto' | 'on' | 'off';

// 追加: データ投入時に全列幅を内容へ自動フィットさせる発火モードです。
//   'onMount'      = 初回にデータが載った一度きり。
//   'onDataChange' = rows(参照)が変わるたび(= データ差し替えのたび)。手動リサイズは上書きされます。
//   false(既定)   = 何もしません。列個別の除外は列の suppressAutoSize(+ 固定 width)で行います。
//   計測は列メニュー「すべての列の幅を自動調整」と同一エンジンで、suppressAutoSize / autoHeight 列は
//   除外されます。serverSide(dataSource)では未ロード行を測れないため無効です(clientSide 限定)。
export type AutoSizeColumnsMode = 'onMount' | 'onDataChange' | false;

// 追加(scrollHint): スクロール位置インジケーターの表示トリガーです。
//   'scroll'(既定) = スクロール中のみ表示し、停止後およそ 1 秒でフェードアウトします。
//   'hover'         = グリッド(スクロールコンテナ)へのポインタホバー中 + スクロール中。
//   'always'        = 常時表示。
export type ScrollHintTrigger = 'scroll' | 'hover' | 'always';

// 追加(scrollHint): renderHint コールバックの引数です。
//   rowIndex は対象の表示行 index(0 始まり。フィルター/ソート/グルーピング適用後のビュー空間)、
//   rowData はその行データです。SSRM の未ロード行と、グルーピングのグループ行では rowData が
//   undefined になります(その場合ライブラリは行番号のみの既定表示へフォールバックします)。
export type ScrollHintRenderArgs<T> = {
  rowIndex: number;
  rowData: T | undefined;
};

// 追加(scrollHint): スクロール位置インジケーターの設定です。
//   大量行(特に 100 万行級)ではスクロールバー 1px の移動が数百〜数千行に相当し、移動中に
//   「今どの行にいるか」を見失います。scrollHint はスクロールバー脇の行番号バブルと
//   行目盛りルーラーで現在位置を示します。scrollHint={true} は全既定
//   ({ bubble: true, ruler: true, scrollbar: true, trigger: 'scroll', minRows: 0 })と同義です。
//   表示は「総行数 + スクロール位置」だけで駆動されるため clientSide / SSRM の全構成で動作します。
/**
 * スクロール位置インジケーターの設定です(`scrollHint` prop。`true` は全項目既定値と同義)。
 *
 * 各フィールドの説明は React 版パッケージ `@ishibashi0112/spreadsheet-grid` に同梱の `API_REFERENCE.md`
 * の「スクロール位置インジケーター」節と同じ内容です。
 */
export type ScrollHintOptions<T = unknown, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  // 行番号バブル(スクロールバー脇に「行 N / 総行数」+ 任意の列値)。既定 true。
  /**
   * 行番号バブルの表示。
   *
   * @defaultValue `true`
   */
  bubble?: boolean;
  // 行目盛りルーラー + トラックホバー時のジャンプ先プレビュー。既定 true。
  /**
   * ルーラー + ジャンプ先プレビューの表示。
   *
   * @defaultValue `true`
   */
  ruler?: boolean;
  // カスタム縦スクロールバー(専用ガターに常時表示のトラック + 最小 30px サム)。既定 true。
  //   macOS のオーバーレイスクロールバーは自動で消え、大量行ではサムが極小になり「掴む場所」を
  //   見失うため、ヘッダー下から始まる専用ガターへ自前スクロールバーを描画します(ドラッグ /
  //   クリックジャンプ / ホイール対応)。有効時はネイティブ縦スクロールバーを非表示化します
  //   (Chromium / WebKit。Firefox はネイティブ縦バーが残りますがガター操作は有効)。
  //   false でネイティブバーのまま(バブル等は疑似サム位置に表示)。
  /**
   * カスタム縦スクロールバー(専用ガター・常時表示)。`false`
   * でネイティブバーのまま(バブル等は疑似サム位置に表示)。
   *
   * @defaultValue `true`
   */
  scrollbar?: boolean;
  // 表示トリガー。既定 'scroll'。
  /**
   * バブル / ルーラーの表示トリガー(スクロールバー自体は常時表示)。`'scroll'` =
   * スクロール中のみ(停止約 1 秒でフェードアウト)/ `'hover'` = グリッドホバー中 + スクロール中 /
   * `'always'` = 常時。
   *
   * @defaultValue `'scroll'`
   */
  trigger?: ScrollHintTrigger;
  // データ量ゲート: 表示行数(フィルター/グルーピング適用後のビュー行数。SSRM はサーバー総行数)が
  //   この値未満の間、scrollHint 全体(バブル / ルーラー / カスタムスクロールバー)を自動 OFF にして
  //   ネイティブスクロールバー表示のまま保ちます。既定 0(常時有効 = 従来挙動)。
  //   小規模データではヒントがノイズになるため、例えば 100 を指定すると「データが増えたときだけ
  //   出る」挙動になります。注意: scrollbar 有効時はしきい値またぎでガター余白が付け外しされる
  //   ため、フィルター等で行数が変動する画面では僅かなレイアウトシフトが起きます。
  /**
   * **データ量ゲート**。表示行数(フィルター / グルーピング適用後のビュー行数。SSRM
   * はサーバー総行数)がこの値未満のあいだ、scrollHint 全体(カスタムスクロールバー含む)を自動 OFF
   * にしてネイティブスクロールバー表示のままにする。`0` = 常時有効(従来挙動)。
   *
   * @defaultValue `0`
   */
  minRows?: number;
  // 簡易カスタム: 行番号に添えて表示する列 key(GridColumn.key = 行オブジェクトのフィールド名)。
  //   SSRM の未ロード行では値が手元にないため、行番号のみへ自動フォールバックします。
  /** 行番号に添えて表示する列 key(= 行オブジェクトのフィールド名)。 */
  hintColumn?: string;
  // 完全カスタム(hintColumn より優先): 行番号に添える表示内容を組み立てます。
  //   null / undefined を返すと行番号のみの既定表示へフォールバックします。
  /**
   * 表示内容の完全カスタム(`hintColumn` より優先)。`null` / `undefined`
   * を返すと行番号のみの既定表示。
   */
  renderHint?: (args: ScrollHintRenderArgs<T>) => F['node'];
};

/**
 * `SpreadsheetGrid` の props です(React 版では `ref` prop が加わります)。
 *
 * 各フィールドの説明は React 版パッケージ `@ishibashi0112/spreadsheet-grid` に同梱の `API_REFERENCE.md`
 * の「SpreadsheetGrid props」表と同じ内容です。
 * 説明中の「〜節」「下記」は同ファイル内の節を指します。
 */
export type SpreadsheetGridProps<T, F extends GridFrameworkTypes = GridFrameworkTypes> = {
  // 追加(imperative API #1): React 19 の ref-as-prop。命令的ハンドル(SpreadsheetGridHandle)を受け取ります。
  //   forwardRef は使いません(React 19 で deprecated 予定のため)。状態は controlled のまま、prop で
  //   表現できない一発操作(スクロール/選択操作/CSV)だけをハンドルで提供します。
  //   注記(非依存化 ①): ref prop は React 固有のため core には持たず、model/gridTypes.ts(React 束縛)が付与します。
  // 追加(state #2): 永続スライス(手動リサイズ幅 / フィルター / ソート / 列メタ=可視・順序・ピン)が
  //   実際に変化したときに、最新の GridState(v2)を渡して呼ばれる通知口です。consumer はこれを保存
  //   タイミングの signal にできます(例: localStorage への自動保存)。発火規約:
  //   - 列リサイズ / 選択のドラッグ中は確定まで保留し、確定後に 1 回だけ評価します(毎フレーム発火しない)。
  //   - 初回マウントでは発火しません(初期状態は通知対象外)。
  //   - 前回通知と構造等価(永続スライス + 列メタが不変)なら発火しません(activeCell 等の一時 UI では
  //     発火しない)。列の可視 / 順序 / ピン変更でも発火します(columns prop 変化を監視)。
  //   - applyState による反映も「状態変化」として発火します(復元直後に同値を 1 回保存する可能性あり)。
  //   毎レンダーで新しいインライン関数を渡しても問題ありません(latest-ref 経由で読むため再評価しません)。
  /**
   * 永続スライス(手動リサイズ幅 / フィルター / ソート)が**実際に変化したとき**に最新 `GridState`
   * を渡して呼ばれる。保存タイミングの signal(例: localStorage 自動保存)。発火規約は「状態の保存 /
   * 復元」節を参照。
   */
  onStateChange?: (state: GridState) => void;
  // 追加(change-callbacks): フィルター / ソートの状態が**実際に変化したとき**だけ、そのスライスの複製を渡して
  //   呼ばれます(onStateChange は列幅 / 列メタの変更でも呼ばれるため、フィルター / ソートだけを追いたい用途
  //   ── 例: 記述子から WHERE / ORDER BY を組み立てる ── 向け)。規約は onStateChange と同じ
  //   (初回マウント非発火 / 構造等価なら非発火 / applyState でも発火)。ドラッグ中保留は無い(フィルター /
  //   ソートはドラッグで変わらない)。manualFiltering / manualSorting でも従来どおり発火します。
  /**
   * フィルター状態(`globalText` + `columnFilters`)が**実際に変化したとき**だけ、
   * そのスライスの複製を渡して呼ばれる。`onStateChange` は列幅 / 列メタでも呼ばれるため、記述子から
   * WHERE を組み立てるなどフィルターだけを追いたい用途向け。規約は `onStateChange`
   * と同じ(初回非発火 / 同値非発火 / `applyState` でも発火)。
   */
  onFiltersChange?: (filters: GridFilterState) => void;
  /**
   * ソート状態が**実際に変化したとき**だけ、その複製を渡して呼ばれる(ORDER BY の組み立てなど)。
   * 規約は `onFiltersChange` と同じ。
   */
  onSortChange?: (sort: GridSortState) => void;
  // 追加(proposals ⑧): スクロールコンテナの scroll 通知です(passive リスナーに相乗り・
  //   rAF で 1 フレーム 1 回に間引き)。縦横どちらの変化でも発火します。source は
  //   GridScrollEventParams の注記を参照(双方向同期のループ防止用)。毎レンダーで新しい
  //   インライン関数を渡しても問題ありません(latest-ref 経由で読むため)。
  /**
   * スクロール位置の変化通知(rAF で 1 フレーム 1 回に間引き・縦横どちらの変化でも発火)。`params` は
   * `{ top, left, source }`(px)。`source: 'api'` は `setScrollPosition` / `scrollTo*` 系由来、
   * `'user'` はそれ以外。2 グリッドの双方向スクロール同期は `source === 'user'`
   * のときだけ相手へ反映することでループを止められる。インライン関数可(latest-ref 経由)。
   */
  onScroll?: (params: GridScrollEventParams) => void;
  // 変更(DS-4 ②/①-3): rows を optional 化しました。dataSource(serverSide)指定時は rows 不要のため。
  //   clientSide でも SpreadsheetGrid 側で既定値(EMPTY_ROWS)を当てるため、未指定でも従来どおり動作します。
  // 変更(proposals ②): readonly 配列も受け付けます(グリッドは入力配列を破壊的に変更しないため。
  //   編集結果は onRowsChange が新配列で返します)。useMemo / filter 由来の readonly T[] を
  //   キャストなしで渡せます。
  /**
   * clientSide モードの行データ。readonly 配列も受け付ける(グリッドは入力配列を破壊的に変更しない。
   * 編集結果は `onRowsChange` が新配列で返す)。`dataSource` を指定した場合は無視され serverSide
   * モードになる(両者は排他)。
   */
  rows?: readonly T[];
  // 追加(DS-4 ②): serverSide データ供給口です。指定時に serverSide モードへ切り替えます
  //   (rows と排他・dataSource 優先)。①-3 で本 prop を消費してモード分岐します。
  /**
   * serverSide(SSRM)モードのデータ供給口。指定すると可視窓近傍のブロックだけを `getRows`
   * で都度取得し、`rows` 系の clientSide パイプラインをバイパスする。`updateRows`(任意)
   * を持たせるとセル編集の書き戻し(楽観更新つき)が有効になる(「セル編集の書き戻し」節)。
   */
  dataSource?: ServerSideDataSource<T>;
  // 追加(stage ③): serverSide のソフトリフレッシュ用トークンです。値を増やすと、クエリ
  //   (フィルター/ソート/グローバル)を変えずにキャッシュを破棄し、現在の可視レンジをサーバから
  //   取り直します。スクロール位置は保持し、件数は到着ブロックの totalRowCount で追従します
  //   (queryKey 変化=結果総入れ替え→先頭リセットとは別物)。clientSide では無視されます。
  /**
   * serverSide のソフトリフレッシュ用トークン。値を増やすと、クエリ(フィルター/ソート/グローバル)
   * を変えずにキャッシュを破棄して現在の可視レンジをサーバから取り直す。スクロール位置は保持し、
   * 件数は到着ブロックの `totalRowCount` で追従する(clientSide では無視)。
   * 命令的に呼びたい場合は同挙動のハンドル `refreshServerSide()` を使う。
   */
  serverSideRefreshToken?: number;
  // 追加(batch 9): serverSide の getRows が reject したときの通知です(abort は失敗扱いにせず
  //   通知しません)。利用側のトースト / ログ用で、グリッド内蔵のエラーバー(再試行 UI)とは
  //   独立に呼ばれます。毎レンダーで新しいインライン関数を渡しても問題ありません
  //   (latest-ref 経由で読むため)。clientSide では発火しません。
  /**
   * serverSide の `getRows` が reject したときの通知(abort は正常キャンセルのため通知しない)。
   * `params` は失敗した要求の view 空間レンジ `{ startIndex, endIndex }`。
   * グリッド内蔵のエラーバー(再試行 UI)とは独立に呼ばれる(利用側トースト / ログ用)。
   * インライン関数可(latest-ref 経由で読む)。
   */
  onServerSideLoadError?: (
    error: unknown,
    params: ServerSideLoadErrorParams,
  ) => void;
  // 追加(SSRM 書き戻し): serverSide の updateRows が reject したときの通知です。グリッド側は
  //   楽観更新をロールバック済みで、params.updates に失敗した行更新(rowKey / changes /
  //   previousRow)が入ります(利用側のトースト / リトライ導線用)。グリッド内蔵の保存失敗
  //   バーとは独立に呼ばれます。毎レンダーで新しいインライン関数を渡しても問題ありません
  //   (latest-ref 経由で読むため)。clientSide では発火しません。
  /**
   * serverSide の `dataSource.updateRows` が reject したときの通知。
   * グリッド側は楽観更新をロールバック済みで、`params.updates` に失敗した行更新(`rowKey` /
   * `changes` / `previousRow`)が入る(利用側トースト / リトライ導線用)。
   * グリッド内蔵の保存失敗バーとは独立に呼ばれる。インライン関数可(latest-ref 経由で読む)。
   * 詳細は「セル編集の書き戻し」節。
   */
  onServerSideWriteError?: (
    error: unknown,
    params: ServerSideWriteErrorParams<T>,
  ) => void;
  // 変更(proposals ②): readonly 配列も受け付けます(rows と同じ理由。出力側の
  //   onRowsChange / onColumnsChange は従来どおり mutable の新配列を返します)。
  /** 列定義の配列。readonly 配列も受け付ける。 */
  columns: readonly GridColumn<T, F>[];
  /** 行が変化したとき呼ばれる(rows を controlled にする)。 */
  onRowsChange?: (nextRows: T[]) => void;
  /**
   * 列が変化したとき呼ばれる。列メニューの固定切替はこれが指定されている場合のみ反映。
   * 列の並べ替え(ヘッダーのドラッグ / 列パネル)と `applyState` で渡る `nextColumns` は、
   * 配列順が固定列ごと(左固定 → 中央 → 右固定)に並べ直される(画面上の列順は変わらない。例:
   * 右固定列の後ろに宣言した列があると、右固定列が配列の末尾へ移る)。
   * 列メニューの固定切替は配列順を変えず `pinned` だけを更新する。
   */
  onColumnsChange?: (nextColumns: GridColumn<T, F>[]) => void;
  /**
   * 安定した行キーを返す。
   *
   * @defaultValue index ベース
   */
  rowKeyGetter?: (row: T, index: number) => GridRowKey;
  // 追加(proposals ⑪): コピー(Ctrl/⌘+C の TSV)/ exportCsv / getExportData の対象行フィルタです。
  //   false を返した行は出力から除きます(行単位のみ。isWholeGridSelected の判定と貼り付けには
  //   影響しません)。ctx.viewRowIndex はフィルター / ソート適用後のビュー行 index
  //   (エクスポート scope 'raw' のみ rows 配列のソース index)、ctx.rowKey は rowKeyGetter の値です。
  //   既定は全行 true。用途: 表示上の詰め物行(プレースホルダ等)を出力から除くなど。
  /**
   * コピー(`Ctrl/Cmd+C` の TSV)/ `exportCsv` / `getExportData` の対象行フィルタ。`false`
   * の行は出力から**行ごと**除く(行単位のみ。全体選択かの判定と貼り付けには影響しない)。
   * `ctx.viewRowIndex` はフィルター / ソート適用後のビュー行 index(scope `'raw'` のみ rows
   * 配列のソース index)、`ctx.rowKey` は `rowKeyGetter` の値。用途:
   * プレースホルダ行など表示上の詰め物を出力から除く。
   *
   * @defaultValue 全行 true
   */
  isRowExportable?: (
    row: T,
    ctx: { viewRowIndex: number; rowKey: GridRowKey },
  ) => boolean;
  /** 行追加時に使う新規行ファクトリ。 */
  createRow?: () => T;
  /** 列追加時に使う列ファクトリ。 */
  createOverflowColumn?: (columnIndex: number) => GridColumn<T, F>;
  // 変更(THEME-2): 未指定時の既定は density プリセットから解決します(standard: 36 /
  //   compact: 28 / comfortable: 44)。明示指定はプリセットより常に優先されます。
  /**
   * uniform 行の行高(px)。未指定時は density プリセット(compact: `28` / comfortable: `44`)
   * から解決。明示指定が常に優先。
   *
   * @defaultValue density 依存(standard: `36`)
   */
  rowHeight?: number;
  // 追加(C1): auto-height 行モードを有効化します。autoHeight:true の列が行高を駆動し、
  //   行ごとに内容量で高さが変わります。論理全高が行数 gate を超える場合は uniform 行高へ
  //   フォールバックします(供給側の配線は C1-3)。
  /**
   * auto-height 行(可変行高)を有効化する**大本のスイッチ**。これに加えて**少なくとも1列に
   * `column.autoHeight: true`** が必要(その列が折り返して行高を駆動)。両方 true かつ**行数 ≤ 50,
   * 000**のとき有効(超過時は uniform `rowHeight` へフォールバック)。詳細は「auto-height 行」節。
   *
   * @defaultValue `false`
   */
  autoHeight?: boolean;
  // 追加(C1): auto-height の未測定行に使う 1 行の推定高さ(px)。未指定時は rowHeight。
  /**
   * 未測定行の推定行高(px)。
   *
   * @defaultValue `rowHeight`
   */
  estimateRowHeight?: number;
  // 変更(THEME-2): 未指定時の既定は density プリセットから解決します(standard: 40 /
  //   compact: 32 / comfortable: 48)。明示指定はプリセットより常に優先されます。
  /**
   * ヘッダー行の高さ(px)。未指定時は density プリセット(compact: `32` / comfortable: `48`)
   * から解決。明示指定が常に優先。
   *
   * @defaultValue density 依存(standard: `40`)
   */
  headerHeight?: number;
  // 追加(THEME-2): グリッド全体の密度プリセットです(既定 'standard' = 従来と同値)。
  //   rowHeight / headerHeight の既定値(上記)と、寸法トークン(セル横 padding / バー padding /
  //   アイコンボタン寸法 / セル文字の相対拡縮)を root 修飾子(ssg-root--density-*)経由で
  //   一括切替します。個別の微調整はトークン(--ssg-cell-pad-x 等)の上書きで可能です。
  //   popover / menu 等のポータルは対象外です。
  /**
   * 密度プリセット。rowHeight / headerHeight の既定値と寸法トークン(セル横 padding / バー padding /
   * アイコンボタン寸法 / セル文字の相対拡縮)を一括切替。`'standard'` は従来と同値。
   * 個別調整はトークン(`--ssg-cell-pad-x` 等)の上書きで可能。popover / menu 等のポータルは対象外。
   *
   * @defaultValue `'standard'`
   */
  density?: GridDensity;
  // 追加(TH-DK-2): カラーテーマです(既定 'light' = 従来と同値)。'dark' でダークプリセット
  //   (.ssg-theme-dark のトークン一括上書き)を、グリッド本体・全ポータル(popover / menu /
  //   panel)・ドラッグゴースト・ツールチップへ適用します。'auto' は prefers-color-scheme へ
  //   追従します。個別の色調整はトークン(--ssg-* )の上書きで可能です。
  /**
   * カラーテーマ。`'dark'` でダークプリセット(`.ssg-theme-dark` のトークン一括上書き。Mantine dark
   * 系パレット)をグリッド本体・全ポータル(popover / menu / panel)
   * ・ドラッグゴースト・ツールチップへ適用。`'auto'` は `prefers-color-scheme` へ追従(Mantine /
   * HeroUI 等クラスベース dark 運用では、利用側カラースキームの解決値を `'light' | 'dark'`
   * で渡す使い方を推奨)。個別の色調整はトークン(`--ssg-*`)の上書きで可能。
   *
   * @defaultValue `'light'`
   */
  theme?: GridTheme;
  // 追加(motion-0): モーションの有効化です(既定 'auto')。'off'(または 'auto' + prefers-reduced-motion)では
  //   root と全ポータル root・ドラッグゴースト・ツールチップへ .ssg-motion-off が付き、継続時間トークン
  //   (--ssg-motion-fast / base / slow)が 0 になります(styles.css)。各効果はトークンだけを参照します。
  /**
   * モーション(アニメーション / トランジション)の有効化。`'auto'` は OS /
   * ブラウザの「視差効果を減らす」(`prefers-reduced-motion: reduce`)が有効なら `'off'`、それ以外は
   * `'on'` として扱う。`'off'` では root と全ポータル(popover / menu / panel)
   * ・ドラッグゴースト・ツールチップへ `.ssg-motion-off` が付き、
   * 継続時間トークン(`--ssg-motion-fast` / `--ssg-motion-base` / `--ssg-motion-slow`)が 0
   * になって動きが止まる(表示結果は同じ)。`'on'` は OS 設定に関わらず動かす。
   * 速さの調整はトークンの上書き。詳細は「モーション」節。
   *
   * @defaultValue `'auto'`
   */
  motion?: GridMotion;
  // 追加(motion-3 / M-4・M-5): 行の並び替え(ソート / フィルター / グループ開閉 / データ差し替え)で、描画中の行を
  //   新しい位置へ滑らせ、スクロールなしで現れた行をフェードインさせます(既定 true)。auto-height / serverSide では
  //   自動で無効(行高の実測 / ブロック到着と干渉するため)。motion の実効値が 'off' なら動きません。
  /**
   * 行の並び替えアニメ。ソート / フィルター / グループ開閉 / `rows` の差し替えで、
   * 描画中の行が新しい位置へ滑り(`--ssg-motion-base`)、
   * スクロールなしで現れた行は上から順にフェードインする。
   * スクロール中の仮想化による出入りは対象外。auto-height 行と serverSide(SSRM)では自動で無効。
   * `motion` の実効値が `'off'` なら動かない。詳細は「モーション」節。
   *
   * @defaultValue `true`
   */
  animateRows?: boolean;
  // 追加(motion-4 / M-3): Ctrl/Cmd+C したあと、コピー元の範囲に Excel と同じ「動く点線」を残します(既定 true)。
  //   Esc / 編集開始で消え、ソート / フィルター / グループ開閉 / 行数 / 列の変化で描画しなくなります。
  /**
   * `Ctrl/Cmd+C` のあと、コピー元の範囲に Excel と同じ「動く点線」
   * を残す(`.ssg-copy-range-overlay`。`motion` が `'off'` なら静的な点線)。`Esc` と編集開始で消え、
   * ソート / フィルター / グループ開閉 / 行数 / 列の変化で描画しなくなる(貼り付けでは残る)。`false`
   * で点線を出さない(コピー自体は従来どおり)。
   *
   * @defaultValue `true`
   */
  showCopyRange?: boolean;
  // 追加(motion-5 / M-6): ホバーの強調範囲。'row'(既定 = 従来)はポインタの行だけ。'cross' はその行に加えて
  //   ポインタの列(列ヘッダー・同じ列の他セルの薄い帯)と行番号も染め、交点が分かるクロスヘア表示。
  /**
   * ホバーの強調範囲。`'row'` はポインタの行だけ(従来)。`'cross'` はその行に加えて、
   * ポインタの列(列ヘッダー + 同じ列の他セルに薄い帯 `.ssg-col-hover-overlay`)
   * と行番号も染めるクロスヘア表示。色はトークン `--ssg-col-hover-bg`(帯)/
   * `--ssg-select-bg`(ヘッダー・行番号)。横に長い表で「この値はどの列か」
   * を視線移動なしで答えるため。
   *
   * @defaultValue `'row'`
   */
  hoverHighlight?: 'row' | 'cross';
  // 追加(motion-6 / M-2): rows が変わったとき、値が変わったセルを一瞬アクセント色で光らせ、数値は旧値から新値へ
  //   カウントアップする(既定 false)。clientSide 専用。描画中のセルだけが対象で、変更が多いとき(2,000 セル超 / 構造変化)
  //   は何もしない。
  /**
   * `rows` が変わったとき、値が変わったセルを一瞬アクセント色で光らせ(`.ssg-body-cell--changed`、
   * `--ssg-motion-slow`)、数値の既定セルは旧値から新値へカウントアップする(`--ssg-motion-base`。
   * 表示は `valueFormatter` で整形)。セル編集 / 貼り付け / クリア / undo・redo / 外部からの `rows`
   * 差し替えのすべてが対象。clientSide 専用(SSRM では無効)。描画中のセルだけが対象で、
   * 変わったセルが 200 を超えるとフラッシュのみ、2,000 を超える・行の挿入 / 削除 /
   * 並べ替えを伴う・参照の変わった行が 5,000 を超える(データの読み直し)ときは何もしない。
   *
   * @defaultValue `false`
   */
  highlightChanges?: boolean;
  /**
   * 行番号列の幅(px)。
   *
   * @defaultValue `56`
   */
  rowHeaderWidth?: number;
  // 追加: グリッドの明示高さです。値の種類で「何の高さか」が変わります(変更: fill-height)。
  //   - '%' を含む文字列('100%' / '50%' / 'calc(100% - 40px)' 等): トップバー / フィルターチップバー /
  //     ボトムバーを含むグリッド全体(.ssg-root)の高さ。'100%' で親要素いっぱいに収まり、バーを除いた
  //     残りがスクロール領域になります。親要素が確定高さを持つ前提です(高さ auto の親だと全行分まで
  //     伸び、仮想化が効きません)。ルートに .ssg-root--fill-height が付きます。
  //   - number(px)/ '%' を含まない文字列('400px' / '50vh' / 'calc(100vh - 120px)' 等): スクロール
  //     領域(.ssg-scroll-container)の高さ。グリッド全体はバーの分だけ高くなります(従来どおり)。
  //   - 未指定: スクロール領域は内容の高さで、上限 maxHeight(未指定なら 480px)でクリップされます。
  /**
   * グリッドの明示高さ。**値の種類で何の高さかが変わる**。① `%` を含む文字列(`'100%'` / `'50%'` /
   * `'calc(100% - 40px)'`):
   * トップバー・フィルターチップバー・ボトムバーを含む**グリッド全体**の高さ。`'100%'`
   * でグリッドが親要素に収まり、バーを除いた残りがスクロール領域になる(ルートに
   * `ssg-root--fill-height` が付く)。親要素が確定高さを持つ前提で、親が高さ `auto`
   * だと全行分まで伸びて仮想化が効かない。② `number`(px)/ `%` を含まない文字列(`'400px'` / `'50vh'`
   * / `'calc(100vh - 120px)'`): **スクロール領域だけ**の高さ(グリッド全体はバーの分だけ高くなる)。③
   * 未指定: スクロール領域は内容の高さで `maxHeight` によりクリップ。ルートへの
   * `style={{ height }}` だけではスクロール領域は決まらないため、高さはこの prop で指定する。
   */
  height?: number | string;
  // 追加: スクロール領域(.ssg-scroll-container)の高さ上限です。height の種類に関わらず常にスクロール
  //   領域に効きます(バーは含みません)。height・maxHeight が共に未指定のときのみ既定 480px です。
  //   - number height と併用: スクロール領域 = min(height, maxHeight)。
  //   - '%' height と併用: スクロール領域 = min(maxHeight, 親の高さ − バー)。親が大きければグリッド全体は
  //     バー + maxHeight に縮みます。
  /**
   * **スクロール領域**の高さ上限(バーは含まない。`height` の種類に関わらず同じ)。
   * `height`・`maxHeight` が**共に未指定のときのみ**既定の 480px が効く（従来挙動）。数値の
   * `height` と併用するとスクロール領域 = `min(height, maxHeight)`、`%` の `height` と併用すると
   * `min(maxHeight, 親の高さ − バー)`(親が大きければグリッド全体はバー + `maxHeight` に縮む)。
   *
   * @defaultValue `—`（既定 480px）
   */
  maxHeight?: number | string;
  /**
   * グリッド全体の編集を無効化。編集中に `true` へ切り替わった場合、
   * その編集は確定時に書き込まれず終了する(`canEditCell` も確定時に再評価)。`renderCell` の
   * `ctx.setValue` は対象外で、`readOnly` 中も書き込める(`ctx.readOnly` を見て利用側で無効化する)。
   * 行ドラッグによる並べ替え(`enableRowDrag`)も対象外(セル値の編集ではないため)で、止める場合は
   * `enableRowDrag={!readOnly}` を渡す。
   *
   * @defaultValue `false`
   */
  readOnly?: boolean;
  // 追加(THEME-3): readonly セルの組み込み淡色表示(背景 + 文字色)の opt-in です。
  //   既定 false = readonly でも色変化なし。false でもセマンティッククラス
  //   (.ssg-body-cell--readonly)は常時付与されるため、利用側 CSS のフックとして使えます。
  /**
   * readonly セルの組み込み淡色表示(背景 + 文字色)を有効化。`false` でもセマンティッククラス
   * `.ssg-body-cell--readonly` は常時付与され、利用側 CSS のフックに使える。
   *
   * @defaultValue `false`
   */
  dimReadOnlyCells?: boolean;
  /** セル単位の編集可否ゲート。 */
  canEditCell?: (
    rowIndex: number,
    colIndex: number,
    row: T,
    column: GridColumn<T, F>,
  ) => boolean;
  // 追加(undo/redo): グリッド編集(セル編集 / ペースト / renderCell の setValue)の取り消し/やり直し
  //   です(既定 true)。Ctrl/Cmd+Z = undo、Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y = redo。ハンドルの
  //   undo() / redo() でも操作できます。clientSide(rows + onRowsChange)専用で、serverSide
  //   (dataSource)/ readOnly / onRowsChange 未指定のときは無効です。履歴は「変更前 rows 配列」の
  //   参照スナップショットです(rows.map 由来の新配列は未変更行を構造共有するため、メモリ負荷は
  //   配列 1 本分)。rows が grid 起点以外(親の直接 setState 等)で差し替わると、履歴は現データと
  //   不整合になるため自動破棄されます。onRowsChange で受け取った配列は参照そのまま rows へ戻すのが
  //   前提です(map 等で作り直して渡すと毎回「外部変更」と見なされ履歴が消えます)。
  //   エディタで編集中の文字入力の取り消しは対象外です(input のネイティブ undo に委譲)。
  /**
   * グリッド編集(セル編集 / ペースト / `renderCell` の `setValue`)の取り消し/やり直し。`Ctrl/Cmd+Z`
   * = undo、`Ctrl/Cmd+Shift+Z` / `Ctrl/Cmd+Y` = redo(ハンドルの `undo()` / `redo()` でも可)。
   * clientSide(`rows` + `onRowsChange`)専用で、serverSide(`dataSource`)/ `readOnly` /
   * `onRowsChange` 未指定時は無効。履歴は「変更前 rows 配列」
   * の参照スナップショット(未変更行は構造共有されるため低コスト)。**`onRowsChange`
   * で受け取った配列は参照そのまま `rows` へ戻すのが前提**(map 等で作り直すと毎回「外部変更」
   * と見なされ履歴が消える)。rows が grid 起点以外(親の直接 setState 等)
   * で差し替わると履歴は自動破棄。エディタ内の文字入力の取り消しは input のネイティブ undo
   * に委譲(グリッドの undo は**確定済みの編集**が対象)。
   *
   * @defaultValue `true`
   */
  enableUndoRedo?: boolean;
  // 追加(clear opt-out): Delete / Backspace キーによる選択セルの値クリアの有効化です
  //   (既定 true = 現行どおり)。false でキーは何もしません(素通し。誤爆防止や
  //   旧バージョン互換の挙動に戻したい消費側向けの opt-out)。ペースト・エディタでの
  //   上書き・undo/redo には影響しません。
  /**
   * `Delete` / `Backspace` キーによる選択セル(なければアクティブセル)の値クリア。`false`
   * でキーは何もしない(素通し)。ペースト・エディタでの上書き・undo/redo
   * には影響しない(クリアのキーボード操作だけの opt-out)。
   *
   * @defaultValue `true`
   */
  enableClearOnDelete?: boolean;
  // 追加(enter-move ②): 組み込みエディタ(text / number / select / date)の Enter 確定後に
  //   アクティブセルをどこへ移すかです(既定 'down' = 下へ)。'none' で移動せずその場に
  //   留まります。Tab / Shift+Tab(右 / 左)と Escape には影響しません。custom エディタは
  //   consumer が ctx.commit(value, direction) で方向を渡すため本 prop の対象外です。
  /**
   * 組み込みエディタ(text / number / select / date)の `Enter`
   * 確定後にアクティブセルをどこへ移すか(`'down'` | `'up'` | `'right'` | `'left'` | `'none'`。Excel
   * の「Enter キーを押したら、セルを移動する(方向)」相当)。`'none'` は移動せずその場に留まる。`Tab`
   * / `Shift+Tab`(右 / 左)と `Escape` には影響しない。custom エディタはキーバインドが consumer
   * 責務のため対象外(`ctx.commit(value, direction)` の direction で指定)。
   *
   * @defaultValue `'down'`
   */
  editorEnterMove?: EditorEnterMove;
  // 追加(G-2): IME オンのままの直接入力(Excel / SPREAD と同じ)。true で、編集していないあいだグリッドのフォーカスを
  //   アクティブセル上の透明な入力受け(input)に置き、IME の変換をそこで始めます。text エディタの編集可能セルでは
  //   変換中の文字をセルの上に表示し、変換を確定すると確定した文字列を初期値に編集を始めます(もう一度 Enter で
  //   セルを確定して移動)。既定 false(opt-in)の理由: 有効中はグリッドにフォーカスがあるあいだ
  //   document.activeElement が input になり、入力欄では反応しないアプリのショートカットが効かなくなるため。
  /**
   * **IME オンのままの直接入力**(Excel / SPREAD と同じ)。`true` で、
   * 編集していないあいだグリッドのフォーカスをアクティブセル上の透明な入力欄(入力受け)に置き、IME
   * の変換をそこで始める。text エディタ(`editor` 未指定 / `type: 'text'`)
   * の編集可能セルでは変換中の文字をセルの上に表示し、
   * 変換を確定すると確定した文字列を初期値に編集を始める(もう一度 `Enter` でセルを確定して移動)。
   * それ以外の列(number / select / date / checkbox / custom)
   * と読み取り専用セルでは変換を捨てる(従来どおり何も入らない)。キー操作 / コピー・貼り付け / `Tab`
   * は従来どおり。既定 OFF の理由: 有効中はグリッドにフォーカスがあるあいだ
   * `document.activeElement` が入力欄になり、入力欄では反応しないアプリのショートカット(例: Mantine
   * の `useHotkeys` の既定)が効かなくなるため。詳細は「IME オンのままの直接入力」節。
   *
   * @defaultValue `false`
   */
  imeDirectInput?: boolean;
  // 追加(undo/redo): 保持する undo ステップ数の上限です(既定 100)。超過分は古い順に破棄します。
  /**
   * 保持する undo ステップ数の上限。超過分は古い順に破棄。
   *
   * @defaultValue `100`
   */
  undoHistoryLimit?: number;
  // 追加(undo/redo 通知): undo / redo 可能状態が変化したときに呼ばれます(ツールバーの
  //   undo/redo ボタンの disabled 表示など、リアクティブな UI 用。命令的な canUndo()/canRedo()
  //   のポーリングを不要にします)。発火規約:
  //   - 初回マウントでは発火しません({canUndo:false, canRedo:false} が基準)。
  //   - 値が実際に変化したときだけ発火します(同値では再発火しない)。
  //   - 毎レンダーで新しいインライン関数を渡しても問題ありません。
  /**
   * undo / redo 可能状態が**変化したとき**に呼ばれる(ツールバーの undo/redo ボタンの disabled
   * 表示などリアクティブな UI 用)。初回マウントでは発火せず、同値では再発火しない。
   * 毎レンダーのインライン関数でも問題ない。
   */
  onUndoRedoStateChange?: (state: UndoRedoState) => void;
  /**
   * 複数セル範囲選択。
   *
   * @defaultValue `true`
   */
  enableRangeSelection?: boolean;
  // ── 追加(行選択): チェックボックス行選択(セル範囲選択とは別レイヤー)──
  //   参照性能を落とさない設計(判定 O(1) / 全選択は除外集合)。既定 false で完全に無効。
  //   有効時は行ヘッダ(行NO)ガターが行選択のヒット領域になり、Excel 風のガター起点セル範囲
  //   選択は off になります(ボディ側セルのドラッグ範囲選択は不変)。
  // 行選択を有効化するマスタースイッチです(既定 false)。
  /**
   * チェックボックス行選択の有効化(マスタースイッチ)。`true` で行ヘッダ(行NO)
   * ガターが行選択のヒット領域になり、Excel 風のガター起点セル範囲選択は
   * off(ボディ側セルのドラッグ範囲選択は不変)。判定は O(1)・全選択は除外集合でキーを列挙しない(1M
   * 行でも一定コスト)。
   *
   * @defaultValue `false`
   */
  enableRowSelection?: boolean;
  // 単一/複数の選択モードです(既定 'multiple')。single は常に 1 行だけ。
  /**
   * 単一/複数の選択モード。single は常に 1 行。multiple はクリックでトグル、
   * shift+クリック/ガタードラッグで範囲選択。
   *
   * @defaultValue `'multiple'`
   */
  rowSelectionMode?: RowSelectionMode;
  // ヘッダの全選択チェック(tri-state)の有効化です。
  //   既定は enableRowSelection && rowSelectionMode==='multiple'。
  /**
   * ヘッダ左上コーナーの全選択チェック(tri-state: none/some/all)の有効化。
   *
   * @defaultValue `enableRowSelection && multiple`
   */
  enableSelectAllRows?: boolean;
  // controlled: 行選択の記述子です(指定時は controlled。未指定は内部 state=uncontrolled)。
  //   include=これらを選択 / exclude=全選択のうち除外。全選択をキー列挙せず表現できます。
  /**
   * **controlled** の行選択記述子。`{ type:'include', rowKeys }`=これらを選択 /
   * `{ type:'exclude', rowKeys }`=全選択のうち除外。全選択をキー列挙せず表現できる。指定時は
   * controlled(内部 state を使わない)。
   */
  rowSelection?: RowSelectionModel;
  // controlled 簡易版: 選択キー配列です({ type:'include', rowKeys } の糖衣)。
  //   rowSelection と併用時は rowSelection を優先します。全選択(exclude)は表現できません。
  /**
   * controlled 簡易版(`{ type:'include', rowKeys }` の糖衣)。`rowSelection` と併用時は
   * `rowSelection` を優先。全選択(exclude)は表現不可。
   */
  selectedRowKeys?: GridRowKey[];
  // 選択変化の通知です(controlled/uncontrolled いずれでも発火)。
  /** 行選択変化の通知(controlled/uncontrolled いずれでも発火)。 */
  onRowSelectionChange?: (model: RowSelectionModel) => void;
  /**
   * グローバルフィルター**機能**の有効化。`false` で機能が無効になり、
   * 既定トップバーのフィルター入力欄も出ない(summary は `showTopBarSummary` に従う。
   * トップバー自体を消すには `showTopBar=false`)。
   *
   * @defaultValue `true`
   */
  enableGlobalFilter?: boolean;
  /**
   * 列ごとのフィルター。
   *
   * @defaultValue `true`
   */
  enableColumnFilter?: boolean;
  // 追加(date-input): dateSet フィルター条件の日付入力(ネイティブ <input type="date">)を
  //   利用側コンポーネント(Mantine DatePickerInput 等)へ差し替えるスロットです。
  //   未指定はネイティブ input(従来挙動)。値の契約は FilterDateInputContext を参照。
  //   ポップアップを body 直下ポータルへ出すピッカーは、外側クリック判定から除外するため
  //   ポップアップ要素へ data-ssg-filter-keep-open 属性を付与するか、ピッカーの
  //   withinPortal 相当を無効化して popover 内に描画すること(どちらでも可)。
  /**
   * dateSet フィルター条件の日付入力を利用側コンポーネント(Mantine `DatePickerInput` 等)
   * へ差し替えるスロット。既定は内製フィールド(自由入力 + ドリルアップカレンダー。下記「dateSet
   * の日付入力(既定 UI)」節)。詳細は「日付入力の差し替え(renderFilterDateInput)」節。
   *
   * @defaultValue 内製の日付フィールド
   */
  renderFilterDateInput?: (ctx: FilterDateInputContext) => F['node'];
  // 追加(async-options): set / select / 複合列の候補を非同期に供給するコールバックです(DB の DISTINCT 等)。
  //   優先順位は column.filterOptions(静的)> getFilterOptions > rows からの自動収集。popover を開くたびに
  //   呼び、閉じる / 列切替で signal を abort。読み込み中 / 失敗(再試行)/ 打ち切りの表示は popover が持つ。
  //   非同期候補の列は反転(exclude)可。clientSide / serverSide どちらでも使える(serverSide の
  //   「候補が未指定」表示の代わりになる)。
  /**
   * set / select / 複合(numberSet / textSet / dateSet)列の候補を**非同期に供給**する(DB の DISTINCT
   * など)。popover を開くたびに
   * `{ columnKey, column, columnFilters(自列を除く他列の有効フィルター), globalText, signal }`
   * で呼ばれ、閉じる / 列切替で `signal` が abort される(ライブラリはキャッシュしない)。読み込み中
   * / 失敗(再試行)/ 打ち切り(`truncated`)の表示は popover が持つ。優先順位は
   * `column.filterOptions`(静的)> `getFilterOptions` > rows 自動収集。非同期候補の列は反転(exclude)
   * 可。clientSide / serverSide 両対応。詳細は「ソートとフィルター」ガイド。
   */
  getFilterOptions?: (params: GetFilterOptionsParams<T, F>) => Promise<GetFilterOptionsResult>;
  /**
   * ソート機能の有効化。ソートは列メニュー(⋮)の「昇順 / 降順で並び替え」と「並び替えを管理…」
   * パネルから行う(ヘッダー本体のクリックは列範囲選択)。`false` でメニューのソート項目が消え、
   * `applyState` 等で載った `sort` も適用されない。ソート順は値で決まり、数値として解釈できる値 →
   * 文字列(日本語照合・数字は数値順)→ 空白セル(null / undefined / 空文字)
   * の順。**空白セルは昇順でも降順でも末尾**(Excel と同じ)。
   *
   * @defaultValue `true`
   */
  enableSorting?: boolean;
  // 追加(manual-mode): 列 / グローバルフィルターの「絞り込み」をグリッドで行わない(既定 false)。
  //   フィルター UI(popover / チップバー / フィルター管理 / フィルター中の印)と状態
  //   (GridState.filters / onStateChange / onFiltersChange)は従来どおり動き、行の絞り込みだけを外部
  //   (サーバ側 WHERE 等)へ委ねる用途。rows は渡した件数・順のまま表示される。rows が 0 件でフィルターが
  //   載っているときは noMatchingRowsText を出す。serverSide(dataSource)では元々グリッドが絞らないため無視。
  /**
   * 列 / グローバルフィルターの**絞り込みをグリッドで行わない**(手動フィルターモード)。フィルター
   * UI(popover / チップバー / フィルター管理 / フィルター中の印)と状態(`GridState.filters` /
   * `onStateChange`)は従来どおり動き、`rows` は渡した件数・順のまま表示される(絞り込みはサーバ側
   * WHERE 等の外部責務)。`rows` が 0 件でフィルターが載っているときは `noMatchingRowsText` を表示。
   * serverSide(`dataSource`)では無視。詳細は「ソートとフィルター」ガイド。
   *
   * @defaultValue `false`
   */
  manualFiltering?: boolean;
  // 追加(manual-mode): ソートの並べ替えをグリッドで行わない(既定 false)。ソート UI(ヘッダーの矢印 /
  //   列メニュー)と状態(GridState.sort / onStateChange / onSortChange)は従来どおり動き、rows は渡した順の
  //   まま表示される。再マウントなしで切り替えられる(false へ戻すと即座にクライアントソートが適用される)。
  //   ラベル行の sortMode と行ドラッグの可否は「実際に並べ替えているか」で判定するため、手動ソート中は
  //   非ソート扱い(行ドラッグは rows 順のまま操作可能)。serverSide では無視。
  /**
   * ソートの**並べ替えをグリッドで行わない**(手動ソートモード)。ソート UI と状態(`GridState.sort` /
   * `onStateChange`)は従来どおり動き、`rows` は渡した順のまま。再マウントなしで切り替え可(`false`
   * へ戻すと即座にクライアントソートが適用)。手動ソート中はラベル行の `sortMode` 連動 /
   * 行ドラッグの無効化は起きない(並べ替えていない扱い)。serverSide では無視。
   *
   * @defaultValue `false`
   */
  manualSorting?: boolean;
  // 追加(①): 列幅の手動リサイズ可否のグリッド既定です(既定 true=現行挙動)。
  //   各列の column.resizable が未指定のとき本値を継承します(column.resizable ?? enableColumnResize)。
  /**
   * 列幅の手動リサイズ可否のグリッド既定。各列 `resizable`
   * 未指定時に継承(`column.resizable ?? enableColumnResize`)。
   *
   * @defaultValue `true`
   */
  enableColumnResize?: boolean;
  // 追加: データ投入時に全列幅を内容へ自動フィットさせるモードです(既定 false)。
  //   詳細と suppressAutoSize / autoHeight 列の除外については AutoSizeColumnsMode を参照。
  /**
   * データ投入時に全列幅を内容へ自動フィット。`'onMount'`=初回にデータが載った一度きり /
   * `'onDataChange'`=`rows`(参照)が変わるたび(= データ差し替えのたび。手動リサイズは上書き) /
   * `false`=無効。計測は列メニュー「すべての列の幅を自動調整」と同一エンジン(`suppressAutoSize` /
   * `autoHeight` 列は除外)。フィルター / ソート / 列並べ替えでは再フィットしません。
   * serverSide(`dataSource`)では無効。詳細は「flex と autoSize」節。
   *
   * @defaultValue `false`
   */
  autoSizeColumns?: AutoSizeColumnsMode;
  // 追加: セル内容が省略(…)される列で、ホバー時に全文ツールチップを表示します(既定 false)。
  //   対象は既定テキストセルのみ(renderCell 列 / autoHeight 折り返し列は対象外)。表示はホバー時に
  //   scrollWidth > clientWidth を判定し、実際にクリップされているセルのみ出します(全文はセルの
  //   表示テキストをそのまま使用)。既存のカスタムツールチップ機構(data-ssg-tooltip)を共有します。
  /**
   * セル内容が省略(…)される列で、ホバー時に全文ツールチップを表示。
   * 対象は既定テキストセルのみ(`renderCell` 列 / `autoHeight` 折り返し列は対象外)。表示はホバー時に
   * `scrollWidth > clientWidth` を判定し、実際にクリップされているセルのみ。
   * 既存のカスタムツールチップ(`data-ssg-tooltip`)を共有。詳細は「ツールチップ」節。
   *
   * @defaultValue `false`
   */
  showCellOverflowTooltip?: boolean;
  // 追加(validation 表示制御): invalid マーク(背景 + コーナーマーカー + ホバーツールチップ)を
  //   表示するかどうかです。既定 true = 現行挙動(常時リアルタイム表示)。false では表示を出さず、
  //   可視セルごとの validate 評価もスキップします(評価結果はマーク表示にしか使わないため)。
  //   送信時にだけマークを出す UX は、利用側の state でこの prop を切り替えて実現します
  //   (宣言的・stateless — 表示時導出の設計を維持し、undo / 外部 rows 差し替え後も rows と整合)。
  //   注意: getInvalidCells() は表示状態と無関係に常に全走査で動作します。validationMode 'reject'
  //   の書き込み拒否(エディタのエラーバブル含む)は write 時ゲートであり本 prop の影響を受けません。
  /**
   * invalid マーク(背景 + 右上マーカー + ホバーツールチップ)の表示可否。`false` で非表示 +
   * 可視セルの `validate` 評価スキップ。`getInvalidCells()` と `validationMode: 'reject'`
   * の書き込み拒否には影響しない(独立経路)。「送信時にだけマークを出す」UX は利用側 state で本 prop
   * を切り替えて実現(「バリデーション」節のレシピ参照)。
   *
   * @defaultValue `true`
   */
  showValidationMarks?: boolean;
  // 追加(UI hover): 行ホバー時に行全体を薄くハイライトします。既定 true。
  /**
   * 行ホバー時に行全体を薄くハイライト。
   *
   * @defaultValue `true`
   */
  enableRowHover?: boolean;
  // 追加(proposals ⑩): 行ホバーの controlled 値です(ビュー行 index / null = ホバーなし)。
  //   指定時は内部 state を使わず、この値でハイライトします(optionally controlled。pointer 由来の
  //   変化は onHoveredRowChange で通知のみ)。enableRowHover: false のときは無視されます
  //   (ハイライトしない / 通知しない)。一時的な UI 状態のため GridState(getState / applyState)
  //   とハンドルには載せません。
  /**
   * 行ホバーの controlled 値(ビュー行 index / `null` = ホバーなし)。指定時は内部 state
   * を使わずこの値でハイライトし、pointer 由来の変化は `onHoveredRowChange` で通知のみ(optionally
   * controlled)。`enableRowHover: false` のときは無視(ハイライトも通知もしない)。一時的な UI
   * 状態のため `GridState` / ハンドルには載らない。
   */
  hoveredRowIndex?: number | null;
  // 追加(proposals ⑩): 行ホバーが変わったときの通知です(uncontrolled でも呼ばれます)。
  //   viewRowIndex はフィルター / ソート適用後のビュー行 index です。同値では発火しません
  //   (pointerenter は同一行内のセル跨ぎでも来るため)。source は将来の拡張用です(現状 'pointer' のみ)。
  /**
   * 行ホバーが変わったときの通知(uncontrolled でも呼ばれる)。`viewRowIndex` はフィルター /
   * ソート適用後のビュー行 index。同値では発火しない(pointerenter
   * は同一行内のセル跨ぎでも来るため)。用途: 複数グリッド間のホバー同期など。
   */
  onHoveredRowChange?: (
    viewRowIndex: number | null,
    ctx: { source: 'pointer' },
  ) => void;
  // ── 追加(G-1): セル操作の通知 ──
  //   データセル(データ行 × 利用側の列)の click で呼びます。左ボタンのみ・押した位置と離した位置が同じセルのとき
  //   だけ(範囲選択のドラッグはクリック扱いにしない)。読み取り専用セルでも呼びます。セル内の要素(checkbox 等)の
  //   クリックもそのセルのクリックとして通知します。インライン関数可(エンジンの update 経由で最新を読む)。
  /**
   * データセル(データ行 × 利用側の列)のクリックで呼ばれる。左ボタンのみで、
   * 押した位置と離した位置が同じセルのときだけ呼ばれる(範囲選択のドラッグはクリック扱いにしない)。
   * 読み取り専用セルでも呼ばれ、セル内の要素(checkbox 等)
   * のクリックもそのセルのクリックとして通知する。`params` は
   * `GridCellRef<T>`(`{ row, rowKey, rowIndex, sourceRowIndex, column, columnKey, colIndex, value }`)+
   * `event`(DOM 標準の `MouseEvent`)。列ヘッダー / 行番号 / グループ行 / ラベル行 / 展開行 / SSRM
   * の未ロード行 / 合成列(展開トグル・行ドラッグハンドル)では呼ばれない。インライン関数可。
   * 詳細は「セル操作の通知」節。
   */
  onCellClick?: (params: GridCellEventParams<T, F>) => void;
  //   データセルのダブルクリック(タッチのダブルタップ含む)で、既定の動作(編集開始)の前に呼びます。
  //   読み取り専用セルでも呼びます。params.preventDefault() で既定の動作を止められます。
  /**
   * データセルのダブルクリック(タッチのダブルタップ含む)で、既定の動作(編集可能セルなら編集開始)
   * の前に呼ばれる。読み取り専用セルでも呼ばれる。`params.preventDefault()`
   * で既定の動作を止められる(`params.event.preventDefault()` では止まらない)。対象のセルは
   * `onCellClick` と同じ。インライン関数可。
   */
  onCellDoubleClick?: (params: GridCellDoubleClickParams<T, F>) => void;
  //   由来(クリック / キー操作 / handle.selectCell 等)を問わず、アクティブセルが変わったときに呼びます
  //   (passive タイミング = ペイント後)。アクティブセルが無くなった / データセル以外へ移ったときは null。
  //   (rowKey, columnKey, rowIndex, colIndex)が同じなら呼びません(同じセルへの再設定)。初回マウントでは呼びません。
  /**
   * アクティブセルが変わったときに呼ばれる(クリック / キー操作 / `setActiveCell`
   * など由来を問わない)。アクティブセルが無くなった / データセル以外(グループ行 / ラベル行 /
   * 未ロード行 / 合成列)へ移ったときは `null`。行キー・列キー・位置(`rowIndex` / `colIndex`)
   * がすべて同じなら呼ばれない(同じセルへの再設定)。座標が同じでも、
   * ソートなどでその位置の行が変われば呼ばれる。初回マウントでは呼ばれない。
   * 通知はペイント後(クリックでは `onCellClick` より先)。インライン関数可。
   */
  onActiveCellChange?: (cell: GridCellRef<T, F> | null) => void;
  // 追加(UI hover): 列ヘッダーのホバー時にヘッダーセルを薄くハイライトします。既定 true。
  /**
   * 列ヘッダーのホバー時にヘッダーセルを薄くハイライト。
   *
   * @defaultValue `true`
   */
  enableColumnHeaderHover?: boolean;
  // 追加(13-A): 列メニュー(「⋮」ボタン + ヘッダー右クリック)の有効化フラグです。
  //             既定は true。メニューからの列固定切替は columns が controlled のため
  //             onColumnsChange が指定されている場合にのみ反映されます
  //             (未指定時はメニュー項目が無効表示になります)。
  /**
   * 列メニュー(⋮ + ヘッダー右クリック)。
   *
   * @defaultValue `true`
   */
  enableColumnMenu?: boolean;
  // 追加(12-B): フィルター結果 0 行時に表示するテキストです
  //             (AG Grid の "No Matching Rows" オーバーレイ相当)。
  /**
   * フィルター結果 0 行時のオーバーレイ文言。
   *
   * @defaultValue `'一致する行がありません'`
   */
  noMatchingRowsText?: string;
  // 追加(12-B): rows 自体が 0 件のときに表示するテキストです
  //             (AG Grid の "No Rows To Show" 相当)。
  /**
   * rows が 0 件のときの文言。
   *
   * @defaultValue `'表示する行がありません'`
   */
  noRowsText?: string;
  // 追加: 上部バー(ツールバー)を表示するかどうかです。既定 true。
  //   false にすると renderTopBar / enableGlobalFilter に関わらず上部バーを一切描画しません
  //   (表示のマスタースイッチ。矛盾指定時は renderTopBar より優先されます)。
  /**
   * 上部バー(ツールバー)の表示有無。`false` で `renderTopBar` / `enableGlobalFilter`
   * に関わらず一切描画しない(表示のマスタースイッチ。矛盾指定時は `renderTopBar` より優先)。
   *
   * @defaultValue `true`
   */
  showTopBar?: boolean;
  // 追加: 既定トップバーの summary chips(件数/フィルター/ソート)を表示するかどうかです。既定 true。
  //   既定トップバー(renderTopBar 未指定)のときのみ効きます。これと showTopBarFilter の両方が
  //   非表示(かつフィルター入力も出ない)場合、トップバーは描画されません(空バーは出しません)。
  /**
   * 既定トップバーの summary chips(件数/フィルター/ソート)の表示有無。`renderTopBar`
   * 未指定時のみ有効。これと `showTopBarFilter`
   * がともに非表示なら既定トップバーは描画されない(空バーを出さない)。
   *
   * @defaultValue `true`
   */
  showTopBarSummary?: boolean;
  // 追加: 既定トップバーの Rows / Columns 件数 chips を表示するかどうかです。既定 true。
  //   既定トップバー(renderTopBar 未指定)かつ showTopBarSummary=true のときのみ効きます
  //   (Filter / Sort chips は本値の対象外で、showTopBarSummary に従います)。
  /**
   * 既定トップバーの Rows / Columns 件数 chips の表示有無。`showTopBarSummary=true`(かつ
   * `renderTopBar` 未指定)のときのみ有効。Filter / Sort chips は対象外。
   *
   * @defaultValue `true`
   */
  showTopBarCounts?: boolean;
  // 追加: 既定トップバーのグローバルフィルター入力欄を表示するかどうかです。既定 true。
  //   既定トップバー(renderTopBar 未指定)のときのみ効きます。enableGlobalFilter=false のときは
  //   本値に関わらず入力欄を出しません(無効な機能の入力欄を出さないため)。
  /**
   * 既定トップバーのグローバルフィルター入力欄の表示有無。`renderTopBar` 未指定時のみ有効。
   * `enableGlobalFilter=false` のときは本値に関わらず非表示。
   *
   * @defaultValue `true`
   */
  showTopBarFilter?: boolean;
  // 追加: 既定トップバーのグローバルフィルター入力欄の placeholder です。
  //   既定トップバー(renderTopBar 未指定)のときのみ効きます。未指定時は 'グローバルフィルター'。
  /**
   * 既定トップバーのグローバルフィルター入力の placeholder。`renderTopBar` 未指定時のみ有効。
   *
   * @defaultValue `'グローバルフィルター'`
   */
  globalFilterPlaceholder?: string;
  // 追加: 既定トップバーのグローバルフィルター入力欄の「左アイコン」です。
  //   既定トップバー(renderTopBar 未指定)のときのみ効きます。未指定(undefined)時は組み込みの
  //   検索アイコンを表示します。null を渡すとアイコン無し、任意の ReactNode で差し替え可能です。
  /**
   * 既定トップバーのグローバルフィルター入力の左アイコン。`renderTopBar` 未指定時のみ有効。
   * `undefined`=組み込みの検索(虫眼鏡)アイコン / `null`(など falsy)=アイコン無し / 任意
   * `ReactNode`=差し替え。クリアボタンは入力枠の内側右に `×` で表示され、入力が空のときは出ない。
   *
   * @defaultValue 組み込み検索アイコン
   */
  globalFilterIcon?: F['node'];
  // 追加: 下部バー(ステータスバー)を表示するかどうかです。既定 true。
  //   false にすると renderBottomBar に関わらず下部バーを一切描画しません
  //   (表示のマスタースイッチ。矛盾指定時は renderBottomBar より優先されます)。
  /**
   * 下部バー(ステータスバー)の表示有無。`false` で `renderBottomBar`
   * に関わらず一切描画しない(表示のマスタースイッチ。矛盾指定時は `renderBottomBar` より優先)。
   *
   * @defaultValue `true`
   */
  showBottomBar?: boolean;
  // 追加: 既定ボトムバーの Rows / Columns 件数 chips(左側)を表示するかどうかです。既定 true。
  //   既定ボトムバー(renderBottomBar 未指定)のときのみ効きます。右側の Active / Selection /
  //   選択統計 / Cols chips は本値の対象外で常時表示です。
  /**
   * 既定ボトムバーの Rows / Columns 件数 chips(左側)の表示有無。`renderBottomBar`
   * 未指定時のみ有効。右側の Active / Selection / 選択統計 / Cols は対象外。
   *
   * @defaultValue `true`
   */
  showBottomBarCounts?: boolean;
  // 追加(FM-2): フィルターチップバー(適用中の列フィルターをトップバー直下にチップで常時
  //   一覧表示)の表示有無です。既定 false(opt-in)。有効フィルター 0 件のときはバーごと
  //   非表示です(空バーは出しません)。showTopBar とは独立です(トップバー非表示でも出せます)。
  //   チップ本体クリックで対象列へジャンプしてフィルター popover を開き、× でその列を
  //   クリア、末尾の「すべてクリア」は列フィルターのみ対象です(グローバルフィルターは
  //   対象外 = フィルター管理パネルと同じ切り分け)。
  /**
   * フィルターチップバー(適用中の列フィルターをトップバー直下にチップで常時表示)
   * の表示有無(opt-in)。有効フィルター 0 件時はバーごと非表示(空バーは出さない)。`showTopBar`
   * とは独立。チップ本体クリックで対象列へジャンプしてフィルター popover を開き、× で個別クリア、
   * 「すべてクリア」は列フィルターのみ対象(グローバルフィルターは対象外)。
   *
   * @defaultValue `false`
   */
  showFilterChipBar?: boolean;
  // 追加: Grid 上部カスタム領域です。未指定時は既定ツールバー(summary chips + グローバルフィルター
  //   入力)を表示します。既定バーの内訳は showTopBarSummary / showTopBarFilter で出し分けできます
  //   (フィルター入力は enableGlobalFilter=true が前提)。showTopBar=false のときは本指定に関わらず
  //   描画しません。
  /**
   * 上部バーの差し替え。未指定時は内蔵トップバー(summary chips + フィルター入力。内訳は
   * `showTopBarSummary` / `showTopBarFilter` で制御。フィルター入力は `enableGlobalFilter=true`
   * が前提)。`showTopBar=false` 時は本指定に関わらず描画されない。
   *
   * @defaultValue 内蔵トップバー
   */
  renderTopBar?: (context: SpreadsheetGridSlotContext<T, F>) => F['node'];
  // 追加: Grid 下部カスタム領域です。未指定時は既定ステータスバーを表示します。
  //   showBottomBar=false のときは本指定に関わらず描画しません。
  /**
   * 下部バーの差し替え。未指定時は内蔵ステータスバー。`showBottomBar=false`
   * 時は本指定に関わらず描画されない。
   *
   * @defaultValue 内蔵ボトムバー
   */
  renderBottomBar?: (context: SpreadsheetGridSlotContext<T, F>) => F['node'];
  /** ルート要素の class。 */
  className?: string;
  // 追加(slot-props): ルート要素(.ssg-root)へのインライン style です(classNames.root の style と
  //   マージし、こちらが後勝ち)。
  /**
   * ルート要素(`.ssg-root`)のインライン style。`classNames.root` の style とマージされ、
   * こちらが後勝ち。
   */
  style?: F['style'];
  // 追加(UI CSS移行): パーツ別の追加 className スロット(詳細は GridClassNames)。
  // 変更(slot-props): 各値は `string | { className, style }`(GridSlotProps)を受けます。
  /**
   * パーツ別の追加スロット。各値は `GridSlotProps`(`string | { className?, style? }`)で、StyleX の
   * `stylex.props(...)` の戻り値をそのまま渡せる。全 25
   * スロット配線済み(一覧と規則は「パーツ別スロット」節)。
   * レンダー毎に新しいオブジェクトを渡してもよい(内容の署名で memo)。基底 class
   * は未レイヤー・特異度 (0,1,0)
   * のため同特異度のクラスは読み込み順で決まる(確実な上書きは連結セレクタか `style.layer.css`)。
   */
  classNames?: GridClassNames<F>;
  // 追加(UI CSS移行): 行ごとの追加 className を返すコールバック(条件付き行スタイル)。
  //   返り値は行コンテナと各データセルへ付与され、Tailwind 等での行ハイライトに使えます。
  //   (注記: 行ヘッダー「#」セルはヘッダー系スタイルと共有のため現状この対象外です。)
  // 変更(proposals ⑤): 第 3 引数 ctx(RowStyleContext)を追加しました。既存の 2 引数関数は
  //   そのまま動きます(完全後方互換)。ソート / フィルター ON でも source 行基準の突き合わせが
  //   できるよう sourceRowIndex / rowKey を渡します(cellClassName の CellStyleContext と同基準)。
  // 変更(slot-props): 返り値は `{ className, style }` 形(GridSlotProps)も可。style は行コンテナ /
  //   行ヘッダー「#」セル / 各データセルへインラインで付与されます(座標 / 寸法はグリッドが後勝ち)。
  /**
   * 行ごとの追加 class(または `{ className, style }`)。行コンテナ + 行ヘッダー「#」セル +
   * 各データセルに付与され、Tailwind / StyleX での行ハイライトに使える。`style`
   * はインラインで付与され、座標 / 寸法はグリッドが後勝ち(返した style は内容比較で memo される)。
   * 第 3 引数 `ctx` は `{ row, rowIndex, sourceRowIndex, rowKey, isSelected }`(「補助型」節参照)。
   * 既存の 2 引数関数もそのまま動く(後方互換)。グループ行は対象外。
   */
  getRowClassName?: (
    row: T,
    rowIndex: number,
    ctx: RowStyleContext<T>,
  ) => GridSlotProps<F> | undefined;
  // ── 追加(detail ②): 展開行(Master/Detail) ──
  //   指定時のみ有効な opt-in 機能です。詳細は DetailRowOptions を参照。
  /**
   * **展開行(Master/Detail)**。マスター行の直下に、行順(view index)を変えずに全幅の帯を差し込み、
   * その中(カード)へ `render` の返す任意の React 要素(自前のサブグリッド / フォーム / 集計パネル等)
   * を描画する。指定時のみ有効で、未指定なら既存の描画・状態・イベント経路は一切変わらない。
   * `{ render, height?, isExpandable?, showToggleColumn?, className? }`。clientSide / serverSide
   * の両方で使える(serverSide の制約は節内)。詳細は「展開行(Master/Detail)」節を参照。
   *
   * @defaultValue —(無効)
   */
  detailRow?: DetailRowOptions<T, F>;
  // 追加(detail ②): 展開中の行キー集合が変わるたびに通知します(開閉の永続化・外部同期用)。
  /**
   * 展開中の展開行のマスター行キー集合が**変化したとき**に呼ばれる(開閉の永続化・外部同期用)。
   * 初回マウントでは発火しない。インライン関数可(latest-ref 経由)。
   */
  onExpandedDetailRowKeysChange?: (keys: GridRowKey[]) => void;
  // ── 追加(label-row ①): ラベル行(見出し / 区切り行) ──
  //   指定時のみ有効な opt-in 機能です。詳細は LabelRowOptions を参照。
  /**
   * **ラベル行(見出し / 区切り行)**。`rows` の中で `isLabelRow(row)` が true
   * の行を「行数に数えない見出し」として、3 ペインを跨ぐ全幅の帯で描画する(中身は `render` で任意の
   * React 要素に差し替え可。横スクロールしても左端に留まる)。編集 / 選択 / コピー /
   * エクスポートの既定対象外で、行番号も消費しない。ソート /
   * フィルターは既定でラベル行から次のラベル行までの区間(セクション)に閉じる(`sortMode`)。
   * `sticky: true` で現在セクションのラベルを列ヘッダー直下に固定。
   * `{ isLabelRow, getLabel, render?, height?, className?, sticky?, sortMode?, keepEmptySections?, exportText? }`。
   * 行グルーピング(`rowGroup`)とは別機能で併用不可。詳細は「ラベル行(見出し / 区切り行)」節。
   *
   * @defaultValue —(無効)
   */
  labelRow?: LabelRowOptions<T, F>;
  // ── 追加(row-drag ③): 行ドラッグ並び替え ──
  //   true で先頭にドラッグハンドル列(幅 28px の合成列。左固定列があれば左ペイン)を挿入し、
  //   ハンドルを掴んで行を上下へ動かせます(既定 false)。確定時は onRowsChange へ「移動後の
  //   新配列」を渡し(履歴ラッパ経由のため undo/redo 対象)、続けて onRowMove を呼びます。
  //   - clientSide(rows + onRowsChange)専用です。serverSide(dataSource)/ 行グルーピング中 /
  //     onRowsChange 未指定ではハンドル列を出しません。
  //   - ソート / フィルター適用中は表示順と配列順が一致しないため、ハンドルは出したまま操作を
  //     無効化します(淡色 + 理由のツールチップ)。
  //   - 展開行(detailRow)が開いている行は、詳細パネルごと一緒に移動します。
  //   - ドラッグ中はガイド線(挿入位置)とゴーストを表示し、ドロップ後に影響行が新しい位置へ
  //     スライドします(prefers-reduced-motion では即時)。枠外で離す / Escape でキャンセル。
  /**
   * **行ドラッグ並び替え**。先頭にドラッグハンドル列(幅 28px・タイトル無しの合成列。
   * 左固定列があれば左固定側)を挿入し、ハンドル(⋮⋮)を掴んで行を上下へ動かせる。確定時は
   * `onRowsChange` へ移動後の**新配列**を渡し(履歴ラッパ経由 = undo/redo 対象)、続けて `onRowMove`
   * を呼ぶ。clientSide(`rows` + `onRowsChange`)専用で、`dataSource`(serverSide)/ 行グルーピング中 /
   * `onRowsChange` 未指定ではハンドル列を出さない。ソート / フィルター適用中はハンドルを淡色 +
   * 理由ツールチップにして操作を無効化する(列は残る)。詳細は「行ドラッグ並び替え」節。
   *
   * @defaultValue `false`
   */
  enableRowDrag?: boolean;
  // 行ごとにドラッグ可否を決めます(未指定 = 全行可)。false の行にはハンドルを描画しません。
  /**
   * 行ごとのドラッグ可否。`false` の行にはハンドルを描画しない。
   * `ctx = { rowKey, sourceRowIndex }`。
   *
   * @defaultValue 全行可
   */
  isRowDraggable?: (row: T, ctx: RowDragContext) => boolean;
  // 行移動の確定後(onRowsChange の直後)に呼ばれます(サーバ保存 / 監査ログ等)。
  //   命令的 API moveRow() による移動でも呼ばれます。
  /**
   * 行移動の確定後(`onRowsChange` の直後)に呼ばれる。
   * `params = { rowKey, fromIndex, toIndex, rows }`(index は元 `rows` 配列基準、`rows` は
   * `onRowsChange` と同じ新配列参照)。ハンドルの `moveRow()` による移動でも呼ばれる。
   */
  onRowMove?: (params: RowMoveParams<T>) => void;
  // ── 追加(バッチ②/コンテキストメニュー): セル/行の汎用コンテキストメニュー(完全カスタム) ──
  //   有効化のマスタースイッチです(既定 false=OFF)。他機能の enable* と同じく、機能自体は既定で無効。
  //   false のあいだは getContextMenuItems を渡しても発火せず、右クリックはブラウザ標準メニューのままです。
  //   注記: 現状はまだ機能面/UI 面に改善余地があるため既定 OFF で提供します(利用側で明示 opt-in)。
  /**
   * コンテキストメニュー機能の有効化(マスタースイッチ)。他機能の `enable*` と同じく**既定 OFF**。
   * `false` のあいだは `getContextMenuItems` を渡しても発火せず、
   * 右クリックはブラウザ標準メニューのまま。現状はまだ機能 / UI に改善余地があるため既定 OFF
   * で提供する(利用側で明示 opt-in)。
   *
   * @defaultValue `false`
   */
  enableContextMenu?: boolean;
  //   右クリック時のみ呼ばれ、返した項目でメニューを描画します(ライブラリは固定の既定項目を持ちません)。
  //   opt-in は enableContextMenu={true} かつ本コールバックの指定の両方が必要です。未指定、または [] を
  //   返したときはブラウザ標準の右クリックメニューへフォールスルーします(空のパネルは表示しません)。
  //   SSRM 未ロード行では開きません。ヘッダー右クリックは列メニュー(enableColumnMenu)が担当し、本メニューは
  //   ボディ(セル/行NO ガター)専用です。
  /**
   * セル/行の**完全カスタム**コンテキストメニュー。右クリック時のみ呼ばれ、
   * 返した項目でメニューを描画する(ライブラリは固定の既定項目を持たない)。opt-in は
   * `enableContextMenu={true}` かつ本コールバックの指定の両方。**未指定、または `[]`
   * を返したときはブラウザ標準の右クリックメニューへフォールスルー**(空パネルは出さない)。SSRM
   * 未ロード行では開かない。ヘッダー右クリックは列メニュー(`enableColumnMenu`)が担当し、
   * 本メニューはボディ(セル / 行NO ガター)専用。詳細は「コンテキストメニュー」節を参照。
   */
  getContextMenuItems?: (
    params: GridContextMenuParams<T, F>,
  ) => GridContextMenuItem<F>[];
  // 追加(バッチ②): コンテキストメニューが実際に開いた直後の通知です(項目が 1 件以上あり表示された場合のみ)。
  /**  */
  onContextMenuOpen?: (params: GridContextMenuParams<T, F>) => void;
  // ── 追加(scrollHint): スクロール位置インジケーター ──
  //   スクロール中に「今どの行にいるか」を示すオーバーレイです(既定 undefined = 完全無効)。
  //   true で全部入り(行番号バブル + 行目盛りルーラー)、オブジェクトで個別設定します
  //   (詳細は ScrollHintOptions)。表示は総行数とスクロール位置のみで駆動されるため
  //   clientSide / SSRM の全構成で動作します。装飾オーバーレイ(pointer-events: none)のため
  //   既存のスクロール/クリック操作には一切干渉しません。
  /**
   * **スクロール位置インジケーター**。スクロール中にスクロールバー脇へ行番号バブル(「行 N /
   * 総行数」+ 任意の列値)と行目盛りルーラーを表示し、スクロールバー帯のホバーで「行 N へ」
   * のジャンプ先プレビューを出す。`true`
   * は全既定(`{ bubble: true, ruler: true, scrollbar: true, trigger: 'scroll', minRows: 0 }`)
   * と同義。`minRows` で「表示行数がしきい値以上のときだけ有効」のデータ量ゲートも掛けられる。
   * 表示は総行数とスクロール位置のみで駆動されるため **clientSide / SSRM の全構成で動作**。
   * オーバーレイは `pointer-events: none` で既存操作へ一切干渉しない。
   * 詳細は「スクロール位置インジケーター」節を参照。
   *
   * @defaultValue —(無効)
   */
  scrollHint?: boolean | ScrollHintOptions<T, F>;
};