'use client';

// /lite のデモ: 機能を選んで createSpreadsheetGrid でグリッドを作り直す。入れていない機能の prop / メソッドは何もしない。
//   どの機能でも違いが見えるよう、全機能の prop を常に渡している(入れていない機能の分は何も起きない)。
//   作ったコンポーネントは機能の組み合わせごとにモジュール直下の Map に置く(描画のたびに作ると状態が消えるため)。
import { useMemo, useRef, useState } from 'react';
import {
  createSpreadsheetGrid,
  standardFeatures,
  findFeature,
  fillHandleFeature,
  columnReorderFeature,
  rowDragFeature,
  scrollHintFeature,
  columnAutosizeFeature,
  totalRowFeature,
  imeDirectInputFeature,
  contextMenuFeature,
  conditionalFormatFeature,
  selectionAggregatesFeature,
  motionExtrasFeature,
  exportFeature,
  columnMenuFeature,
  toolPanelFeature,
  autoHeightFeature,
  filteringFeature,
  serverSideFeature,
  labelRowFeature,
  groupingFeature,
  numberFormatter,
  type GridColumn,
  type GridFeatures,
  type ServerSideDataSource,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid/lite';
import '@ishibashi0112/spreadsheet-grid/style.css';

type FeatureKey = keyof GridFeatures;

// 機能の一覧(サイズは API リファレンスの表と同じ。esbuild・gzip の初期 JS の増分)。
const FEATURES: { key: FeatureKey; part: NonNullable<GridFeatures[FeatureKey]>; label: string; size: string; howTo: string }[] = [
  { key: 'filtering', part: filteringFeature, label: 'フィルター', size: '+11.8KB', howTo: '上部の検索欄 / 列メニューの「フィルター…」' },
  { key: 'columnMenu', part: columnMenuFeature, label: '列メニュー', size: '+2.4KB', howTo: '列見出しの右端のボタン(ソート・固定)' },
  { key: 'toolPanel', part: toolPanelFeature, label: 'ツールパネル', size: '+1.6KB', howTo: '「フィルター管理を開く」/ 列メニューの「列の表示」' },
  { key: 'columnAutosize', part: columnAutosizeFeature, label: '列幅の自動調整', size: '+2.2KB', howTo: '列見出しの境界をダブルクリック' },
  { key: 'export', part: exportFeature, label: 'エクスポート', size: '+1.9KB', howTo: '「CSV を見る」' },
  { key: 'find', part: findFeature, label: 'セル内検索', size: '+2.0KB', howTo: 'グリッドをクリックして Ctrl / ⌘ + F、または「検索を開く」' },
  { key: 'fillHandle', part: fillHandleFeature, label: 'フィルハンドル', size: '+8.6KB', howTo: '選択範囲の右下の四角を下へ引く' },
  { key: 'columnReorder', part: columnReorderFeature, label: '列の並べ替え', size: '+5.8KB', howTo: '列見出しをドラッグ' },
  { key: 'rowDrag', part: rowDragFeature, label: '行の並べ替え', size: '+3.4KB', howTo: '左端のつまみで行をドラッグ' },
  { key: 'scrollHint', part: scrollHintFeature, label: 'スクロール位置', size: '+2.0KB', howTo: '縦にスクロールすると右に位置の目印' },
  { key: 'totalRow', part: totalRowFeature, label: '合計行', size: '+1.7KB', howTo: '表の下端に合計行' },
  { key: 'imeDirectInput', part: imeDirectInputFeature, label: 'IME の直接入力', size: '+1.3KB', howTo: 'セルを選んで IME オンのまま打ち始める' },
  { key: 'contextMenu', part: contextMenuFeature, label: '右クリックメニュー', size: '+1.6KB', howTo: 'セルを右クリック' },
  { key: 'conditionalFormat', part: conditionalFormatFeature, label: '条件付き書式', size: '+1.4KB', howTo: '数量の帯・状態のチップ' },
  { key: 'selectionAggregates', part: selectionAggregatesFeature, label: '選択範囲の集計', size: '+1.9KB', howTo: '数量を 2 セル以上選ぶと下に合計' },
  { key: 'motionExtras', part: motionExtrasFeature, label: '動きの追加分', size: '+1.2KB', howTo: 'コピーで点線 / 十字のホバー / 値の変更で光る' },
  { key: 'autoHeight', part: autoHeightFeature, label: '行の高さの実測', size: '+1.0KB', howTo: '備考の長い文が折り返して行が伸びる' },
  { key: 'serverSide', part: serverSideFeature, label: 'サーバーサイド', size: '+3.2KB', howTo: 'データを「サーバーサイド」にする(無いと通常の 300 行で動く)' },
  { key: 'labelRow', part: labelRowFeature, label: 'ラベル行', size: '+1.9KB', howTo: 'データを「ラベル行」にする' },
  { key: 'grouping', part: groupingFeature, label: '行グルーピング', size: '+1.8KB', howTo: 'データを「グループ化」にする' },
];

const STANDARD_KEYS = Object.keys(standardFeatures) as FeatureKey[];
const ALL_KEYS = FEATURES.map((feature) => feature.key);

type LiteGrid = ReturnType<typeof createSpreadsheetGrid>;
const gridCache = new Map<string, LiteGrid>();

// 機能の組み合わせごとに 1 回だけ作る(同じ組み合わせへ戻したときは同じコンポーネント)。
function getGrid(keys: readonly FeatureKey[]): LiteGrid {
  const cacheKey = [...keys].sort().join(',');
  const cached = gridCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const features: GridFeatures = {};
  for (const feature of FEATURES) {
    if (keys.includes(feature.key)) Object.assign(features, { [feature.key]: feature.part });
  }
  const grid = createSpreadsheetGrid({ features });
  gridCache.set(cacheKey, grid);
  return grid;
}

type Order = {
  id: number;
  kind?: 'label';
  region: string;
  product: string;
  status: string;
  qty: number;
  price: number;
  note: string;
};

const REGIONS = ['東日本', '西日本', '九州', '北海道'];
const PRODUCTS = ['六角ボルト', 'ナイロンナット', '平座金', 'ばね座金', '止め輪', 'ベアリング'];
const STATUSES = ['受注', '出荷済', '保留'];
const NOTES = [
  '',
  '至急',
  '先方の倉庫が改装中のため、納品は来月の第 2 週以降にしてほしいとの連絡あり。',
  '数量の変更があり得る',
  '前回の納品で梱包の破損があったので、今回は緩衝材を多めに入れて発送すること。担当者に要確認。',
];

const makeOrder = (i: number): Order => ({
  id: i + 1,
  region: REGIONS[(i * 7) % REGIONS.length],
  product: PRODUCTS[(i * 5) % PRODUCTS.length],
  status: STATUSES[(i * 7) % STATUSES.length],
  qty: (i * 37) % 500,
  price: 80 + ((i * 53) % 40) * 10,
  note: NOTES[(i * 11) % NOTES.length],
});

const CLIENT_ROWS: Order[] = Array.from({ length: 300 }, (_, i) => makeOrder(i));

// ラベル行を混ぜたデータ(地域ごとに見出し行を差し込む)。
const LABELED_ROWS: Order[] = REGIONS.flatMap((region, index) => [
  { id: -(index + 1), kind: 'label' as const, region, product: region, status: '', qty: 0, price: 0, note: '' },
  ...CLIENT_ROWS.filter((row) => row.region === region),
]);

const regionOptions = REGIONS.map((value) => ({ label: value, value }));
const statusOptions = STATUSES.map((value) => ({ label: value, value }));

const makeColumns = (groupByRegion: boolean): GridColumn<Order>[] => [
  { key: 'id', title: 'No.', width: 70, align: 'right', readOnly: true, aggFunc: 'count' },
  { key: 'region', title: '地域', width: 100, filterType: 'set', filterOptions: regionOptions, rowGroup: groupByRegion },
  { key: 'product', title: '品名', width: 150, filterType: 'text' },
  {
    key: 'status',
    title: '状態',
    width: 110,
    filterType: 'set',
    filterOptions: statusOptions,
    editor: { type: 'select', options: statusOptions },
    conditionalFormat: { chips: { 受注: 'info', 出荷済: 'good', 保留: 'warning' } },
  },
  {
    key: 'qty',
    title: '数量',
    width: 120,
    align: 'right',
    filterType: 'number',
    aggFunc: 'sum',
    editor: { type: 'number', min: 0 },
    conditionalFormat: { dataBar: {} },
  },
  { key: 'price', title: '単価', width: 110, align: 'right', aggFunc: 'avg', valueFormatter: numberFormatter() },
  { key: 'note', title: '備考', width: 260, autoHeight: true },
];

// サーバーサイドのデータ(このページの中だけで返す。並べ替えと検索欄だけ反映する)。
const SERVER_ROWS: Order[] = Array.from({ length: 20_000 }, (_, i) => makeOrder(i));
const serverDataSource: ServerSideDataSource<Order> = {
  getRows: async ({ startIndex, endIndex, query, signal }) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    const text = query.globalText?.trim() ?? '';
    let rows = text === '' ? SERVER_ROWS : SERVER_ROWS.filter((row) => row.product.includes(text) || row.note.includes(text));
    const sort = query.sort?.[0];
    if (sort !== undefined) {
      const key = sort.columnKey as keyof Order;
      const sign = sort.direction === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => ((a[key] ?? '') > (b[key] ?? '') ? sign : (a[key] ?? '') < (b[key] ?? '') ? -sign : 0));
    }
    return { rows: rows.slice(startIndex, endIndex), totalRowCount: rows.length };
  },
  updateRows: async ({ updates }) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    for (const update of updates) {
      const index = SERVER_ROWS.findIndex((row) => row.id === update.row.id);
      if (index !== -1) SERVER_ROWS[index] = update.row;
    }
  },
  initialRowCount: SERVER_ROWS.length,
  blockSize: 100,
};

type DataMode = 'client' | 'label' | 'group' | 'server';

const buttonClass = 'rounded-md border px-2 py-1 hover:bg-fd-accent';

export function LiteDemo() {
  const [keys, setKeys] = useState<FeatureKey[]>(STANDARD_KEYS);
  const [mode, setMode] = useState<DataMode>('client');
  const [clientRows, setClientRows] = useState<Order[]>(CLIENT_ROWS);
  const [labeledRows, setLabeledRows] = useState<Order[]>(LABELED_ROWS);
  const [csv, setCsv] = useState('');
  const gridRef = useRef<SpreadsheetGridHandle<Order>>(null);

  const Grid = getGrid(keys);
  const columns = useMemo(() => makeColumns(mode === 'group'), [mode]);
  const [columnOrder, setColumnOrder] = useState<GridColumn<Order>[] | null>(null);
  const shownColumns = columnOrder ?? columns;

  const toggle = (key: FeatureKey) => {
    setKeys((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
    setCsv('');
  };
  const choose = (next: FeatureKey[]) => {
    setKeys(next);
    setCsv('');
  };
  const changeMode = (next: DataMode) => {
    setMode(next);
    setColumnOrder(null);
    setCsv('');
  };

  const rows = mode === 'label' ? labeledRows : clientRows;
  const onRowsChange = mode === 'label' ? setLabeledRows : setClientRows;
  // 機能のキーと構成をキーにして作り直す(機能の組み合わせやデータの渡し方を変えたら状態を捨てる)。
  const gridKey = `${[...keys].sort().join(',')}|${mode}`;

  return (
    <div className="not-prose flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-2 rounded-md border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">機能:</span>
          <button type="button" className={buttonClass} onClick={() => choose([])}>
            なし
          </button>
          <button type="button" className={buttonClass} onClick={() => choose(STANDARD_KEYS)}>
            standardFeatures
          </button>
          <button type="button" className={buttonClass} onClick={() => choose(ALL_KEYS)}>
            すべて(全部入りと同じ)
          </button>
          <span className="text-fd-muted-foreground">{keys.length} / 20 機能</span>
        </div>
        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <label key={feature.key} className="flex items-start gap-1.5" title={feature.howTo}>
              <input
                type="checkbox"
                className="mt-1"
                checked={keys.includes(feature.key)}
                onChange={() => toggle(feature.key)}
              />
              <span>
                {feature.label} <code className="text-xs">{feature.key}</code>{' '}
                <span className="text-xs text-fd-muted-foreground">
                  {feature.size} · {feature.howTo}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          データ:
          <select
            className="rounded-md border bg-transparent px-2 py-1"
            value={mode}
            onChange={(event) => changeMode(event.target.value as DataMode)}
          >
            <option value="client">通常(300 行)</option>
            <option value="label">ラベル行を混ぜる</option>
            <option value="group">地域でグループ化</option>
            <option value="server">サーバーサイド(2 万行)</option>
          </select>
        </label>
        <button type="button" className={buttonClass} onClick={() => gridRef.current?.openFind('ボルト')}>
          検索を開く
        </button>
        <button type="button" className={buttonClass} onClick={() => gridRef.current?.openFilterManager()}>
          フィルター管理を開く
        </button>
        <button type="button" className={buttonClass} onClick={() => setCsv(gridRef.current?.exportCsv() ?? '')}>
          CSV を見る
        </button>
      </div>
      <Grid
        key={gridKey}
        ref={gridRef}
        rows={rows}
        onRowsChange={onRowsChange}
        // dataSource があれば rows は使われない(serverSide が入っていなければ dataSource が外れて rows で動く)
        dataSource={mode === 'server' ? serverDataSource : undefined}
        columns={shownColumns}
        onColumnsChange={setColumnOrder}
        rowKeyGetter={(row) => row.id}
        height={420}
        theme="auto"
        enableGlobalFilter
        find
        fillHandle
        enableRowDrag={mode === 'client'}
        scrollHint
        totalRow={mode === 'server' ? undefined : { label: '合計' }}
        imeDirectInput
        enableContextMenu
        highlightChanges
        hoverHighlight="cross"
        autoHeight={mode !== 'server'}
        labelRow={
          mode === 'label'
            ? { isLabelRow: (row) => row.kind === 'label', getLabel: (row) => `${row.region}地区`, sticky: true }
            : undefined
        }
      />
      {csv === '' ? (
        <p className="text-fd-muted-foreground">
          入れていない機能の prop やボタンは何も起きません(開発ビルドではコンソールに足すべき機能の警告が出ます。このサイトは本番ビルドなので出ません)。
        </p>
      ) : (
        <pre className="max-h-40 overflow-auto rounded border bg-gray-50 p-2 text-xs dark:bg-gray-900">
          {csv.split('\r\n').slice(0, 6).join('\n')}
        </pre>
      )}
    </div>
  );
}