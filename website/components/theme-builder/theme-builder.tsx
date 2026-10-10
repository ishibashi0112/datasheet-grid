'use client';

// テーマビルダー(F-4): トークンを触って実物のグリッドで確かめ、CSS 変数を書き出すページ。
//   - 対象は基本 9 項目(アクセント / ヘッダー背景 / セル背景 / 文字色 / 罫線 / 外枠・区切り / 角丸 / 密度 / 文字サイズ)。
//     派生色(hover / 選択 / 読み取り専用 / パネル / グリフ)は計算で埋め、出力にも載せる(利用側はそのまま貼って微調整)。
//   - 出力はライブラリ本体と同じセレクタリスト(.ssg-root + ポータル root)に対する CSS 変数。プレビューは同じ CSS を
//     <style> で流し込むので、ポップオーバー / メニューまで実物と同じ見え方になる。
//   - 状態は URL(クエリ)に載せて共有できる(ssr: false で読み込むため、初期状態を URL から直接作れる)。
import { useEffect, useMemo, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type GridDensity,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type ThemeState = {
  accent: string;
  header: string;
  cell: string;
  text: string;
  line: string;
  divider: string;
  radius: number;
  density: GridDensity;
  font: number;
};

type PresetKey = 'default' | 'mantine' | 'heroui' | 'biz' | 'excel' | 'dark';

const PRESETS: Record<PresetKey, { label: string; state: ThemeState }> = {
  default: {
    label: '既定',
    state: { accent: '#3461c9', header: '#f8fafc', cell: '#ffffff', text: '#0f172a', line: '#f1f5f9', divider: '#d7dce3', radius: 8, density: 'standard', font: 13 },
  },
  mantine: {
    label: 'Mantine 風',
    state: { accent: '#228be6', header: '#f8f9fa', cell: '#ffffff', text: '#212529', line: '#f1f3f5', divider: '#dee2e6', radius: 4, density: 'standard', font: 14 },
  },
  heroui: {
    label: 'HeroUI 風',
    state: { accent: '#006fee', header: '#f4f4f5', cell: '#ffffff', text: '#11181c', line: '#f4f4f5', divider: '#e4e4e7', radius: 12, density: 'comfortable', font: 14 },
  },
  biz: {
    label: '業務グレー',
    state: { accent: '#475569', header: '#eef1f5', cell: '#fcfdfe', text: '#1e293b', line: '#e2e8f0', divider: '#cbd5e1', radius: 2, density: 'compact', font: 12 },
  },
  excel: {
    label: 'Excel 風',
    state: { accent: '#107c41', header: '#f3f3f3', cell: '#ffffff', text: '#1f1f1f', line: '#e1e1e1', divider: '#bfbfbf', radius: 0, density: 'compact', font: 12.5 },
  },
  dark: {
    label: 'ダーク(既定)',
    state: { accent: '#4dabf7', header: '#25262b', cell: '#1a1b1e', text: '#c1c2c5', line: '#212226', divider: '#373a40', radius: 8, density: 'standard', font: 13 },
  },
};

const COLOR_FIELDS: { key: keyof Pick<ThemeState, 'accent' | 'header' | 'cell' | 'text' | 'line' | 'divider'>; label: string; token: string }[] = [
  { key: 'accent', label: 'アクセント', token: '--ssg-accent' },
  { key: 'header', label: 'ヘッダー背景', token: '--ssg-header-bg' },
  { key: 'cell', label: 'セル背景', token: '--ssg-cell-bg' },
  { key: 'text', label: '文字色', token: '--ssg-cell-text' },
  { key: 'line', label: '罫線', token: '--ssg-line' },
  { key: 'divider', label: '外枠 / 区切り', token: '--ssg-divider' },
];

const DENSITIES: GridDensity[] = ['compact', 'standard', 'comfortable'];

// ── 色の計算(hex 6 桁だけを扱う。input[type=color] の値も 6 桁)──
const HEX_RE = /^#[0-9a-f]{6}$/i;
const hexToRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const rgbToHex = (rgb: [number, number, number]): string =>
  `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: string, b: string, t: number): string => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
};
const alpha = (hex: string, a: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
const luminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

// 派生トークン(利用側が上書きしなくても破綻しない値)。
const derive = (s: ThemeState) => {
  const dark = luminance(s.cell) < 0.3;
  const onCell = s.text;
  return {
    dark,
    tokens: [
      ['--ssg-accent', s.accent],
      ['--ssg-accent-strong', mix(s.accent, dark ? '#ffffff' : s.text, 0.25)],
      ['--ssg-header-bg', s.header],
      ['--ssg-header-text', mix(s.text, s.cell, 0.2)],
      ['--ssg-header-hover-bg', mix(s.header, onCell, 0.08)],
      ['--ssg-cell-bg', s.cell],
      ['--ssg-cell-text', s.text],
      ['--ssg-line', s.line],
      ['--ssg-line-strong', mix(s.line, s.divider, 0.5)],
      ['--ssg-divider', s.divider],
      ['--ssg-row-hover-bg', mix(s.cell, onCell, dark ? 0.06 : 0.05)],
      ['--ssg-select-bg', mix(s.cell, s.accent, dark ? 0.3 : 0.14)],
      ['--ssg-select-bg-hover', mix(s.cell, s.accent, dark ? 0.38 : 0.22)],
      ['--ssg-row-selected-bg', mix(s.cell, s.accent, dark ? 0.2 : 0.08)],
      ['--ssg-selection-fill', alpha(s.accent, dark ? 0.13 : 0.08)],
      ['--ssg-readonly-bg', mix(s.cell, onCell, 0.03)],
      ['--ssg-readonly-text', mix(s.text, s.cell, 0.4)],
      ['--ssg-group-row-bg', s.header],
      ['--ssg-label-row-bg', s.header],
      ['--ssg-glyph', mix(s.text, s.cell, 0.5)],
      ['--ssg-glyph-hover', mix(s.text, s.cell, 0.15)],
      ['--ssg-checkbox-bg', s.cell],
      ['--ssg-checkbox-border', mix(s.divider, s.text, 0.2)],
      ['--ssg-panel-bg', dark ? s.header : s.cell],
      ['--ssg-panel-border', s.divider],
      ['--ssg-panel-separator', mix(s.line, s.divider, 0.5)],
      ['--ssg-panel-text-strong', s.text],
      ['--ssg-panel-text', mix(s.text, s.cell, 0.1)],
      ['--ssg-panel-text-sub', mix(s.text, s.cell, 0.25)],
      ['--ssg-panel-text-muted', mix(s.text, s.cell, 0.4)],
      ['--ssg-panel-text-faint', mix(s.text, s.cell, 0.55)],
      ['--ssg-panel-hover-bg', mix(dark ? s.header : s.cell, onCell, 0.06)],
      ['--ssg-panel-accent', s.accent],
      ['--ssg-panel-accent-bg', mix(s.cell, s.accent, dark ? 0.25 : 0.1)],
      ['--ssg-radius', `${s.radius}px`],
    ] as const,
  };
};

// ライブラリ本体のトークン定義と同じセレクタ(ポータル root を含む)。
const SELECTOR =
  '.ssg-root,\n.ssg-popover,\n.ssg-menu-panel,\n.ssg-filter-popover,\n.ssg-select-editor-popover,\n[data-grid-drag-ghost],\n.ssg-tooltip';

const buildCss = (s: ThemeState, derived: ReturnType<typeof derive>): string => {
  const lines = derived.tokens.map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return `/* SpreadsheetGrid theme(テーマビルダーで生成) */\n${SELECTOR} {\n${lines}\n}\n.ssg-root {\n  font-size: ${s.font}px;\n}`;
};

const buildJsx = (s: ThemeState, dark: boolean): string =>
  `<SpreadsheetGrid density="${s.density}" theme="${dark ? 'dark' : 'light'}" ... />`;

// ── URL との往復(共有用)──
const URL_KEYS: Record<keyof ThemeState, string> = {
  accent: 'a',
  header: 'h',
  cell: 'c',
  text: 't',
  line: 'l',
  divider: 'd',
  radius: 'r',
  density: 'ds',
  font: 'f',
};
const encodeState = (s: ThemeState): string => {
  const params = new URLSearchParams();
  (Object.keys(URL_KEYS) as (keyof ThemeState)[]).forEach((key) => {
    const value = s[key];
    params.set(URL_KEYS[key], typeof value === 'string' ? value.replace('#', '') : String(value));
  });
  return params.toString();
};
const decodeState = (search: string): ThemeState | null => {
  const params = new URLSearchParams(search);
  if (!params.has('a')) {
    return null;
  }
  const color = (key: string, fallback: string) => {
    const raw = params.get(key);
    return raw && HEX_RE.test(`#${raw}`) ? `#${raw.toLowerCase()}` : fallback;
  };
  const num = (key: string, fallback: number, min: number, max: number) => {
    const raw = Number(params.get(key));
    return Number.isFinite(raw) && raw >= min && raw <= max ? raw : fallback;
  };
  const base = PRESETS.default.state;
  const density = params.get('ds');
  return {
    accent: color('a', base.accent),
    header: color('h', base.header),
    cell: color('c', base.cell),
    text: color('t', base.text),
    line: color('l', base.line),
    divider: color('d', base.divider),
    radius: num('r', base.radius, 0, 24),
    density: DENSITIES.includes(density as GridDensity) ? (density as GridDensity) : base.density,
    font: num('f', base.font, 10, 18),
  };
};

const samePreset = (a: ThemeState, b: ThemeState): boolean =>
  (Object.keys(URL_KEYS) as (keyof ThemeState)[]).every((key) => a[key] === b[key]);

// ── プレビュー用データ ──
type Row = { id: number; name: string; category: string; qty: number; price: number; status: string; active: boolean };
const CATEGORIES = ['電子部品', '機械部品', '化成品', '梱包材', '工具'];
const STATUSES = ['有効', '停止', '廃番'];
const ROWS: Row[] = Array.from({ length: 200 }, (_, i) => ({
  id: i + 1,
  name: `品目-${String(i + 1).padStart(4, '0')}`,
  category: CATEGORIES[(i * 7) % CATEGORIES.length],
  qty: ((i * 37) % 90) * 10,
  price: 120 + ((i * 53) % 400) * 5,
  status: STATUSES[i % 11 === 0 ? 2 : i % 4 === 0 ? 1 : 0],
  active: i % 3 !== 0,
}));
const COLUMNS: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 70, align: 'right', pinned: 'left' },
  { key: 'name', title: '品目名', width: 150, filterType: 'text', editable: true },
  { key: 'category', title: 'カテゴリ', width: 110, filterType: 'set', editable: true, editor: { type: 'select', options: CATEGORIES.map((v) => ({ label: v, value: v })) } },
  { key: 'qty', title: '在庫数', width: 110, align: 'right', filterType: 'number', editable: true, editor: { type: 'number', min: 0, step: 10 }, valueFormatter: numberFormatter(), conditionalFormat: { dataBar: {} } },
  { key: 'price', title: '単価', width: 100, align: 'right', filterType: 'number', editable: true, editor: { type: 'number', min: 0 }, valueFormatter: numberFormatter(), readOnly: true },
  { key: 'status', title: '状態', width: 100, filterType: 'set', conditionalFormat: { chips: { 有効: 'good', 停止: 'warning', 廃番: 'critical' } } },
  { key: 'active', title: '有効', width: 70, align: 'center', editable: true, editor: { type: 'checkbox' } },
];

const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

export function ThemeBuilder() {
  const [state, setState] = useState<ThemeState>(() => decodeState(window.location.search) ?? PRESETS.default.state);
  const [rows, setRows] = useState<Row[]>(ROWS);
  const [copied, setCopied] = useState<'css' | 'url' | 'fail' | null>(null);

  const derived = useMemo(() => derive(state), [state]);
  const css = useMemo(() => buildCss(state, derived), [state, derived]);
  const jsx = buildJsx(state, derived.dark);
  const textContrast = contrast(state.text, state.cell);
  const headerContrast = contrast(mix(state.text, state.cell, 0.2), state.header);
  const presetKey = (Object.keys(PRESETS) as PresetKey[]).find((key) => samePreset(PRESETS[key].state, state)) ?? 'custom';

  // 状態を URL に載せる(共有用。履歴は増やさない)。
  useEffect(() => {
    const next = `${window.location.pathname}?${encodeState(state)}`;
    window.history.replaceState(null, '', next);
  }, [state]);

  useEffect(() => {
    if (copied === null) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const set = <K extends keyof ThemeState>(key: K, value: ThemeState[K]) => setState((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <h1 className="text-2xl font-bold">テーマビルダー</h1>
      <p className="mt-1 text-sm text-fd-muted-foreground">
        トークンを動かして実物のグリッドで確かめ、生成された CSS 変数を貼るだけで自社の UI に色を合わせられます。状態は URL に載るので、そのまま共有できます。
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3 rounded-xl border border-fd-border p-4 text-sm" aria-label="テーマの設定">
          <label className="flex items-center justify-between gap-2">
            <span>プリセット</span>
            <select
              className="rounded-md border border-fd-border bg-fd-background px-2 py-1"
              value={presetKey}
              onChange={(e) => {
                const key = e.target.value as PresetKey;
                if (key in PRESETS) {
                  setState(PRESETS[key].state);
                }
              }}
            >
              {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
                <option key={key} value={key}>
                  {PRESETS[key].label}
                </option>
              ))}
              {presetKey === 'custom' && <option value="custom">カスタム</option>}
            </select>
          </label>
          {COLOR_FIELDS.map((field) => (
            <label key={field.key} className="flex items-center justify-between gap-2">
              <span>
                {field.label}
                <span className="ml-1 font-mono text-[11px] text-fd-muted-foreground">{field.token}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-mono text-xs">{state[field.key]}</span>
                <input
                  type="color"
                  aria-label={field.label}
                  value={state[field.key]}
                  onChange={(e) => set(field.key, e.target.value)}
                  className="h-7 w-9 cursor-pointer rounded border border-fd-border bg-transparent p-0.5"
                />
              </span>
            </label>
          ))}
          <label className="flex items-center justify-between gap-2">
            <span>
              角丸<span className="ml-1 font-mono text-[11px] text-fd-muted-foreground">--ssg-radius</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="font-mono text-xs">{state.radius}px</span>
              <input type="range" min={0} max={16} step={1} value={state.radius} aria-label="角丸" onChange={(e) => set('radius', Number(e.target.value))} />
            </span>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>
              密度<span className="ml-1 font-mono text-[11px] text-fd-muted-foreground">density</span>
            </span>
            <select className="rounded-md border border-fd-border bg-fd-background px-2 py-1" value={state.density} onChange={(e) => set('density', e.target.value as GridDensity)}>
              {DENSITIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>
              文字サイズ<span className="ml-1 font-mono text-[11px] text-fd-muted-foreground">font-size</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="font-mono text-xs">{state.font}px</span>
              <input type="range" min={11} max={16} step={0.5} value={state.font} aria-label="文字サイズ" onChange={(e) => set('font', Number(e.target.value))} />
            </span>
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <button type="button" className="rounded-md border border-fd-border px-3 py-1.5 text-xs hover:bg-fd-accent" onClick={() => setState(PRESETS.default.state)}>
              既定に戻す
            </button>
          </div>
          <div className="mt-2 rounded-md bg-fd-muted p-2 text-xs leading-relaxed" aria-live="polite">
            <p>
              文字 / セル背景のコントラスト比: <b>{textContrast.toFixed(2)}:1</b>
              {textContrast < 4.5 && <span className="ml-1 text-amber-700 dark:text-amber-400">(推奨 4.5:1 以上)</span>}
            </p>
            <p>
              ヘッダー文字 / ヘッダー背景: <b>{headerContrast.toFixed(2)}:1</b>
              {headerContrast < 4.5 && <span className="ml-1 text-amber-700 dark:text-amber-400">(推奨 4.5:1 以上)</span>}
            </p>
            <p className="mt-1 text-fd-muted-foreground">
              セル背景が暗い場合は <code>theme=&quot;dark&quot;</code>(ポータルやネイティブ UI もダークに)。現在: <b>{derived.dark ? 'dark' : 'light'}</b>
            </p>
          </div>
        </aside>
        <div className="min-w-0">
          {/* 生成した CSS をそのまま流し込む(ポータルも含めて実物と同じ見え方) */}
          <style>{css}</style>
          <div data-theme-builder-stage="" className="overflow-hidden rounded-xl">
            <SpreadsheetGrid<Row>
              rows={rows}
              columns={COLUMNS}
              rowKeyGetter={(r) => r.id}
              onRowsChange={setRows}
              height={380}
              density={state.density}
              theme={derived.dark ? 'dark' : 'light'}
              enableRowSelection
              hoverHighlight="cross"
              find
            />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <textarea
              readOnly
              aria-label="生成された CSS"
              value={`${css}\n\n${jsx}`}
              rows={14}
              className="w-full resize-y rounded-lg border border-fd-border bg-fd-muted p-3 font-mono text-xs leading-relaxed"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
                onClick={async () => setCopied((await copyText(`${css}\n\n${jsx}`)) ? 'css' : 'fail')}
              >
                CSS をコピー
              </button>
              <button
                type="button"
                className="rounded-lg border border-fd-border px-4 py-2 text-sm hover:bg-fd-accent"
                onClick={async () => setCopied((await copyText(window.location.href)) ? 'url' : 'fail')}
              >
                共有 URL をコピー
              </button>
              <p className="min-h-5 text-xs text-fd-muted-foreground" aria-live="polite">
                {copied === 'css' && 'CSS をコピーしました'}
                {copied === 'url' && '共有 URL をコピーしました'}
                {copied === 'fail' && 'コピーできませんでした。テキストを選択して Ctrl+C を使ってください'}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-fd-muted-foreground">
            出力の対象はライブラリ本体と同じセレクタ(<code>.ssg-root</code> + ポータル root)です。グリッドごとに分けたいときは <code>className</code> と <code>classNames.popover</code> などで同じ変数を渡してください(<a className="underline" href="/docs/guides/theming">テーマのガイド</a>)。
          </p>
        </div>
      </div>
    </div>
  );
}
