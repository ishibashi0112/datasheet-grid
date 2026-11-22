// 監査用ハーネスの Solid 版: React 版(../main.tsx)と同じシナリオ(?s=<scenario>)・同じ window.__* を Solid 版のグリッドで
//   公開し、同じテスト(../t-*.mjs)を `HARNESS_BASE=http://127.0.0.1:5179/` で回す。計測・データ・列・SSRM のモックは
//   ../shared.ts を React 版と共有する。React 版との違い:
//   - `&strict=1`(React の StrictMode)は無視して普通に描く(Solid に二重の実行は無い)。
//   - `__activity(false)`(React の <Activity> で隠す)は display: none で隠すだけ(Solid に effect を止めて残す仕組みは無い)。
//   - `__renderCount` は部品の関数が動いた回数(Solid は最初の 1 回だけ)。
import { Show, createMemo, createSignal, onCleanup, onSettled, type JSX } from 'solid-js';
import { render } from '@solidjs/web';
import { localeTextEn, numberFormatter } from '@ishibashi0112/spreadsheet-grid-core';
import {
  SpreadsheetGrid,
  type GridColumn,
  type SpreadsheetGridHandle,
  type SpreadsheetGridProps,
} from '@ishibashi0112/spreadsheet-grid-solid';
import '@ishibashi0112/spreadsheet-grid/style.css';
import shadowCss from '@ishibashi0112/spreadsheet-grid/style.css?inline';
import { baseColumns as sharedBaseColumns, lang, log, makeDataSource, makeRows, mountPoint, n, params, scenario, type Row } from '../shared';
// Solid 版のグリッドが受ける props の名前。変更(段階 3-3): Solid 版は core の SpreadsheetGridProps をすべて受けるようになった
//   (packages/solid の model/gridTypes.ts の SupportedPropKeys は無くなった)ので、core の型の 1 段目の項目の名前を読む。
import gridTypesSource from '../../../packages/core/src/model/gridTypes.core.ts?raw';

type Props = SpreadsheetGridProps<Row>;
const PROP_KEYS = [
  ...(/export type SpreadsheetGridProps<[^\n]*= \{\n([\s\S]*?)\n\};/.exec(gridTypesSource)?.[1] ?? '').matchAll(/^ {2}(\w+)\??:/gm),
].map((match) => match[1]!);
if (PROP_KEYS.length < 100) throw new Error('[harness] core の SpreadsheetGridProps の項目を読めませんでした');
const UNSET = Symbol('unset');
type ContextMenuParams = Parameters<NonNullable<Props['getContextMenuItems']>>[0];

// window.__* の型は shared.ts(React 版の型)。Solid 版の値はここで読み替える。
const win = window as unknown as Window & {
  __grid: SpreadsheetGridHandle<Row> | null;
  __grid2: SpreadsheetGridHandle<Row> | null;
  __rows: () => Row[];
  __setRows: (rows: Row[]) => void;
  __setProps: (patch: Partial<Props> | ((p: Partial<Props>) => Partial<Props>)) => void;
  __getProps: () => Partial<Props>;
  __setColumns: (cols: GridColumn<Row>[]) => void;
  __columns: () => GridColumn<Row>[];
};

function baseColumns(): GridColumn<Row>[] {
  return sharedBaseColumns({
    numberFormatter,
    // React 版は autoFocus。Solid は描き終わった後に入力欄へフォーカスする(autofocus は後から足した要素には効かない)。
    customEditor: (ctx) => {
      let input: HTMLInputElement | undefined;
      onSettled(() => input?.focus());
      return (
        <input
          ref={(element) => {
            input = element;
          }}
          data-testid="custom-editor"
          value={ctx.initialText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ctx.commit((e.target as HTMLInputElement).value, 'down');
            if (e.key === 'Escape') ctx.cancel();
          }}
        />
      );
    },
  }) as unknown as GridColumn<Row>[];
}

const contextItems = (p: ContextMenuParams) => {
  log('getContextMenuItems', { type: p.target.type, rowIndex: p.target.rowIndex });
  return [
    { kind: 'label' as const, label: '操作' },
    { label: 'ログ', onSelect: () => log('ctx-select', p.target.rowIndex) },
    { kind: 'separator' as const },
    { label: '削除', danger: true, onSelect: () => log('ctx-delete', p.target.rowKey) },
  ];
};

function GridHost(hostProps: { which: 1 | 2; extra?: Partial<Props> }) {
  const which = hostProps.which;
  const [rows, setRowsState] = createSignal<Row[]>(scenario === 'ssrm' || scenario === 'empty' ? [] : makeRows(n, which));
  const [columns, setColumns] = createSignal<GridColumn<Row>[]>(scenario === 'empty' ? [] : baseColumns());
  // __setProps の値は prop ごとの signal に置く(1 つの signal にまとめると、どの prop を変えても全部の prop を読む所が
  //   動き直し、Solid の開発ビルドが HUGE_FAN_OUT で知らせる。実際のアプリは JSX の prop ごとに getter で渡すので、
  //   変えた prop を読む所だけが動く)。
  const overrides = new Map(PROP_KEYS.map((key) => [key, createSignal<unknown>(UNSET)] as const));
  let currentOverrides: Partial<Props> = {};
  const setProps = (patch: Partial<Props>) => {
    currentOverrides = { ...currentOverrides, ...patch };
    for (const [key, value] of Object.entries(patch)) {
      const signal = overrides.get(key);
      if (!signal) {
        console.error(`[harness] Solid 版の SpreadsheetGrid が受けない prop です: ${key}`);
        continue;
      }
      signal[1](() => value);
    }
  };
  window.__renderCount += 1;

  if (which === 1) {
    win.__rows = () => rows();
    win.__setRows = (r) => setRowsState(() => r);
    win.__setProps = (patch) => setProps(typeof patch === 'function' ? patch(currentOverrides) : patch);
    win.__getProps = () => currentOverrides;
    win.__setColumns = (c) => setColumns(() => c);
    win.__columns = () => columns();
  }
  const onRef = (handle: SpreadsheetGridHandle<Row>) => {
    if (which === 1) win.__grid = handle;
    else win.__grid2 = handle;
    window.__ready = true;
  };
  onCleanup(() => {
    if (which === 1) win.__grid = null;
    else win.__grid2 = null;
  });

  const onRowsChange = (next: Row[]) => {
    log('onRowsChange', { len: next.length });
    setRowsState(() => next);
  };
  const onColumnsChange = (next: GridColumn<Row>[]) => {
    log('onColumnsChange', { keys: next.map((c) => `${c.key}:${c.pinned ?? '-'}:${c.visible === false ? 'h' : 'v'}`) });
    setColumns(() => next);
  };
  const dataSource = scenario === 'ssrm' ? makeDataSource() : undefined;

  // シナリオの props(columns は列の state から作り直すので別に持つ)。
  const scenarioColumns =
    scenario === 'grouping'
      ? createMemo(() => columns().map((c) => (c.key === 'category' || c.key === 'status' ? { ...c, rowGroup: true } : c)))
      : scenario === 'autoheight'
        ? createMemo(() => columns().map((c) => (c.key === 'note' ? { ...c, autoHeight: true, wordBreak: 'auto-phrase' as const } : c)))
        : undefined;
  const scenarioProps = ((): Partial<Props> => {
    const sp: Partial<Props> = {};
    if (scenario === 'detail') {
      sp.detailRow = {
        render: ({ row }) => (
          <div data-testid="detail-card" style="padding: 8px">
            <strong>詳細 {row.id}</strong>
            <input data-testid="detail-input" value={row.name} />
            <button type="button" onClick={() => log('detail-button', row.id)}>
              ボタン
            </button>
          </div>
        ),
        height: 120,
        isExpandable: (row) => row.id % 50 !== 0,
      };
      sp.onExpandedDetailRowKeysChange = (keys) => log('onExpandedDetailRowKeysChange', keys);
    }
    if (scenario === 'label') {
      sp.labelRow = {
        isLabelRow: (row) => row.isLabel === true,
        getLabel: (row) => row.label ?? '',
        sticky: true,
        height: 32,
      };
    }
    if (scenario === 'rowdrag') {
      sp.enableRowDrag = true;
      sp.isRowDraggable = (row) => row.id % 10 !== 0;
      sp.onRowMove = (p) => log('onRowMove', { rowKey: p.rowKey, from: p.fromIndex, to: p.toIndex, len: p.rows.length });
    }
    if (scenario === 'autoheight') {
      sp.autoHeight = true;
      if (params.get('detail') === '1') {
        sp.detailRow = { render: ({ row }) => <div data-testid="detail-card">詳細 {row.id}</div>, height: 200 };
      }
    }
    if (scenario === 'height') {
      sp.height = '100%';
    }
    return sp;
  })();

  // React 版の JSX と同じ順(基本 → シナリオ → extra → __setProps)で上書きする。
  const baseProps: Partial<Props> = {
    get rows() {
      return dataSource ? undefined : rows();
    },
    dataSource,
    get columns() {
      return columns();
    },
    onRowsChange,
    onColumnsChange,
    rowKeyGetter: (row) => row.id,
    createRow: () => ({ ...makeRows(1, 999)[0]!, id: Date.now() + Math.floor(Math.random() * 1000), name: '' }),
    createOverflowColumn: (i) => ({ key: `extra${i}`, title: `追加 ${i}`, width: 100, editable: true }),
    enableRowSelection: true,
    enableContextMenu: true,
    getContextMenuItems: contextItems,
    onContextMenuOpen: (p) => log('onContextMenuOpen', p.target.type),
    scrollHint: scenario === 'big' || scenario === 'ssrm' ? { hintColumn: 'name' } : undefined,
    showFilterChipBar: true,
    onStateChange: (s) => log('onStateChange', s),
    onFiltersChange: (f) => log('onFiltersChange', f),
    onSortChange: (s) => log('onSortChange', s),
    onRowSelectionChange: (m) => log('onRowSelectionChange', { type: m.type, n: m.rowKeys.length }),
    onUndoRedoStateChange: (s) => log('onUndoRedoStateChange', s),
    onScroll: (p) => log('onScroll', p),
    onHoveredRowChange: (i) => log('onHoveredRowChange', i),
    onCellClick: (p) => log('onCellClick', { rowKey: p.rowKey, columnKey: p.columnKey, rowIndex: p.rowIndex, ctrl: p.event.ctrlKey }),
    onCellDoubleClick: (p) => {
      log('onCellDoubleClick', { rowKey: p.rowKey, columnKey: p.columnKey, type: p.event.type });
      if (window.__preventDblclick) {
        p.preventDefault();
      }
    },
    onActiveCellChange: (c) => log('onActiveCellChange', c && { rowKey: c.rowKey, columnKey: c.columnKey, rowIndex: c.rowIndex }),
    onServerSideLoadError: (e, p) => log('onServerSideLoadError', { msg: String((e as Error)?.message ?? e), ...p }),
    onServerSideWriteError: (e, p) => log('onServerSideWriteError', { msg: String((e as Error)?.message ?? e), n: p.updates.length }),
    showCellOverflowTooltip: true,
    localeText: lang === 'en' ? localeTextEn : undefined,
    height: scenario === 'height' ? undefined : 420,
  };
  const extra: Partial<Props> = hostProps.extra ?? {};
  const gridProps = {} as Props;
  for (const key of PROP_KEYS) {
    const override = overrides.get(key)![0];
    Object.defineProperty(gridProps, key, {
      enumerable: true,
      get: () => {
        const value = override();
        if (value !== UNSET) return value;
        if (key === 'columns' && scenarioColumns) return scenarioColumns();
        if (key in scenarioProps) return scenarioProps[key as keyof Props];
        if (key in extra) return extra[key as keyof Props];
        return baseProps[key as keyof Props];
      },
    });
  }

  return <SpreadsheetGrid {...gridProps} ref={onRef} />;
}

// React 版の DialogHost と同じ(?host=native / radixlike / mantinelike)。
function DialogHost() {
  const host = params.get('host') ?? 'native';
  let dialog: HTMLDialogElement | undefined;
  let content: HTMLDivElement | undefined;
  onSettled(() => {
    if (host === 'native') {
      dialog?.showModal();
      return undefined;
    }
    if (!content) return undefined;
    const target = content;
    const previous = document.body.style.pointerEvents;
    document.body.style.pointerEvents = 'none';
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !target.contains(event.target)) {
        window.__events.push({ type: 'dialog-focus-outside', t: performance.now() });
        target.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !target.contains(event.target)) {
        window.__events.push({ type: 'dialog-pointer-outside', t: performance.now() });
      }
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('pointerdown', onPointerDown, true);
    // onSettled の中では onCleanup を使えない(片付けは戻り値で返す)。
    return () => {
      document.body.style.pointerEvents = previous;
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  });
  const grid = () => <GridHost which={1} extra={{ height: 360 }} />;
  if (host === 'mantinelike') {
    return (
      <div>
        <div style="position: fixed; inset: 0; background: rgb(0 0 0 / 0.4); z-index: 199" />
        <div
          data-testid="host-layer"
          style="position: fixed; width: 100%; top: 0; bottom: 0; z-index: 200; pointer-events: none; display: flex; justify-content: center; align-items: flex-start; padding-top: 40px; box-sizing: border-box"
        >
          <section
            role="dialog"
            aria-modal="true"
            tabindex={-1}
            data-testid="host-dialog"
            style="pointer-events: all; transform: translateY(0); overflow-y: auto; max-height: 300px; width: 960px; max-width: 95vw; padding: 16px; box-sizing: border-box; background: #fff"
          >
            {grid()}
          </section>
        </div>
      </div>
    );
  }
  if (host === 'native') {
    return (
      <dialog
        ref={(element) => {
          dialog = element;
        }}
        data-testid="host-dialog"
        style="width: 960px; max-width: 95vw; padding: 16px"
      >
        {grid()}
      </dialog>
    );
  }
  return (
    <div
      ref={(element) => {
        content = element;
      }}
      role="dialog"
      tabindex={-1}
      data-testid="host-dialog"
      style="position: fixed; left: 50%; top: 50%; translate: -50% -50%; width: 960px; max-width: 95vw; padding: 16px; background: #fff; box-shadow: 0 8px 32px rgb(0 0 0 / 0.3); pointer-events: auto; z-index: 50"
    >
      {grid()}
    </div>
  );
}

function App() {
  const [mounted, setMounted] = createSignal(true);
  const [activityVisible, setActivityVisible] = createSignal(true);
  window.__mount = (on) => setMounted(on);
  window.__activity = (visible) => setActivityVisible(visible);
  const body = (): JSX.Element => {
    if (scenario === 'two') {
      return (
        <div style="display: flex; gap: 8px">
          <div style="flex: 1">
            <GridHost which={1} />
          </div>
          <div style="flex: 1">
            <GridHost which={2} extra={{ theme: 'dark', density: 'compact' }} />
          </div>
        </div>
      );
    }
    if (scenario === 'dialog') {
      return <DialogHost />;
    }
    if (scenario === 'height') {
      return (
        <div class="parent-fixed">
          <GridHost which={1} />
        </div>
      );
    }
    return <GridHost which={1} />;
  };
  return (
    <div>
      <Show when={mounted()} fallback={<div data-testid="unmounted">unmounted</div>}>
        {/* display: contents は箱を作らないので、見えている間のレイアウトは React 版(<Activity> は DOM を足さない)と同じ。 */}
        <div style={activityVisible() ? 'display: contents' : 'display: none'}>{body()}</div>
      </Show>
    </div>
  );
}

// ?attr=1 で Solid の attribution(動き直しの理由を console へ出す)を有効にする(開発時の知らせの出どころを調べるとき)。
if (params.get('attr') === '1') {
  const { attribution } = await import('solid-js/attribution');
  attribution.enable();
}
render(() => <App />, mountPoint(shadowCss));