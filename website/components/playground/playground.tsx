'use client';

// Props プレイグラウンド: 主要 props をその場で切り替えて挙動を試せる操作環境。
// 選択内容は下部の JSX スニペットへリアルタイム反映される(コピー可)。
import { useMemo, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type DetailRowOptions,
  type GetFilterOptionsParams,
  type GridColumn,
  type GridDensity,
  type GridTheme,
  type RowSelectionMode,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = {
  id: number;
  // ラベル行(見出し / 区切り行)の目印。labelRow トグル ON のとき 20 行ごとに差し込む(id は負値で一意にする)。
  kind?: 'label';
  name: string;
  category: string;
  status: string;
  qty: number;
  price: number;
  registered: string;
  active: boolean;
};

const CATEGORIES = ['家電', '食品', '衣料', '書籍', '雑貨'];
const STATUSES = ['受注', '出荷準備', '出荷済', 'キャンセル'];

// 初期の列定義。PlaygroundGrid では state に持ち onColumnsChange で controlled にする(列 D&D / 固定切替 / 表示切替 /
//   列チューザーの並べ替えは controlled columns のときだけ有効 = ヘッダー右端の grip が出る)。
const initialColumns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80, align: 'right', pinned: 'left' },
  { key: 'name', title: '商品名', width: 180, filterType: 'text', editable: true },
  { key: 'category', title: 'カテゴリ', width: 110, filterType: 'set' },
  {
    key: 'status',
    title: '状態',
    width: 120,
    filterType: 'set',
    editable: true,
    editor: {
      type: 'select',
      options: STATUSES.map((v) => ({ label: v, value: v })),
    },
  },
  {
    key: 'qty',
    title: '数量',
    width: 100,
    align: 'right',
    filterType: 'number',
    editable: true,
    editor: { type: 'number', min: 0, step: 1 },
    validate: ({ value }) =>
      value === null ||
      (typeof value === 'number' && value >= 0) ||
      '0 以上で入力してください',
  },
  {
    key: 'price',
    title: '単価',
    width: 120,
    align: 'right',
    filterType: 'number',
    valueFormatter: numberFormatter(),
    editable: true,
    editor: { type: 'number', min: 0 },
  },
  { key: 'registered', title: '登録日', width: 130, filterType: 'date', editable: true, editor: { type: 'date' } },
  { key: 'active', title: '有効', width: 80, align: 'center', editable: true, editor: { type: 'checkbox' } },
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRows(count: number): Row[] {
  const rand = mulberry32(42);
  const rows: Row[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const category = CATEGORIES[Math.floor(rand() * CATEGORIES.length)];
    const month = 1 + Math.floor(rand() * 12);
    const day = 1 + Math.floor(rand() * 28);
    rows[i] = {
      id: i + 1,
      name: `${category} サンプル ${i + 1}`,
      category,
      status: STATUSES[Math.floor(rand() * STATUSES.length)],
      qty: Math.floor(rand() * 500),
      price: (1 + Math.floor(rand() * 300)) * 10,
      registered: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      active: rand() > 0.3,
    };
  }
  return rows;
}

// ラベル行(見出し行)を 20 行ごとに差し込む。見出し行は rows に混在させ、labelRow.isLabelRow で識別する。
const LABEL_ROW_INTERVAL = 20;
function insertLabelRows(rows: Row[]): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (i % LABEL_ROW_INTERVAL === 0) {
      const section = i / LABEL_ROW_INTERVAL + 1;
      const last = Math.min(i + LABEL_ROW_INTERVAL, rows.length);
      out.push({
        id: -section,
        kind: 'label',
        name: `第 ${section} 節(ID ${rows[i].id} 〜 ${rows[last - 1].id})`,
        category: '',
        status: '',
        qty: 0,
        price: 0,
        registered: '',
        active: false,
      });
    }
    out.push(rows[i]);
  }
  return out;
}

type Settings = {
  theme: GridTheme;
  density: GridDensity;
  height: number;
  rowCount: number;
  showTopBar: boolean;
  showBottomBar: boolean;
  showFilterChipBar: boolean;
  enableSorting: boolean;
  enableColumnFilter: boolean;
  enableGlobalFilter: boolean;
  enableColumnMenu: boolean;
  enableRangeSelection: boolean;
  enableUndoRedo: boolean;
  enableClearOnDelete: boolean;
  readOnly: boolean;
  dimReadOnlyCells: boolean;
  showValidationMarks: boolean;
  enableRowSelection: boolean;
  rowSelectionMode: RowSelectionMode;
  enableSelectAllRows: boolean;
  scrollHint: boolean;
  // scrollHint のデータ量ゲート(minRows)。行数プリセット(100 / 1,000 / 100,000)と
  // 組み合わせると「しきい値未満では自動 OFF」を体験できる。
  scrollHintMinRows: number;
  // 展開行(Master/Detail)。ON でトグル列が先頭に入り、行の直下にカードを開ける。
  detailRow: boolean;
  // 行ドラッグ並び替え。ON でハンドル列(⋮⋮)が先頭に入り、行を上下へ動かせる(ソート / フィルター中は無効)。
  enableRowDrag: boolean;
  // ラベル行(見出し / 区切り行)。ON で rows に 20 行ごとの見出し行を混在させ、全幅の帯で描く。
  labelRow: boolean;
  // ラベル行の縦スクロール固定(現在セクションの見出しをヘッダー直下に固定)。
  labelRowSticky: boolean;
  // 手動フィルター / 手動ソート。ON でフィルター / ソートの UI と状態は動くが、行の絞り込み / 並べ替えは行わない
  // (絞り込み済みの rows をサーバから受け取る構成向け)。
  manualFiltering: boolean;
  manualSorting: boolean;
  // 候補の非同期取得(getFilterOptions)。ON で set 列の候補を 700ms 遅延 + 先頭 3 件で打ち切って返す疑似 DB から取る。
  asyncFilterOptions: boolean;
};

const DEFAULTS: Settings = {
  theme: 'auto',
  density: 'standard',
  height: 440,
  rowCount: 1_000,
  showTopBar: true,
  showBottomBar: true,
  showFilterChipBar: false,
  enableSorting: true,
  enableColumnFilter: true,
  enableGlobalFilter: true,
  enableColumnMenu: true,
  enableRangeSelection: true,
  enableUndoRedo: true,
  enableClearOnDelete: true,
  readOnly: false,
  dimReadOnlyCells: false,
  showValidationMarks: true,
  enableRowSelection: false,
  rowSelectionMode: 'multiple',
  enableSelectAllRows: true,
  scrollHint: false,
  scrollHintMinRows: 0,
  detailRow: false,
  enableRowDrag: false,
  labelRow: false,
  labelRowSticky: true,
  manualFiltering: false,
  manualSorting: false,
  asyncFilterOptions: false,
};

function buildSnippet(s: Settings): string {
  const lines = [
    '<SpreadsheetGrid',
    '  rows={rows}',
    '  columns={columns}',
    '  onColumnsChange={setColumns}',
    '  onRowsChange={setRows}',
    '  rowKeyGetter={(row) => row.id}',
    `  height={${s.height}}`,
    `  theme="${s.theme}"`,
    `  density="${s.density}"`,
    `  showTopBar={${s.showTopBar}}`,
    `  showBottomBar={${s.showBottomBar}}`,
    `  showFilterChipBar={${s.showFilterChipBar}}`,
    `  enableSorting={${s.enableSorting}}`,
    `  enableColumnFilter={${s.enableColumnFilter}}`,
    `  enableGlobalFilter={${s.enableGlobalFilter}}`,
    `  enableColumnMenu={${s.enableColumnMenu}}`,
    `  enableRangeSelection={${s.enableRangeSelection}}`,
    `  enableUndoRedo={${s.enableUndoRedo}}`,
    `  enableClearOnDelete={${s.enableClearOnDelete}}`,
    `  readOnly={${s.readOnly}}`,
    `  dimReadOnlyCells={${s.dimReadOnlyCells}}`,
    `  showValidationMarks={${s.showValidationMarks}}`,
    `  enableRowSelection={${s.enableRowSelection}}`,
  ];
  if (s.enableRowSelection) {
    lines.push(`  rowSelectionMode="${s.rowSelectionMode}"`);
    lines.push(`  enableSelectAllRows={${s.enableSelectAllRows}}`);
  }
  // scrollHint は既定 OFF(undefined)のため、ON のときだけスニペットへ載せる。
  // minRows は既定 0(常時有効)のため、指定時のみ載せる。
  if (s.scrollHint) {
    lines.push(
      s.scrollHintMinRows > 0
        ? `  scrollHint={{ hintColumn: 'name', minRows: ${s.scrollHintMinRows} }}`
        : "  scrollHint={{ hintColumn: 'name' }}",
    );
  }
  // detailRow は既定 OFF(undefined)のため、ON のときだけスニペットへ載せる。
  if (s.detailRow) {
    lines.push(
      '  detailRow={{',
      '    height: 160,',
      '    render: ({ row, collapse }) => <DetailCard row={row} onClose={collapse} />,',
      '  }}',
    );
  }
  // enableRowDrag は既定 OFF のため、ON のときだけスニペットへ載せる。
  if (s.enableRowDrag) {
    lines.push('  enableRowDrag');
  }
  // manualFiltering / manualSorting は既定 OFF のため、ON のときだけスニペットへ載せる。
  if (s.manualFiltering) {
    lines.push('  manualFiltering');
  }
  if (s.manualSorting) {
    lines.push('  manualSorting');
  }
  // getFilterOptions は既定 OFF のため、ON のときだけスニペットへ載せる。
  if (s.asyncFilterOptions) {
    lines.push('  getFilterOptions={fetchDistinctValues} // ({ columnKey, columnFilters, signal }) => Promise<{ options, truncated? }>');
  }
  // labelRow は既定 OFF(undefined)のため、ON のときだけスニペットへ載せる。
  if (s.labelRow) {
    lines.push(
      '  labelRow={{',
      "    isLabelRow: (row) => row.kind === 'label',",
      '    getLabel: (row) => row.name,',
      ...(s.labelRowSticky ? ['    sticky: true,'] : []),
      '  }}',
    );
  }
  lines.push('/>');
  return lines.join('\n');
}

// 展開行のカード(detailRow.render)。行の内訳を簡単な定義リストで見せる。
const playgroundDetailRow: DetailRowOptions<Row> = {
  height: 160,
  render: ({ row, collapse }) => (
    <div className="flex h-full flex-col gap-2 text-sm">
      <div className="flex items-center justify-between">
        <strong>
          #{row.id} {row.name}
        </strong>
        <button
          type="button"
          className="rounded-md border px-2 py-0.5 text-xs hover:bg-fd-accent"
          onClick={collapse}
        >
          閉じる
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-fd-muted-foreground">カテゴリ</dt>
        <dd>{row.category}</dd>
        <dt className="text-fd-muted-foreground">状態</dt>
        <dd>{row.status}</dd>
        <dt className="text-fd-muted-foreground">小計</dt>
        <dd>{(row.qty * row.price).toLocaleString('ja-JP')} 円</dd>
        <dt className="text-fd-muted-foreground">登録日</dt>
        <dd>{row.registered}</dd>
      </dl>
    </div>
  ),
};

// rowCount / labelRow 変更時は key で再マウントし、rows state・undo 履歴・内部状態をリセットする
function PlaygroundGrid({ settings }: { settings: Settings }) {
  const initialRows = useMemo(
    () => (settings.labelRow ? insertLabelRows(buildRows(settings.rowCount)) : buildRows(settings.rowCount)),
    [settings.rowCount, settings.labelRow],
  );
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [columns, setColumns] = useState<GridColumn<Row>[]>(initialColumns);
  // 疑似 DB: 開いている列の DISTINCT を 700ms 遅延で返し、先頭 3 件で打ち切る(truncated の表示を体験できる)。
  //   閉じると signal が abort されるので、遅延中の応答は捨てられる。
  const getFilterOptions = useMemo(
    () =>
      async ({ columnKey, signal }: GetFilterOptionsParams<Row>) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 700);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
        const LIMIT = 3;
        const seen = new Set<string>();
        for (const row of rows) {
          if (row.kind === 'label') continue;
          seen.add(String((row as unknown as Record<string, unknown>)[columnKey] ?? ''));
        }
        const values = Array.from(seen).sort();
        return {
          options: values.slice(0, LIMIT).map((v) => ({ label: v || '(空白)', value: v })),
          truncated: values.length > LIMIT,
        };
      },
    [rows],
  );

  return (
    <SpreadsheetGrid
      rows={rows}
      columns={columns}
      onColumnsChange={setColumns}
      onRowsChange={setRows}
      rowKeyGetter={(row) => row.id}
      height={settings.height}
      theme={settings.theme}
      density={settings.density}
      showTopBar={settings.showTopBar}
      showBottomBar={settings.showBottomBar}
      showFilterChipBar={settings.showFilterChipBar}
      enableSorting={settings.enableSorting}
      enableColumnFilter={settings.enableColumnFilter}
      enableGlobalFilter={settings.enableGlobalFilter}
      enableColumnMenu={settings.enableColumnMenu}
      enableRangeSelection={settings.enableRangeSelection}
      enableUndoRedo={settings.enableUndoRedo}
      enableClearOnDelete={settings.enableClearOnDelete}
      readOnly={settings.readOnly}
      dimReadOnlyCells={settings.dimReadOnlyCells}
      showValidationMarks={settings.showValidationMarks}
      enableRowSelection={settings.enableRowSelection}
      rowSelectionMode={settings.rowSelectionMode}
      enableSelectAllRows={settings.enableRowSelection && settings.enableSelectAllRows}
      scrollHint={
        settings.scrollHint
          ? { hintColumn: 'name', minRows: settings.scrollHintMinRows }
          : undefined
      }
      detailRow={settings.detailRow ? playgroundDetailRow : undefined}
      enableRowDrag={settings.enableRowDrag}
      manualFiltering={settings.manualFiltering}
      manualSorting={settings.manualSorting}
      getFilterOptions={settings.asyncFilterOptions ? getFilterOptions : undefined}
      labelRow={
        settings.labelRow
          ? {
              isLabelRow: (row) => row.kind === 'label',
              getLabel: (row) => row.name,
              sticky: settings.labelRowSticky,
            }
          : undefined
      }
    />
  );
}

const selectClass = 'rounded-md border border-fd-border bg-transparent px-2 py-1 text-sm';

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <code className="text-xs">{label}</code>
    </label>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-fd-border p-3">
      <legend className="px-1 text-xs font-semibold text-fd-muted-foreground">
        {title}
      </legend>
      <div className="flex flex-col gap-1.5">{children}</div>
    </fieldset>
  );
}

export function Playground() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const snippet = buildSnippet(settings);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 lg:flex-row">
      {/* 操作パネル */}
      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-64">
        <Group title="テーマ / 寸法">
          <label className="flex items-center justify-between gap-2 text-sm">
            theme
            <select
              className={selectClass}
              value={settings.theme}
              onChange={(e) => set('theme', e.target.value as GridTheme)}
            >
              <option value="auto">auto</option>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-sm">
            density
            <select
              className={selectClass}
              value={settings.density}
              onChange={(e) => set('density', e.target.value as GridDensity)}
            >
              <option value="standard">standard</option>
              <option value="compact">compact</option>
              <option value="comfortable">comfortable</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-sm">
            height
            <select
              className={selectClass}
              value={settings.height}
              onChange={(e) => set('height', Number(e.target.value))}
            >
              <option value={280}>280px</option>
              <option value={440}>440px</option>
              <option value={600}>600px</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-sm">
            行数
            <select
              className={selectClass}
              value={settings.rowCount}
              onChange={(e) => set('rowCount', Number(e.target.value))}
            >
              <option value={100}>100</option>
              <option value={1000}>1,000</option>
              <option value={100000}>100,000</option>
            </select>
          </label>
        </Group>

        <Group title="バー表示">
          <Toggle label="showTopBar" checked={settings.showTopBar} onChange={(v) => set('showTopBar', v)} />
          <Toggle label="showBottomBar" checked={settings.showBottomBar} onChange={(v) => set('showBottomBar', v)} />
          <Toggle label="showFilterChipBar" checked={settings.showFilterChipBar} onChange={(v) => set('showFilterChipBar', v)} />
        </Group>

        <Group title="機能">
          <Toggle label="enableSorting" checked={settings.enableSorting} onChange={(v) => set('enableSorting', v)} />
          <Toggle label="enableColumnFilter" checked={settings.enableColumnFilter} onChange={(v) => set('enableColumnFilter', v)} />
          <Toggle label="enableGlobalFilter" checked={settings.enableGlobalFilter} onChange={(v) => set('enableGlobalFilter', v)} />
          <Toggle label="manualFiltering" checked={settings.manualFiltering} onChange={(v) => set('manualFiltering', v)} />
          <Toggle label="manualSorting" checked={settings.manualSorting} onChange={(v) => set('manualSorting', v)} />
          <Toggle label="getFilterOptions" checked={settings.asyncFilterOptions} onChange={(v) => set('asyncFilterOptions', v)} />
          <Toggle label="enableColumnMenu" checked={settings.enableColumnMenu} onChange={(v) => set('enableColumnMenu', v)} />
          <Toggle label="enableRangeSelection" checked={settings.enableRangeSelection} onChange={(v) => set('enableRangeSelection', v)} />
          <Toggle label="enableUndoRedo" checked={settings.enableUndoRedo} onChange={(v) => set('enableUndoRedo', v)} />
          <Toggle label="enableClearOnDelete" checked={settings.enableClearOnDelete} onChange={(v) => set('enableClearOnDelete', v)} />
          <Toggle label="detailRow" checked={settings.detailRow} onChange={(v) => set('detailRow', v)} />
          <Toggle label="enableRowDrag" checked={settings.enableRowDrag} onChange={(v) => set('enableRowDrag', v)} />
          <Toggle label="labelRow" checked={settings.labelRow} onChange={(v) => set('labelRow', v)} />
          <label className={settings.labelRow ? '' : 'opacity-50'}>
            <Toggle label="labelRow.sticky" checked={settings.labelRowSticky} onChange={(v) => set('labelRowSticky', v)} />
          </label>
          <Toggle label="scrollHint" checked={settings.scrollHint} onChange={(v) => set('scrollHint', v)} />
          <label className="flex items-center justify-between gap-2 text-sm">
            <code className="text-xs">scrollHint.minRows</code>
            <select
              className={selectClass}
              value={settings.scrollHintMinRows}
              onChange={(e) => set('scrollHintMinRows', Number(e.target.value))}
              disabled={!settings.scrollHint}
            >
              <option value={0}>0(常時)</option>
              <option value={1000}>1,000</option>
              <option value={10000}>10,000</option>
            </select>
          </label>
        </Group>

        <Group title="編集 / 検証">
          <Toggle label="readOnly" checked={settings.readOnly} onChange={(v) => set('readOnly', v)} />
          <Toggle label="dimReadOnlyCells" checked={settings.dimReadOnlyCells} onChange={(v) => set('dimReadOnlyCells', v)} />
          <Toggle label="showValidationMarks" checked={settings.showValidationMarks} onChange={(v) => set('showValidationMarks', v)} />
        </Group>

        <Group title="行選択(チェックボックス)">
          <Toggle label="enableRowSelection" checked={settings.enableRowSelection} onChange={(v) => set('enableRowSelection', v)} />
          <label className="flex items-center justify-between gap-2 text-sm">
            <code className="text-xs">rowSelectionMode</code>
            <select
              className={selectClass}
              value={settings.rowSelectionMode}
              onChange={(e) => set('rowSelectionMode', e.target.value as RowSelectionMode)}
              disabled={!settings.enableRowSelection}
            >
              <option value="multiple">multiple</option>
              <option value="single">single</option>
            </select>
          </label>
          <label className={settings.enableRowSelection ? '' : 'opacity-50'}>
            <Toggle label="enableSelectAllRows" checked={settings.enableSelectAllRows} onChange={(v) => set('enableSelectAllRows', v)} />
          </label>
        </Group>

        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-fd-accent"
          onClick={() => setSettings(DEFAULTS)}
        >
          リセット
        </button>
      </aside>

      {/* グリッド + スニペット */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <PlaygroundGrid
          key={`${settings.rowCount}-${settings.labelRow}`}
          settings={settings}
        />
        <div className="rounded-lg border border-fd-border">
          <div className="flex items-center justify-between border-b border-fd-border px-3 py-1.5">
            <span className="text-xs font-semibold text-fd-muted-foreground">
              この設定を再現するコード
            </span>
            <button
              type="button"
              className="rounded-md border px-2 py-0.5 text-xs hover:bg-fd-accent"
              onClick={() => {
                navigator.clipboard.writeText(snippet).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? '✓ コピーしました' : 'コピー'}
            </button>
          </div>
          <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
            <code>{snippet}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}