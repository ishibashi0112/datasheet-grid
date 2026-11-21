// 監査ハーネスの React 版(main.tsx)と Solid 版(solid/main.tsx)で共通の部分: 計測(エラー / リスナー / rAF)、データ、列、
//   SSRM のモック、シナリオの URL の読み取り。フレームワークの部品(custom エディタの中身)と、ライブラリから取る値
//   (numberFormatter)は呼ぶ側から渡す(Solid 版の dev サーバーは React 版の入口を解決しないため)。
//   型は React 版の入口から取る(import type はどちらの dev サーバーでも消える。ハーネスは型検査の対象外)。
import type {
  GridColumn,
  ServerSideDataSource,
  ServerSideQuery,
  SpreadsheetGridHandle,
  SpreadsheetGridProps,
} from '@ishibashi0112/spreadsheet-grid';

// custom エディタ(列 custom)の ctx のうちハーネスが使うもの。
export type CustomEditorContext = {
  initialText: string;
  commit: (value: unknown, direction?: 'down') => unknown;
  cancel: () => void;
};
export type HarnessDeps = {
  numberFormatter: () => unknown;
  // custom エディタの中身(Enter で ctx.commit(値, 'down')、Escape で ctx.cancel()。描いたら入力欄へフォーカス)。
  customEditor: (ctx: CustomEditorContext) => unknown;
};

// ---------- 計測: エラー / リスナー / rAF ----------
declare global {
  interface Window {
    __errors: string[];
    __events: Array<{ type: string; payload?: unknown; t: number }>;
    __listeners: Record<string, number>;
    __rafPending: number;
    __grid: SpreadsheetGridHandle<Row> | null;
    __grid2: SpreadsheetGridHandle<Row> | null;
    __rows: () => Row[];
    __setRows: (rows: Row[]) => void;
    __setProps: (patch: Partial<SpreadsheetGridProps<Row>> | ((p: Partial<SpreadsheetGridProps<Row>>) => Partial<SpreadsheetGridProps<Row>>)) => void;
    __getProps: () => Partial<SpreadsheetGridProps<Row>>;
    __setColumns: (cols: GridColumn<Row>[]) => void;
    __columns: () => GridColumn<Row>[];
    __mount: (on: boolean) => void;
    // 追加(1.0.2 / RV-D3): Next.js の画面遷移と同じく <Activity> で隠す / 見せる。
    __activity: (visible: boolean) => void;
    __ssrm: SsrmControl;
    __ready: boolean;
    __renderCount: number;
    __makeRows: (n: number, seed?: number) => Row[];
    __setRenderBars?: (on: boolean) => void;
    // 追加(G-1): true のあいだ onCellDoubleClick で params.preventDefault() を呼ぶ(編集開始を止める)。
    __preventDblclick?: boolean;
  }
}
window.__errors = [];
window.__events = [];
window.__listeners = {};
window.__rafPending = 0;
window.__renderCount = 0;
export const log = (type: string, payload?: unknown) => {
  window.__events.push({ type, payload, t: performance.now() });
};
{
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    window.__errors.push('[error] ' + args.map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : safeJson(a))).join(' '));
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    window.__errors.push('[warn] ' + args.map((a) => (typeof a === 'string' ? a : safeJson(a))).join(' '));
    origWarn(...args);
  };
  window.addEventListener('error', (e) => window.__errors.push('[window.error] ' + (e.error?.stack ?? e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__errors.push('[unhandledrejection] ' + String((e.reason as Error)?.stack ?? e.reason)));
  // window / document のリスナー数をイベント種別ごとに追跡(dispose 漏れ検出用)。
  for (const target of [window, document] as const) {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    const name = target === window ? 'window' : 'document';
    (target as EventTarget).addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
      const k = `${name}:${type}`;
      window.__listeners[k] = (window.__listeners[k] ?? 0) + 1;
      return add(type, listener, opts);
    }) as typeof target.addEventListener;
    (target as EventTarget).removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, opts?: boolean | EventListenerOptions) => {
      const k = `${name}:${type}`;
      window.__listeners[k] = (window.__listeners[k] ?? 0) - 1;
      return remove(type, listener, opts);
    }) as typeof target.removeEventListener;
  }
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  const live = new Set<number>();
  window.requestAnimationFrame = (cb) => {
    const id = raf((t) => {
      live.delete(id);
      window.__rafPending = live.size;
      cb(t);
    });
    live.add(id);
    window.__rafPending = live.size;
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    live.delete(id);
    window.__rafPending = live.size;
    caf(id);
  };
}
function safeJson(v: unknown) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// ---------- データ ----------
export type Row = {
  id: number;
  name: string;
  qty: number | null;
  price: number;
  category: string;
  date: string;
  active: boolean;
  note: string;
  score: number | string | null;
  custom: string;
  status: string;
  secret: string;
  isLabel?: boolean;
  label?: string;
};
const CATS = ['A', 'B', 'C', 'D'];
const STATUSES = ['open', 'closed', 'pending'];
const LONG = '長いテキストの備考です。日本語の折り返しを確認します。ABCDEFG hijklmn 0123456789 ';
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeRows(n: number, seed = 1): Row[] {
  const rnd = mulberry32(seed);
  const rows: Row[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const d = new Date(2026, 0, 1 + ((i * 7) % 700));
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    rows[i] = {
      id: i + 1,
      name: `item-${String(i + 1).padStart(6, '0')}`,
      qty: i % 17 === 0 ? null : Math.floor(rnd() * 1000),
      price: Math.round(rnd() * 100000) / 100,
      category: CATS[i % CATS.length],
      date: i % 23 === 0 ? '' : iso,
      active: i % 3 === 0,
      note: i % 5 === 0 ? LONG.repeat(1 + (i % 4)) : `note ${i}`,
      score: i % 11 === 0 ? null : i % 13 === 0 ? 'n/a' : Math.floor(rnd() * 100),
      custom: `c${i}`,
      status: STATUSES[i % STATUSES.length],
      secret: `s${i}`,
    };
  }
  return rows;
}
window.__makeRows = makeRows;

export function baseColumns(deps: HarnessDeps): GridColumn<Row>[] {
  return [
    { key: 'id', title: 'ID', width: 80, pinned: 'left', align: 'right', filterType: 'number' },
    {
      key: 'name',
      title: '名前',
      width: 160,
      editable: true,
      filterType: 'text',
      validate: ({ value }) => String(value ?? '').trim() !== '' || '名前は必須です',
    },
    {
      key: 'qty',
      title: '数量',
      width: 110,
      editable: true,
      align: 'right',
      editor: { type: 'number', min: 0, step: 1 },
      valueFormatter: deps.numberFormatter() as GridColumn<Row>['valueFormatter'],
      filterType: 'numberSet',
      validate: ({ value }) => value === null || (typeof value === 'number' && value >= 0) || '0 以上',
      validationMode: 'reject',
      aggFunc: 'sum',
    },
    { key: 'price', title: '単価', width: 120, editable: true, flex: 1, minWidth: 100, align: 'right', filterType: 'number', aggFunc: 'avg' },
    {
      key: 'category',
      title: 'カテゴリ',
      width: 110,
      editable: true,
      editor: { type: 'select', options: CATS.map((c) => ({ value: c, label: `カテゴリ ${c}` })) },
      filterType: 'set',
    },
    { key: 'date', title: '日付', width: 130, editable: true, editor: { type: 'date' }, filterType: 'dateSet' },
    { key: 'active', title: '有効', width: 70, editable: true, editor: { type: 'checkbox' }, align: 'center' },
    { key: 'note', title: '備考', width: 220, editable: true, filterType: 'textSet' },
    { key: 'score', title: 'スコア', width: 100, editable: true, filterType: 'auto', align: 'right' },
    {
      key: 'custom',
      title: 'カスタム',
      width: 120,
      editable: true,
      editor: {
        type: 'custom',
        render: (ctx) => deps.customEditor(ctx as CustomEditorContext) as never,
      },
    },
    {
      key: 'status',
      title: '状態',
      width: 110,
      pinned: 'right',
      editable: true,
      filterType: 'select',
      filterOptions: STATUSES.map((s) => ({ value: s, label: s })),
    },
    { key: 'secret', title: '非表示', width: 100, visible: false, editable: true },
  ];
}

// ---------- SSRM モック ----------
export type SsrmControl = {
  latency: number;
  failNext: number; // 次の N リクエストを失敗させる
  failRanges: Array<[number, number]>;
  updateFail: boolean;
  updateLatency: number;
  calls: Array<{ startIndex: number; endIndex: number; query: ServerSideQuery; aborted: boolean; outcome: string }>;
  updates: unknown[];
  total: number;
  inflight: number;
  maxInflight: number;
  server: Row[];
};
window.__ssrm = {
  latency: 30,
  failNext: 0,
  failRanges: [],
  updateFail: false,
  updateLatency: 10,
  calls: [],
  updates: [],
  total: 10000,
  inflight: 0,
  maxInflight: 0,
  server: [],
};
function applyQuery(rows: Row[], query: ServerSideQuery): Row[] {
  let out = rows;
  const g = query.globalText?.trim().toLowerCase();
  if (g) out = out.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(g)));
  const cf = query.columnFilters ?? {};
  for (const [key, f] of Object.entries(cf)) {
    const fv = f as { kind: string; value?: unknown; values?: string[]; mode?: string };
    if (fv.kind === 'text') out = out.filter((r) => String((r as Record<string, unknown>)[key] ?? '').toLowerCase().includes(String(fv.value).toLowerCase()));
    else if (fv.kind === 'set' || fv.kind === 'select') {
      const vals = new Set(fv.kind === 'select' ? [String(fv.value)] : fv.values ?? []);
      out = out.filter((r) => {
        const has = vals.has(String((r as Record<string, unknown>)[key] ?? ''));
        return fv.mode === 'exclude' ? !has : has;
      });
    }
  }
  const sort = query.sort ?? [];
  if (sort.length > 0) {
    out = [...out].sort((a, b) => {
      for (const s of sort) {
        const av = (a as Record<string, unknown>)[s.columnKey];
        const bv = (b as Record<string, unknown>)[s.columnKey];
        const c = av === bv ? 0 : av == null ? 1 : bv == null ? -1 : av < bv ? -1 : 1;
        if (c !== 0) return s.direction === 'desc' ? -c : c;
      }
      return 0;
    });
  }
  return out;
}
export function makeDataSource(): ServerSideDataSource<Row> {
  const ctl = window.__ssrm;
  if (ctl.server.length === 0) ctl.server = makeRows(ctl.total, 7);
  return {
    initialRowCount: new URLSearchParams(location.search).get('noinit') === '1' ? undefined : ctl.total,
    blockSize: 100,
    getRows: ({ startIndex, endIndex, query, signal }) => {
      const call = { startIndex, endIndex, query, aborted: false, outcome: 'pending' };
      ctl.calls.push(call);
      ctl.inflight += 1;
      ctl.maxInflight = Math.max(ctl.maxInflight, ctl.inflight);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          ctl.inflight -= 1;
          if (signal.aborted) {
            call.aborted = true;
            call.outcome = 'aborted';
            reject(new DOMException('aborted', 'AbortError'));
            return;
          }
          const shouldFail = ctl.failNext > 0 || ctl.failRanges.some(([s, e]) => startIndex < e && endIndex > s);
          if (shouldFail) {
            if (ctl.failNext > 0) ctl.failNext -= 1;
            call.outcome = 'failed';
            reject(new Error(`mock failure ${startIndex}-${endIndex}`));
            return;
          }
          const filtered = applyQuery(ctl.server, query);
          call.outcome = 'ok';
          resolve({ rows: filtered.slice(startIndex, endIndex), totalRowCount: filtered.length });
        }, ctl.latency);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          if (call.outcome === 'pending') {
            ctl.inflight -= 1;
            call.aborted = true;
            call.outcome = 'aborted';
            reject(new DOMException('aborted', 'AbortError'));
          }
        });
      });
    },
    updateRows: ({ updates }) =>
      new Promise((resolve, reject) => {
        setTimeout(() => {
          ctl.updates.push(updates);
          if (ctl.updateFail) {
            reject(new Error('mock update failure'));
            return;
          }
          for (const u of updates) {
            const idx = ctl.server.findIndex((r) => r.id === (u.row as Row).id);
            if (idx >= 0) ctl.server[idx] = u.row as Row;
          }
          resolve(undefined);
        }, ctl.updateLatency);
      }),
  };
}

// ---------- シナリオ ----------
export const params = new URLSearchParams(location.search);
export const scenario = params.get('s') ?? 'basic';
export const n = Number(params.get('n') ?? (scenario === 'big' ? 1_000_000 : scenario === 'autoheight' ? 3000 : 500));
export const strict = params.get('strict') === '1';
// 追加(英語対応): ?lang=en で英語の文言(localeTextEn)。
export const lang = params.get('lang');