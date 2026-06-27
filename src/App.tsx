import { useState, type CSSProperties } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type ServerSideDataSource,
  type ServerSideGetRowsResult,
  type ServerSideQuery,
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
    // 追加(date デモ): date フィルター型の動作確認用の列です。値は ISO 文字列(YYYY-MM-DD)で、
    //   フィルターは部分一致です('2024' で年 / '2024-03' で月 / '-15' で15日 を絞り込めます)。
    { key: 'orderedAt', title: '発注日', width: 130, filterType: 'date' },
    // 追加(C1 auto-height デモ): 長文の備考列。autoHeight:true で、グリッド props の autoHeight 有効 +
    //   行数 gate 内のとき行高を内容に合わせて可変化します(折り返し表示)。
    // 追加(B3 デモ): flexEnabled で備考列を flex 化(備考=比率 2。余り幅を最も多く吸う)。
    { key: 'note', title: '備考', width: 320, filterType: 'text', autoHeight: true, flex: flexEnabled ? 2 : undefined },
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
  // 追加(stage ③ デモ): serverSide ソフトリフレッシュ用トークン。下のボタンで増やします。
  const [serverRefreshToken, setServerRefreshToken] = useState(0);
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
  // 追加(B3 デモ): 列セット切替。'full'=全 32 列(列仮想化デモ用)/ 'basic'=基本列のみ。
  //   全 32 列は固定列合計が利用可能幅を超えるため flex 列が min(50px)へ潰れます。
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
      setRows(createDemoRows(INITIAL_ROW_COUNT));
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
        ),
      );
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
            {`列セット: ${columnSet === 'full' ? '全 32 列' : '基本列のみ(flex 確認用)'}`}
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
      </header>

      <SpreadsheetGrid
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