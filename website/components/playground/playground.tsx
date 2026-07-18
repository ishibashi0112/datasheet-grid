'use client';

// Props プレイグラウンド: 主要 props をその場で切り替えて挙動を試せる操作環境。
// 選択内容は下部の JSX スニペットへリアルタイム反映される(コピー可)。
import { useMemo, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type GridDensity,
  type GridTheme,
  type RowSelectionMode,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = {
  id: number;
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

const columns: GridColumn<Row>[] = [
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
};

function buildSnippet(s: Settings): string {
  const lines = [
    '<SpreadsheetGrid',
    '  rows={rows}',
    '  columns={columns}',
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
  if (s.scrollHint) {
    lines.push("  scrollHint={{ hintColumn: 'name' }}");
  }
  lines.push('/>');
  return lines.join('\n');
}

// rowCount 変更時は key で再マウントし、rows state・undo 履歴・内部状態をリセットする
function PlaygroundGrid({ settings }: { settings: Settings }) {
  const initialRows = useMemo(
    () => buildRows(settings.rowCount),
    [settings.rowCount],
  );
  const [rows, setRows] = useState<Row[]>(initialRows);

  return (
    <SpreadsheetGrid
      rows={rows}
      columns={columns}
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
      scrollHint={settings.scrollHint ? { hintColumn: 'name' } : undefined}
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
          <Toggle label="enableColumnMenu" checked={settings.enableColumnMenu} onChange={(v) => set('enableColumnMenu', v)} />
          <Toggle label="enableRangeSelection" checked={settings.enableRangeSelection} onChange={(v) => set('enableRangeSelection', v)} />
          <Toggle label="enableUndoRedo" checked={settings.enableUndoRedo} onChange={(v) => set('enableUndoRedo', v)} />
          <Toggle label="enableClearOnDelete" checked={settings.enableClearOnDelete} onChange={(v) => set('enableClearOnDelete', v)} />
          <Toggle label="scrollHint" checked={settings.scrollHint} onChange={(v) => set('scrollHint', v)} />
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
          key={settings.rowCount}
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