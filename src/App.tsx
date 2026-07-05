import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  // 追加(バッチ②デモ): コンテキストメニュー項目の型。
  type GridContextMenuItem,
  type GridState,
  type ServerSideDataSource,
  type ServerSideGetRowsResult,
  type ServerSideQuery,
  type SpreadsheetGridHandle,
} from './components/spreadsheet-grid';
// 注記(stage ②・デモ限定): モックサーバが query(フィルター/ソート)を実適用するため、グリッド内部の
//   純関数を deep-import して再利用します。実サーバは SQL 等の自前クエリエンジンを使う想定で、これは
//   「サーバの代役」をデモ内で最小コードかつグリッドと同一意味で再現するための便宜です。
import {
  createSourceOrder,
  filterOrderByGlobalText,
  filterOrderByColumns,
} from './components/spreadsheet-grid/logic/filtering';
import { sortOrder } from './components/spreadsheet-grid/logic/sorting';
import { serializeServerSideQuery } from './components/spreadsheet-grid/logic/serverSideQuery';

// 追加: デモ用の行型です。
type DemoRow = {
  partNo: string;
  partName: string;
  qty: number;
  // 追加(③デモ): 金額(右寄せ + 3 桁区切りフォーマッタの確認用。大きめの整数)。
  amount: number;
  unit: string;
  status: string;
  // 追加(date デモ): 発注日です。date フィルター型(部分一致)の動作確認用に ISO 文字列で持ちます。
  orderedAt: string;
  // 追加(C1 auto-height デモ): 備考。行ごとに長さが変わる長文で、auto-height 列の折り返し/可変行高を
  //   確認します(autoHeight デモモード時のみ駆動)。
  note: string;
  [key: string]: string | number;
};

// 追加: 初期ダミー行数です。UX確認用に少し多めにしています。
// 変更(DS-3-1): 5,000 → 50,000(5万)。DS-3 の rowModel 移行を Profiler で検証するための負荷増です。
//   行は virtualizer 化済みのため DOM 量は据え置き、sort/filter は order(Int32Array)全走査で数十 ms 級です。
const INITIAL_ROW_COUNT = 1000000; // 50000 → 500000

// 追加: 初期追加列数です。横スクロールと column virtualization 確認用です。
const INITIAL_EXTRA_COLUMN_COUNT = 24;

// 追加: オーバーフロー列のキーを生成します。
const getOverflowColumnKey = (columnIndex: number) => `extra_${columnIndex}`;

// 追加(date デモ): 発注日の生成基点(2023-01-01 UTC)です。index から決定的に日付を割り当てます。
const ORDERED_AT_BASE_UTC = Date.UTC(2023, 0, 1);
const ORDERED_AT_SPAN_DAYS = 731; // 2023-01-01 〜 2024-12-31(約2年)を循環。

// 追加(C1 auto-height デモ): auto-height は行数 gate(50,000 行)内でのみ起動するため、
//   デモモードではこの行数に絞ります(uniform 性能確認の 1M とは別系統)。
const AUTO_HEIGHT_DEMO_ROW_COUNT = 5000;

// 追加(F-async デモ): clientSide の行数プリセットです。グローバルフィルタの非同期しきい値
//   (50,000 行)の前後を体感するために用意しています。条件は `行数 > 50,000` で非同期のため、
//   50,000 = 同期(スピナー無し・即結果) / 50,001 = 非同期(スピナー + 進捗%)になります。
//   1,000,000 は旧来のストレス(同期だと数百 ms 級のブロック→非同期で入力が詰まらない)確認用です。
const CLIENT_ROW_COUNT_PRESETS = [5_000, 50_000, 50_001, 1_000_000] as const;

// 追加(C1 auto-height デモ): 備考の元になる文の候補です。
const NOTE_PHRASES = [
  '在庫僅少のため早期手配が必要です。',
  '代替品あり。仕様は要確認のこと。',
  '長納期品。リードタイム約8週間を見込む。',
  '前回ロットで初期不良の報告あり、受入検査を強化すること。',
];

// 追加(C1 auto-height デモ): index から決定的に 1〜4 文の備考を生成します(行ごとに高さが変わる)。
const buildNote = (index: number): string => {
  const count = (index % 4) + 1;
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    parts.push(NOTE_PHRASES[(index + i) % NOTE_PHRASES.length]);
  }
  return parts.join(' ');
};

// 追加: ダミー行を生成します。
const createDemoRowAt = (index: number): DemoRow => {
    const rowNumber = index + 1;
    // 追加(date デモ): 乱数を使わず index から決定的に ISO 日付(YYYY-MM-DD)を割り当てます。
    //   部分一致 date フィルターの確認用(例: '2024-03' で月絞り込み / '-15' で15日絞り込み)。
    const orderedAt = new Date(
      ORDERED_AT_BASE_UTC + (index % ORDERED_AT_SPAN_DAYS) * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    const row: DemoRow = {
      partNo: `A-${String(1001 + index).padStart(4, '0')}`,
      partName: `品名-${rowNumber}`,
      qty: (rowNumber % 25) + 1,
      // 追加(③デモ): 大きめの整数(3 桁区切りが見えるように)。
      amount: (rowNumber * 1234) % 10_000_000,
      unit: ['個', '本', '式', '枚'][index % 4],
      status: index % 11 === 0 ? '保留' : '有効',
      orderedAt,
      note: buildNote(index),
    };
    for (let extraIndex = 0; extraIndex < INITIAL_EXTRA_COLUMN_COUNT; extraIndex += 1) {
      row[getOverflowColumnKey(5 + extraIndex)] = `R${index + 1}-C${extraIndex + 1}`;
    }
    return row;
};

// 追加(①-5): 単一行ビルダーを総数ぶん適用してダミー行配列を生成します。
const createDemoRows = (count: number): DemoRow[] =>
  Array.from({ length: count }, (_, index) => createDemoRowAt(index));

// 追加(①-5 / stage ②): serverSide(SSRM)デモ用のモックデータ供給口です。実サーバの代わりに
//   setTimeout で遅延を模し、query(グローバル/列フィルター・ソート)を全件データセットへ実適用してから、
//   要求された [startIndex, endIndex) のスライスだけを返します(全件は返さない)。signal で「スクロールで
//   通り過ぎた帯」やフィルター変更で不要になった取得をキャンセルします(stale request 破棄)。
//   注意(デモ限定): フィルター/ソートの実適用には rows 配列が要るため、全件(SERVER_ROW_COUNT)を一度だけ
//   materialize します(実サーバは DB 側で解決する想定)。また resolveServerOrder は同期計算のため、
//   大件数では query 変更時に数百 ms の同期処理が走ります(モックの割り切り)。
const SERVER_ROW_COUNT = 1000000;
const SERVER_LATENCY_MS = 350;

// 追加(stage ③ デモ): モックサーバの「データ改訂番号」です。リフレッシュボタンで増やし、getRows が
//   返す行の備考へ刻印して「サーバから取り直した」ことを可視化します(実サーバのデータ更新の代用)。
let serverDataRevision = 0;

// サーバ側の全件データ(モックの「DB」)です。決定的生成のため遅延構築し 1 度だけ保持します。
let serverRowsCache: DemoRow[] | null = null;
const getServerRows = (): DemoRow[] => {
  if (serverRowsCache === null) {
    serverRowsCache = createDemoRows(SERVER_ROW_COUNT);
  }
  return serverRowsCache;
};

// サーバが知る全列です(フィルター/ソートの列解決に使用)。createInitialColumns は後方定義のため
//   eval 時 TDZ を避けて遅延取得します。表示状態(列の表示/並び/固定)とは独立に固定で持ちます。
let serverColumnsCache: GridColumn<DemoRow>[] | null = null;
const getServerColumns = (): GridColumn<DemoRow>[] => {
  if (serverColumnsCache === null) {
    serverColumnsCache = createInitialColumns();
  }
  return serverColumnsCache;
};

// 直近 query の解決済み order(フィルター+ソート後の index 列)を 1 件だけキャッシュします。
//   グリッドは同一 query で複数ブロックを要求するため、ブロックごとの全件再計算を避けます。
let lastServerQueryKey: string | null = null;
let lastServerOrder: Int32Array | null = null;

const resolveServerOrder = (query: ServerSideQuery): Int32Array => {
  const key = serializeServerSideQuery(query);
  if (key === lastServerQueryKey && lastServerOrder !== null) {
    return lastServerOrder;
  }
  const rows = getServerRows();
  const columns = getServerColumns();
  // グリッド本体と同一の純関数で order を解決します(クライアント時と完全に同じ意味)。
  let order = createSourceOrder(rows.length);
  order = filterOrderByGlobalText(rows, order, columns, query.globalText ?? '');
  order = filterOrderByColumns(rows, order, columns, query.columnFilters ?? {});
  order = sortOrder(rows, order, columns, query.sort ?? []);
  lastServerQueryKey = key;
  lastServerOrder = order;
  return order;
};

const serverSideDataSource: ServerSideDataSource<DemoRow> = {
  // 初回 fetch 前から正しい総高さ/スクロールバーを出すため総件数を即時提示します。
  initialRowCount: SERVER_ROW_COUNT,
  getRows: ({ startIndex, endIndex, query, signal }) =>
    new Promise<ServerSideGetRowsResult<DemoRow>>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('aborted', 'AbortError'));
        return;
      }
      const timer = setTimeout(() => {
        const rows = getServerRows();
        // query を全件へ実適用(フィルター→ソート)。order.length がフィルター後の総件数です。
        const order = resolveServerOrder(query);
        const total = order.length;
        const from = Math.max(0, Math.min(startIndex, total));
        const to = Math.max(from, Math.min(endIndex, total));
        const slice: DemoRow[] = [];
        for (let i = from; i < to; i += 1) {
          const row = rows[order[i]];
          // デモ: リフレッシュ(refreshToken 増加)で再取得が起きたことが見えるよう、改訂番号を
          //   備考へ浅いコピーで刻印します(>0 のときのみ。元データは不変なので改訂は累積しません)。
          slice.push(
            serverDataRevision > 0
              ? { ...row, note: `取得#${serverDataRevision} ${row.note}` }
              : row,
          );
        }
        resolve({ rows: slice, totalRowCount: total });
      }, SERVER_LATENCY_MS);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('aborted', 'AbortError'));
        },
        { once: true },
      );
    }),
};

// 追加: 基本列 + 初期追加列を生成します。
const createInitialColumns = (
  // 追加(stage ②): 品番列の filterType。clientSide は 'set'(大規模候補の仮想化デモ)、
  //   serverSide は 'text'(高カーディナリティのため set 不適 → 部分一致)を渡します。
  partNoFilterType: 'set' | 'text' = 'set',
  // 追加(B3 デモ): true で center 列(備考=flex 2 / 状態=flex 1)に flex を付けます。
  flexEnabled = false,
  // 追加(B3 デモ): false で追加列(列仮想化用の 24 本)を外し、基本列だけにします。
  //   固定列合計が利用可能幅を下回るため、flex の「余白を 2:1 で吸う」挙動が見えます。
  includeExtraColumns = true,
  // 追加(②-S1 デモ): true で品名(partName)列に suppressAutoSize を付け、autoSize 対象外にします。
  suppressNameAutoSize = false,
): GridColumn<DemoRow>[] => {
  const baseColumns: GridColumn<DemoRow>[] = [
    // 追加: text / number / select / set のフィルター型を設定します。
    // 追加(10-E): frozen columns デモ。品番・品名を左固定にします（pinned: 'left'）。
    //            これで横スクロールしても先頭 2 列が固定表示されます。
    // 変更(12-A): 品番を set フィルター(AG Grid の Set Filter 相当)にします。
    //             候補は rows から自動収集され約 50,000 件になるため、
    //             popover 内リストの仮想化 + 検索の動作確認にそのまま使えます。
    //             注記(DS-3-1): 5万行化で候補も約5万件になります。リスト UI は仮想化済みで描画は
    //             問題ありませんが、収集の全走査(getColumnSelectOptions)は DS-4 の worker 化対象です。
    { key: 'partNo', title: '品番', width: 150, filterType: partNoFilterType,
      pinned: "left"
    },
    {
      key: 'partName',
      title: '品名',
      width: 220,
      // 注記(12-A): text フィルター(部分一致 + 適用ボタン)の動作確認用に残します。
      filterType: 'text',
      pinned: "left" ,
      // 追加(②-S1 デモ): suppressAutoSize の効き確認用。ON で autoSize 対象外(width 維持)。
      suppressAutoSize: suppressNameAutoSize ? true : undefined,
    },
    { key: 'qty', title: '数量', width: 90, filterType: 'number', resizable: false, align: 'right' },
    // 追加(③デモ): 金額列。右寄せ + numberFormatter() で 3 桁区切り(既定は元の精度を保持)。
    { key: 'amount', title: '金額', width: 140, filterType: 'number', align: 'right', valueFormatter: numberFormatter() },
    {
      key: 'unit',
      title: '単位',
      width: 90,
      readOnly: true,
      // 変更(12-A): select → set へ移行します(チェックボックスで複数選択可能)。
      filterType: 'set',
      // 追加: set 候補を固定定義します(未指定なら rows から自動収集されます)。
      filterOptions: [
        { label: '個', value: '個' },
        { label: '本', value: '本' },
        { label: '式', value: '式' },
        { label: '枚', value: '枚' },
      ],
    },
    {
      key: 'status',
      title: '状態',
      width: 120,
      // 追加(B3 デモ): flexEnabled で center 列を flex 化(状態=比率 1)。
      flex: flexEnabled ? 1 : undefined,
      // 追加(条件付きスタイル デモ): 値が「保留」のセルだけ赤字にします(GridColumn.cellClassName)。
      cellClassName: (ctx) => (ctx.value === '保留' ? 'demo-cell-hold' : undefined),
      // 変更(12-A): select → set へ移行します。
      filterType: 'set',
      // 追加: set 候補を固定定義します。
      filterOptions: [
        { label: '有効', value: '有効' },
        { label: '保留', value: '保留' },
      ],
    },
    // 追加(②-S2 デモ): renderCell でバッジ(チップ)を横並び表示するカスタムUI列です。
    //   セルの表示テキストは無いに等しいため、テキストを proxy にする autoSize では幅が出ません
    //   (ヘッダー幅止まりでチップがはみ出す)。estimateCellWidth で「チップ群の content 幅(px)」を
    //   申告すると、その列の autoSize は全行の最大幅に合わせて確定します(行ごとにチップ数が変わる例)。
    {
      key: 'tags',
      title: 'タグ',
      width: 80,
      renderCell: ({ row }) => {
        const count = (row.qty % 5) + 1;
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: count }, (_, i) => (
              <span
                key={i}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  background: '#c7d3ea',
                  display: 'inline-block',
                  flex: '0 0 auto',
                }}
              />
            ))}
          </div>
        );
      },
      // チップ群の content 幅(px): count 個 × 16 + 隙間 (count-1) × 4。renderCell の実描画と一致させます。
      estimateCellWidth: (row) => {
        const count = (row.qty % 5) + 1;
        return count * 16 + (count - 1) * 4;
      },
    },
    // 追加(date デモ): date フィルター型の動作確認用の列です。値は ISO 文字列(YYYY-MM-DD)で、
    //   フィルターは部分一致です('2024' で年 / '2024-03' で月 / '-15' で15日 を絞り込めます)。
    { key: 'orderedAt', title: '発注日', width: 130, filterType: 'date' },
    // 追加(C1 auto-height デモ): 長文の備考列。autoHeight:true で、グリッド props の autoHeight 有効 +
    //   行数 gate 内のとき行高を内容に合わせて可変化します(折り返し表示)。
    // 追加(B3 デモ): flexEnabled で備考列を flex 化(備考=比率 2。余り幅を最も多く吸う)。
    { key: 'note', title: '備考', width: 320, filterType: 'text', autoHeight: false, flex: flexEnabled ? 2 : undefined },
  ];

  // 変更(B3 デモ): includeExtraColumns=false のときは追加列を生成しません(基本列のみ)。
  const extraColumns: GridColumn<DemoRow>[] = includeExtraColumns
    ? Array.from(
        { length: INITIAL_EXTRA_COLUMN_COUNT },
        (_, index): GridColumn<DemoRow> => ({
          key: getOverflowColumnKey(5 + index),
          title: `追加列${index + 1}`,
          width: 120,
          // 追加: 追加列は text として扱います。
          filterType: 'text',
        }),
      )
    : [];

  return [...baseColumns, ...extraColumns];
};

type DemoMode = 'client' | 'autoHeight' | 'server';

// 追加(①-5): serverSide では rows を使わないため、空配列の共有参照でメモリを解放します。
const EMPTY_ROWS: DemoRow[] = [];

// 追加(①-5): モード切替ボタンのスタイルです(選択中はハイライト)。
// 変更(バー内訳デモ): disabled 引数を追加し、無効時は薄く/カーソル変更します。
const modeButtonStyle = (active: boolean, disabled = false): CSSProperties => ({
  padding: '6px 12px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #94a3b8',
  backgroundColor: active ? '#dbeafe' : '#ffffff',
  color: '#0f172a',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: active ? 600 : 400,
  opacity: disabled ? 0.45 : 1,
});

// 追加(state #3 デモ): onStateChange / applyState の永続デモで使う localStorage キーです。
//   ページ再読込で「手動リサイズ幅 / フィルター / ソート / 列メタ(可視・順序・ピン)」が復元される
//   ことを示します(GridState v2)。flex / 列幅以外の width は GridState の対象外です
//   (flex は consumer 宣言値が常に正・width は columnWidths でカバー)。
const GRID_STATE_STORAGE_KEY = 'ssg-demo-grid-state';

function App() {
  // 追加: ダミー行を多めに生成します。
  const [rows, setRows] = useState<DemoRow[]>(() => createDemoRows(INITIAL_ROW_COUNT));

  // 追加: 列定義も初期追加列込みで生成します。
  const [columns, setColumns] = useState<GridColumn<DemoRow>[]>(() =>
    createInitialColumns(),
  );

  // 追加(①-5): デモモード。client=1M(uniform) / autoHeight=5,000(可変行高) / server=SSRM(都度取得)。
  // 追加(①-5): モード切替で rows を再生成します(server は dataSource 駆動のため空配列で解放)。
  const [mode, setMode] = useState<DemoMode>('client');
  // 追加(F-async デモ): clientSide の現在行数です。下のプリセットで切り替えます(非同期しきい値の
  //   前後体感用)。client モードのときだけ即 setRows し、他モード時は次に client へ来た時に効きます。
  const [clientRowCount, setClientRowCount] = useState<number>(INITIAL_ROW_COUNT);
  // 追加(stage ③ デモ): serverSide ソフトリフレッシュ用トークン。下のボタンで増やします。
  const [serverRefreshToken, setServerRefreshToken] = useState(0);

  // 追加(imperative API #1): ref ハンドル経由でグリッドを命令的に操作するデモ用 ref です。
  const gridRef = useRef<SpreadsheetGridHandle<DemoRow>>(null);

  // 追加(state #3 デモ): マウント時に localStorage から状態を復元します。子(グリッド)の effect は
  //   親より先に走るため、ここが実行される時点で gridRef は確定済みです(applyState 可能)。
  //   復元対象は手動リサイズ幅 / フィルター / ソート(GridState)。壊れた保存値は applyState 側で
  //   防御的に正規化されます。例外(JSON 不正等)は握り潰してデモを止めません。
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GRID_STATE_STORAGE_KEY);
      if (saved) {
        gridRef.current?.applyState(JSON.parse(saved) as GridState);
      }
    } catch {
      // 保存値が壊れている場合は無視します(次回の変更で上書き保存されます)。
    }
    // マウント時のみ。mode 切替によるグリッド再マウントでの再適用は本デモの対象外(再読込永続が主眼)。
  }, []);

  // 追加(state #3 デモ): 永続スライス変化のたびに localStorage へ自動保存します(onStateChange に渡す)。
  //   発火規約はライブラリ側(ドラッグ中は確定後 1 回 / 初回非発火 / 同値非発火)。
  const handleStateChange = (state: GridState) => {
    try {
      localStorage.setItem(GRID_STATE_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 保存失敗(容量超過等)は無視します。
    }
  };

  // 追加(state #3 デモ): 保存状態をクリアして現在のグリッドも初期状態へ戻します。
  //   列メタ(可視 / 順序 / ピン)は consumer 所有のため、columns を初期定義へ戻すことでリセットします
  //   (setColumns)。reducer スライス(手動リサイズ幅 / フィルター / ソート)は applyState の空状態で
  //   リセットします。列メタは setColumns で直接戻すため、この applyState には columns を含めません
  //   (= 列メタ非適用。version は v2)。
  const clearSavedGridState = () => {
    try {
      localStorage.removeItem(GRID_STATE_STORAGE_KEY);
    } catch {
      // 無視。
    }
    setColumns(createInitialColumns());
    gridRef.current?.applyState({
      version: 2,
      columnWidths: {},
      filters: { globalText: '', columnFilters: {} },
      sort: [],
    });
  };
  // 追加(バー表示デモ): top/bottom バーの表示有無トグルです(showTopBar / showBottomBar の確認用)。
  //   モードとは独立した設定で、どのモードでも見た目を切り替えられます。
  const [showTopBar, setShowTopBar] = useState(true);
  const [showBottomBar, setShowBottomBar] = useState(true);
  // 追加(バー内訳デモ): 既定トップバーの summary chips / グローバルフィルター入力の独立トグルです
  //   (showTopBarSummary / showTopBarFilter の確認用。トップバー非表示時は無効)。
  const [showTopBarSummary, setShowTopBarSummary] = useState(true);
  const [showTopBarFilter, setShowTopBarFilter] = useState(true);
  // 追加(件数トグルデモ): 各バーの Rows / Columns 件数 chips の表示有無です
  //   (showTopBarCounts / showBottomBarCounts の確認用)。
  const [showTopBarCounts, setShowTopBarCounts] = useState(true);
  const [showBottomBarCounts, setShowBottomBarCounts] = useState(true);
  // 追加(①デモ): 列リサイズ可否のグリッド既定(enableColumnResize)を切り替えます。
  //   ON でも qty(数量)列は column.resizable:false のため常に不可(=個別上書きの確認)。
  const [resizeEnabled, setResizeEnabled] = useState(true);

  // 追加(行選択デモ): チェックボックス行選択のトグルと、選択件数表示用の state です。
  const [rowSelectionEnabled, setRowSelectionEnabled] = useState(false);
  // 追加(バッチ②デモ): コンテキストメニュー(完全カスタム)の ON/OFF トグルです。既定 OFF。
  const [contextMenuEnabled, setContextMenuEnabled] = useState(false);
  // 追加(THEME-3 デモ): readonly セル(「単位」列)の淡色表示 opt-in(既定 OFF=色変化なし)。
  const [dimReadOnlyCells, setDimReadOnlyCells] = useState(false);
  const [rowSelectionModeState, setRowSelectionModeState] =
    useState<'single' | 'multiple'>('multiple');
  const [rowSelectionCount, setRowSelectionCount] = useState(0);
  // 追加(B3 デモ): center 列の flex を付け外しします(備考=flex 2 / 状態=flex 1)。
  const [flexEnabled, setFlexEnabled] = useState(false);
  // 既存の幅/固定/並び/表示のカスタマイズは保持し、対象 2 列の flex だけ切替えます。
  const toggleColumnFlex = () => {
    const next = !flexEnabled;
    setFlexEnabled(next);
    setColumns((prev) =>
      prev.map((column) => {
        if (column.key === 'note') {
          return { ...column, flex: next ? 2 : undefined };
        }
        if (column.key === 'status') {
          return { ...column, flex: next ? 1 : undefined };
        }
        return column;
      }),
    );
  };
  // 追加(②-S1 デモ): 品名(partName)列の suppressAutoSize を切替えます(幅/固定/並びは保持)。
  //   ON にして「すべての列の幅を自動調整」しても、品名だけ幅が変わらないことを確認できます。
  const [suppressNameAutoSize, setSuppressNameAutoSize] = useState(false);
  const toggleSuppressNameAutoSize = () => {
    const next = !suppressNameAutoSize;
    setSuppressNameAutoSize(next);
    setColumns((prev) =>
      prev.map((column) =>
        column.key === 'partName'
          ? { ...column, suppressAutoSize: next ? true : undefined }
          : column,
      ),
    );
  };
  // 追加(B3 デモ): 列セット切替。'full'=全 33 列(列仮想化デモ用)/ 'basic'=基本列のみ。
  //   全 33 列は固定列合計が利用可能幅を超えるため flex 列が min(50px)へ潰れます。
  //   基本列のみにすると余白ができ、flex ON で備考・状態が余白を 2:1 で吸う挙動を確認できます。
  const [columnSet, setColumnSet] = useState<'full' | 'basic'>('full');
  // 列セットを切り替えて columns を作り直します(現在の flex トグル状態とモード別 filterType は引き継ぎ)。
  //   pin/幅/並べ替え等のカスタマイズは作り直しのためリセットされます(モード切替と同じ扱い)。
  const toggleColumnSet = () => {
    const nextSet = columnSet === 'full' ? 'basic' : 'full';
    setColumnSet(nextSet);
    setColumns(
      createInitialColumns(
        mode === 'server' ? 'text' : 'set',
        flexEnabled,
        nextSet === 'full',
        suppressNameAutoSize,
      ),
    );
  };
  const changeMode = (next: DemoMode) => {
    const wasServer = mode === 'server';
    const willServer = next === 'server';
    setMode(next);
    if (next === 'server') {
      setRows(EMPTY_ROWS);
    } else if (next === 'autoHeight') {
      setRows(createDemoRows(AUTO_HEIGHT_DEMO_ROW_COUNT));
    } else {
      // 変更(F-async デモ): client は選択中の行数プリセットで再生成します。
      setRows(createDemoRows(clientRowCount));
    }
    // 追加(stage ②): serverSide 境界をまたぐ時だけ列を作り直します。品番は serverSide では
    //   text フィルター、clientSide では set に切り替えます。同境界では grid も key で再マウント
    //   するため列リセットは一貫します。client↔autoHeight(同 serverSide 性)では作り直さず、
    //   列のカスタマイズ(並び/幅/固定/表示)を保持します。
    if (wasServer !== willServer) {
      // 変更(B3 デモ): 列再構築時も現在の flex トグル状態と列セットを引き継ぎます。
      setColumns(
        createInitialColumns(
          willServer ? 'text' : 'set',
          flexEnabled,
          columnSet === 'full',
          suppressNameAutoSize,
        ),
      );
    }
  };

  // 追加(F-async デモ): clientSide の行数を切り替えます。client モードのときだけ即反映し、
  //   それ以外(autoHeight / server)では選択値だけ控えて次に client へ戻った時に効かせます
  //   (clientSide は rows.length 変化で order パイプラインが再計算されるため再マウント不要)。
  const selectClientRowCount = (count: number) => {
    setClientRowCount(count);
    if (mode === 'client') {
      setRows(createDemoRows(count));
    }
  };

  // 追加(stage ③ デモ): モックサーバのデータ更新を模し(改訂番号を増やす)、再取得トークンを増やします。
  //   グリッドは query 不変のままスクロール位置を保って現在の可視レンジを取り直します。
  const refreshServerData = () => {
    serverDataRevision += 1;
    setServerRefreshToken((n) => n + 1);
  };

  // 追加(①-5): ヘッダー表示用の行数です(server はサーバ総件数を提示)。
  const displayRowCount = mode === 'server' ? SERVER_ROW_COUNT : rows.length;

  return (
    <main
      style={{
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: 1600,
        margin: '0 auto',
        padding: '32px 24px 48px',
        textAlign: 'left',
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            lineHeight: 1.25,
            color: '#0f172a',
          }}
        >
          SpreadsheetGrid - 実装バッチ
        </h1>

        <p
          style={{
            marginTop: 8,
            color: '#475569',
            fontSize: 14,
          }}
        >
          reducer ベースの SpreadsheetGrid です。行/列選択、copy/paste、editor、
          row virtualization / column virtualization の確認用に、
          初期行数 {displayRowCount.toLocaleString()} 行・
          初期列数 {columns.length} 列のダミーデータを表示しています。
        </p>

        <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => changeMode('client')}
            style={modeButtonStyle(mode === 'client')}
          >
            {`クライアント(${INITIAL_ROW_COUNT.toLocaleString()} 行・uniform)`}
          </button>
          <button
            type="button"
            onClick={() => changeMode('autoHeight')}
            style={modeButtonStyle(mode === 'autoHeight')}
          >
            {`auto-height(${AUTO_HEIGHT_DEMO_ROW_COUNT.toLocaleString()} 行・可変行高)`}
          </button>
          <button
            type="button"
            onClick={() => changeMode('server')}
            style={modeButtonStyle(mode === 'server')}
          >
            {`serverSide / SSRM(${SERVER_ROW_COUNT.toLocaleString()} 行・都度取得)`}
          </button>
        </div>

        {/* 追加(F-async デモ): clientSide 行数プリセット。グローバルフィルタの非同期しきい値
            (50,000 行)の前後を切り替えて、入力の体感差(同期=スピナー無し・即結果 /
            非同期=スピナー + 進捗%)を確認できます。client モード以外では行数固定のため無効化します。 */}
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
            クライアント行数:
          </span>
          {CLIENT_ROW_COUNT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={mode !== 'client'}
              onClick={() => selectClientRowCount(preset)}
              style={modeButtonStyle(
                mode === 'client' && clientRowCount === preset,
                mode !== 'client',
              )}
            >
              {`${preset.toLocaleString()} 行`}
            </button>
          ))}
          <span style={{ fontSize: 12, color: '#64748b' }}>
            （非同期しきい値 50,000：50,000=同期 / 50,001=非同期）
          </span>
        </div>

        {/* 追加(バー表示デモ): showTopBar / showBottomBar の ON/OFF トグル(モードと独立)。
            グリッドのトップバー(ツールバー) / ボトムバー(ステータスバー)の表示有無を
            その場で切り替えて見た目を確認できます。 */}
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
            バー表示:
          </span>
          <button
            type="button"
            onClick={() => setShowTopBar((v) => !v)}
            style={modeButtonStyle(showTopBar)}
          >
            {`トップバー: ${showTopBar ? '表示' : '非表示'}`}
          </button>
          <button
            type="button"
            disabled={!showTopBar}
            onClick={() => setShowTopBarSummary((v) => !v)}
            style={modeButtonStyle(showTopBar && showTopBarSummary, !showTopBar)}
          >
            {`└ summary: ${showTopBarSummary ? '表示' : '非表示'}`}
          </button>
          <button
            type="button"
            disabled={!showTopBar || !showTopBarSummary}
            onClick={() => setShowTopBarCounts((v) => !v)}
            style={modeButtonStyle(
              showTopBar && showTopBarSummary && showTopBarCounts,
              !showTopBar || !showTopBarSummary,
            )}
          >
            {`└─ 件数(Rows/Col): ${showTopBarCounts ? '表示' : '非表示'}`}
          </button>
          <button
            type="button"
            disabled={!showTopBar}
            onClick={() => setShowTopBarFilter((v) => !v)}
            style={modeButtonStyle(showTopBar && showTopBarFilter, !showTopBar)}
          >
            {`└ フィルター入力: ${showTopBarFilter ? '表示' : '非表示'}`}
          </button>
          <button
            type="button"
            onClick={() => setShowBottomBar((v) => !v)}
            style={modeButtonStyle(showBottomBar)}
          >
            {`ボトムバー: ${showBottomBar ? '表示' : '非表示'}`}
          </button>
          <button
            type="button"
            disabled={!showBottomBar}
            onClick={() => setShowBottomBarCounts((v) => !v)}
            style={modeButtonStyle(
              showBottomBar && showBottomBarCounts,
              !showBottomBar,
            )}
          >
            {`└ 件数(Rows/Col): ${showBottomBarCounts ? '表示' : '非表示'}`}
          </button>
          <button
            type="button"
            onClick={() => setResizeEnabled((v) => !v)}
            style={modeButtonStyle(resizeEnabled)}
          >
            {`列リサイズ(全体): ${resizeEnabled ? '可' : '不可'}`}
          </button>
          <button
            type="button"
            onClick={toggleColumnFlex}
            style={modeButtonStyle(flexEnabled)}
          >
            {`列フレックス(備考/状態): ${flexEnabled ? 'ON' : 'OFF'}`}
          </button>
          <button
            type="button"
            onClick={toggleColumnSet}
            style={modeButtonStyle(columnSet === 'basic')}
          >
            {`列セット: ${columnSet === 'full' ? '全 33 列' : '基本列のみ(flex 確認用)'}`}
          </button>
          <button
            type="button"
            onClick={toggleSuppressNameAutoSize}
            style={modeButtonStyle(suppressNameAutoSize)}
          >
            {`品名 autoSize: ${suppressNameAutoSize ? '抑制(固定)' : '許可'}`}
          </button>
        </div>

        {mode === 'server' && (
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={refreshServerData}
              style={modeButtonStyle(false)}
            >
              {`サーバデータを更新して再取得(refreshToken: ${serverRefreshToken})`}
            </button>
          </div>
        )}

        {mode === 'server' && (
          <p
            style={{
              marginTop: 10,
              padding: '8px 10px',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              color: '#475569',
              fontSize: 12.5,
              lineHeight: 1.6,
            }}
          >
            serverSide モード: 並べ替え・列フィルター・グローバルフィルターはモック
            サーバへ送出され、結果は都度取得されます(入力は即時、送出は約 300ms
            デバウンス後)。結果セットが入れ替わるとスクロールは先頭へ戻ります。品番は
            高カーディナリティのため serverSide では text フィルター(部分一致)に切り替えて
            います(clientSide は set フィルター = 大規模候補の仮想化デモ)。単位 / 状態は
            列定義に候補(filterOptions)を持つため両モードで set として機能します。候補を
            供給しない set/select 列は serverSide では候補を自動収集できず空になります。
            ヘッダーの行数はフィルター前のデータセット総件数です。上の「再取得」ボタンで
            refreshToken を増やすと、クエリを変えずスクロール位置を保ったまま現在の可視レンジを
            取り直します(再取得された行は備考の先頭に「取得#N」が付きます)。
          </p>
        )}
        {/* 追加(imperative API #1): ref ハンドル(SpreadsheetGridHandle)の動作デモです。 */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 12,
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
            命令的 API (ref):
          </span>
          <button
            type="button"
            onClick={() => gridRef.current?.scrollToTop()}
            style={modeButtonStyle(false)}
          >
            先頭へ
          </button>
          <button
            type="button"
            onClick={() => gridRef.current?.scrollToBottom()}
            style={modeButtonStyle(false)}
          >
            末尾へ
          </button>
          <button
            type="button"
            onClick={() => gridRef.current?.scrollToRow(5000, { align: 'center' })}
            style={modeButtonStyle(false)}
          >
            5000 行目へ(中央)
          </button>
          <button
            type="button"
            onClick={() => {
              const selected = gridRef.current?.getSelectedRows() ?? [];
              window.alert(`選択中の行数: ${selected.length}`);
            }}
            style={modeButtonStyle(false)}
          >
            選択行数を表示
          </button>
          <button
            type="button"
            onClick={() =>
              gridRef.current?.downloadCsv('selection.csv', { scope: 'selection' })
            }
            style={modeButtonStyle(false)}
          >
            選択を CSV 保存
          </button>
          <button
            type="button"
            onClick={() =>
              // 変更(export-scope 再編): 旧 'visible' は「描画中の行(仮想化ウィンドウ)」の意のため
              //   'rendered' へ改名(旧名もエイリアスとして動作)。フィルター後の全行は 'view'。
              gridRef.current?.downloadCsv('rendered.csv', { scope: 'rendered' })
            }
            style={modeButtonStyle(false)}
          >
            描画中の行を CSV 保存
          </button>
          <button
            type="button"
            onClick={() => {
              // 追加(getExportData デモ): エクスポート用の整形済みデータ(列メタ + 2 次元セル)を取得して
              //   内容を確認するデモです。実際の xlsx 化はこの data を hucre / exceljs 等へ流します
              //   (README / API_REFERENCE のレシピ参照)。本ライブラリは Excel ライブラリを同梱しません。
              const data = gridRef.current?.getExportData({ scope: 'view' });
              if (!data) {
                return;
              }
              const header = data.columns.map((c) => c.title).join(', ');
              const firstRow =
                data.rows.length > 0
                  ? data.rows[0].map((cell) => cell.text).join(', ')
                  : '(行なし)';
              window.alert(
                `エクスポートデータ\n列数: ${data.columns.length} / 行数: ${data.rows.length}\n\nヘッダー: ${header}\n先頭行: ${firstRow}`,
              );
            }}
            style={modeButtonStyle(false)}
          >
            エクスポートデータを確認
          </button>
          {/* 追加(行選択デモ): チェックボックス行選択の ON/OFF・モード切替・全選択/解除・選択キー確認。 */}
          <button
            type="button"
            onClick={() => setRowSelectionEnabled((v) => !v)}
            style={modeButtonStyle(rowSelectionEnabled)}
          >
            行選択: {rowSelectionEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() =>
              setRowSelectionModeState((m) =>
                m === 'multiple' ? 'single' : 'multiple',
              )
            }
            disabled={!rowSelectionEnabled}
            style={modeButtonStyle(false)}
          >
            選択モード: {rowSelectionModeState === 'multiple' ? '複数' : '単一'}
          </button>
          <button
            type="button"
            onClick={() => gridRef.current?.selectAllRows()}
            disabled={!rowSelectionEnabled || rowSelectionModeState === 'single'}
            style={modeButtonStyle(false)}
          >
            全選択
          </button>
          <button
            type="button"
            onClick={() => gridRef.current?.clearRowSelection()}
            disabled={!rowSelectionEnabled}
            style={modeButtonStyle(false)}
          >
            選択解除
          </button>
          <button
            type="button"
            onClick={() => {
              const keys = gridRef.current?.getSelectedRowKeys() ?? [];
              const count = gridRef.current?.getSelectedRowCount() ?? 0;
              window.alert(
                `行選択(チェックボックス)\n件数: ${count}\n先頭キー: ${
                  keys.slice(0, 5).map(String).join(', ') || '(なし)'
                }${keys.length > 5 ? ' ...' : ''}`,
              );
            }}
            disabled={!rowSelectionEnabled}
            style={modeButtonStyle(false)}
          >
            選択キーを確認
          </button>
          <span style={{ alignSelf: 'center', fontSize: 13, color: '#475569' }}>
            選択件数: {rowSelectionCount}
          </span>
          {/* 追加(バッチ②デモ): 右クリックの完全カスタムメニューの ON/OFF。既定 OFF(標準メニュー)。 */}
          <button
            type="button"
            onClick={() => setContextMenuEnabled((v) => !v)}
            style={modeButtonStyle(contextMenuEnabled)}
          >
            右クリックメニュー: {contextMenuEnabled ? 'ON' : 'OFF'}
          </button>
          {/* 追加(THEME-3 デモ): readonly セル(「単位」列)の淡色表示 ON/OFF。既定 OFF。 */}
          <button
            type="button"
            onClick={() => setDimReadOnlyCells((v) => !v)}
            style={modeButtonStyle(dimReadOnlyCells)}
          >
            readonly淡色: {dimReadOnlyCells ? 'ON' : 'OFF'}
          </button>
          {/* 追加(state #3 デモ): onStateChange/applyState の永続デモ。列幅変更・フィルター・ソート・
              列メタ(可視/順序/ピン)が自動保存され、ページ再読込で復元されます。下のボタンで保存を
              クリア(初期状態へ)できます。 */}
          <button
            type="button"
            onClick={clearSavedGridState}
            style={modeButtonStyle(false)}
          >
            保存状態をクリア
          </button>
        </div>
      </header>

      <SpreadsheetGrid
        ref={gridRef}
        // 追加(imperative API #1): 命令的ハンドル(SpreadsheetGridHandle)を受け取ります。
        // 追加(state #3 デモ): 永続スライス変化を localStorage へ自動保存します(発火規約はライブラリ側)。
        onStateChange={handleStateChange}
        // 追加(stage ②・デモ): clientSide↔serverSide はフックの初期件数読込が mount 限定のため、
        //   境界をまたぐ時だけ key で再マウントします(client↔autoHeight は同 key で再マウントなし)。
        key={mode === 'server' ? 'server' : 'client'}
        rows={mode === 'server' ? undefined : rows}
        dataSource={mode === 'server' ? serverSideDataSource : undefined}
        // 追加(stage ③): serverSide ソフトリフレッシュ用トークン(server mode 以外は undefined=inert)。
        serverSideRefreshToken={mode === 'server' ? serverRefreshToken : undefined}
        columns={columns}
        onRowsChange={mode === 'server' ? undefined : setRows}
        onColumnsChange={setColumns}
        rowKeyGetter={(row, index) => `${row.partNo || 'row'}-${index}`}
        createRow={() => ({
          partNo: '',
          partName: '',
          qty: 0,
          amount: 0,
          unit: '',
          status: '',
          // 追加(date デモ): 新規行も orderedAt を持たせます(既定は空文字 = フィルター未該当)。
          orderedAt: '',
          // 追加(C1 auto-height デモ): 新規行の備考は空文字。
          note: '',
        })}
        createOverflowColumn={(columnIndex) => ({
          key: getOverflowColumnKey(columnIndex),
          title: `列${columnIndex + 1}`,
          width: 120,
          // 追加: 後から増える列も text フィルター対象に揃えます。
          filterType: 'text',
        })}
        rowHeight={38}
        autoHeight={mode === 'autoHeight'}
        headerHeight={42}
        rowHeaderWidth={56}
        enableRangeSelection
        // 追加(行選択デモ): 上の「行選択」トグルと連動します。onRowSelectionChange で件数を更新。
        enableRowSelection={rowSelectionEnabled}
        rowSelectionMode={rowSelectionModeState}
        onRowSelectionChange={(model) => {
          // onChange は選択の反映(再レンダー)より前に発火するため、件数は引数 model から
          //   算出します(この時点で gridRef.getSelectedRowCount() を読むと 1 つ前の状態)。
          if (model.type === 'include') {
            setRowSelectionCount(model.rowKeys.length);
          } else {
            // exclude(全選択のうち除外)。総数は選択で変わらないので反映後にハンドルから読む。
            requestAnimationFrame(() =>
              setRowSelectionCount(gridRef.current?.getSelectedRowCount() ?? 0),
            );
          }
        }}
        // 追加(バッチ②デモ): マスタースイッチ(上の「右クリックメニュー」トグルと連動。既定 OFF)。
        //   OFF のあいだは getContextMenuItems を渡していてもブラウザ標準メニューになります。
        enableContextMenu={contextMenuEnabled}
        // 追加(THEME-3 デモ): readonly セルの淡色表示(上の「readonly淡色」トグルと連動。既定 OFF)。
        dimReadOnlyCells={dimReadOnlyCells}
        // 追加(バッチ②デモ): セル/行の完全カスタムコンテキストメニューです。項目を返した時だけ独自メニューを
        //   出し、[] を返す/未指定ならブラウザ標準メニューになります(ここでは常に項目を返します)。
        //   narrowing 用に params.target.type==='cell' 内でプリミティブ(値/列タイトル)を捕捉してから
        //   onSelect のクロージャへ渡しています(target 参照の絞り込みはクロージャ跨ぎで保持されないため)。
        getContextMenuItems={(params): GridContextMenuItem[] => {
          const items: GridContextMenuItem[] = [];
          // label(見出し): 非インタラクティブなセクションラベル。Mantine の Menu.Label 相当。
          items.push({ kind: 'label', label: '操作' });
          if (params.target.type === 'cell') {
            const cellValue = params.target.value;
            const colTitle =
              params.target.column.title ?? params.target.column.key;
            items.push({
              label: `「${colTitle}」の値をコピー`,
              icon: '📋',
              onSelect: () => {
                void navigator.clipboard?.writeText(String(cellValue ?? ''));
              },
            });
          }
          items.push({ kind: 'separator' });
          items.push({
            label: `この行(キー: ${String(params.target.rowKey)})を選択`,
            onSelect: () =>
              gridRef.current?.selectCell(params.target.rowIndex, 0, {
                scrollIntoView: true,
              }),
          });
          items.push({
            label: params.isTargetSelected
              ? '選択範囲を CSV 出力'
              : '（選択範囲なし）',
            disabled: !params.isTargetSelected,
            onSelect: () =>
              gridRef.current?.downloadCsv('selection.csv', {
                scope: 'selection',
              }),
          });
          items.push({ kind: 'separator' });
          // danger(赤系強調): 危険操作。Mantine の color="red" 相当。
          items.push({
            label: 'この行を削除',
            danger: true,
            onSelect: () =>
              window.alert(
                `削除(デモ): 行 ${params.target.rowIndex} / キー ${String(
                  params.target.rowKey,
                )}`,
              ),
          });
          // custom item(レンダラ): 完全自由描画 + close() で任意に閉じられます。
          items.push({
            kind: 'custom',
            render: ({ close }) => (
              <div
                style={{ padding: '6px 8px', fontSize: 12, color: '#64748b' }}
              >
                右クリック行: {params.target.rowIndex}
                <button
                  type="button"
                  onClick={close}
                  style={{ marginLeft: 8, fontSize: 12 }}
                >
                  閉じる
                </button>
              </div>
            ),
          });
          return items;
        }}
        enableGlobalFilter
        // 追加(①デモ): 上の「列リサイズ(全体)」トグルと連動します(qty 列は resizable:false で常に不可)。
        enableColumnResize={resizeEnabled}
        // 追加(バー表示デモ): 上の「バー表示」トグルと連動します。
        showTopBar={showTopBar}
        showBottomBar={showBottomBar}
        showTopBarSummary={showTopBarSummary}
        showTopBarFilter={showTopBarFilter}
        showTopBarCounts={showTopBarCounts}
        showBottomBarCounts={showBottomBarCounts}
        // 追加(条件付きスタイル デモ): 「保留」行を薄オレンジでハイライトします(getRowClassName)。
        //   返り値の class は行コンテナ + 各データセルに付与されます(# 行ヘッダーセルは現状対象外)。
        getRowClassName={(row) =>
          row.status === '保留' ? 'demo-row-hold' : undefined
        }
        // 追加(10-E): frozen columns は列定義の pinned: 'left' で有効化済みです。
        //            （createInitialColumns の partNo / partName を参照）
        canEditCell={(rowIndex, _colIndex, row, column) => {
          // 追加: デモ用に「保留」行は status 列以外を編集不可とする例です。
          if (row.status === '保留' && column.key !== 'status') {
            return false;
          }
          return rowIndex >= 0;
        }}
      />
    </main>
  );
}

export default App;