// 監査用ハーネス: URL の ?s=<scenario> でシナリオを切り替え、window.__* にハンドル / 状態 / ログを公開する。
//   計測・データ・列・SSRM のモックは Solid 版(solid/main.tsx)と共通の shared.ts。
import { Activity, StrictMode, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type GridState,
  type RowSelectionModel,
  type SpreadsheetGridHandle,
  type SpreadsheetGridProps,
  type GridContextMenuItem,
} from '@ishibashi0112/spreadsheet-grid';
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en';
import '@ishibashi0112/spreadsheet-grid/style.css';
import { baseColumns as sharedBaseColumns, lang, log, makeDataSource, makeRows, n, params, scenario, strict, type Row } from './shared';

function baseColumns(): GridColumn<Row>[] {
  return sharedBaseColumns({
    numberFormatter,
    customEditor: (ctx) => (
      <input
        autoFocus
        data-testid="custom-editor"
        defaultValue={ctx.initialText}
        onKeyDown={(e) => {
          if (e.key === 'Enter') ctx.commit((e.target as HTMLInputElement).value, 'down');
          if (e.key === 'Escape') ctx.cancel();
        }}
      />
    ),
  });
}

function GridHost({ which, extra }: { which: 1 | 2; extra?: Partial<SpreadsheetGridProps<Row>> }) {
  const ref = useRef<SpreadsheetGridHandle<Row>>(null);
  const [rows, setRowsState] = useState<Row[]>(() => (scenario === 'ssrm' || scenario === 'empty' ? [] : makeRows(n, which)));
  const [columns, setColumns] = useState<GridColumn<Row>[]>(() => (scenario === 'empty' ? [] : baseColumns()));
  const [props, setProps] = useState<Partial<SpreadsheetGridProps<Row>>>({});
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const propsRef = useRef(props);
  propsRef.current = props;
  window.__renderCount += 1;

  useEffect(() => {
    if (which === 1) {
      window.__grid = ref.current;
      window.__rows = () => rowsRef.current;
      window.__setRows = (r) => setRowsState(r);
      window.__setProps = (patch) => setProps((p) => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) }));
      window.__getProps = () => propsRef.current;
      window.__setColumns = (c) => setColumns(c);
      window.__columns = () => columnsRef.current;
    } else {
      window.__grid2 = ref.current;
    }
    window.__ready = true;
    return () => {
      if (which === 1) window.__grid = null;
      else window.__grid2 = null;
    };
  }, [which]);

  const onRowsChange = useCallback((next: Row[]) => {
    log('onRowsChange', { len: next.length });
    setRowsState(next);
  }, []);
  const onColumnsChange = useCallback((next: GridColumn<Row>[]) => {
    log('onColumnsChange', { keys: next.map((c) => `${c.key}:${c.pinned ?? '-'}:${c.visible === false ? 'h' : 'v'}`) });
    setColumns(next);
  }, []);
  const dataSource = useMemo(() => (scenario === 'ssrm' ? makeDataSource() : undefined), []);

  const scenarioProps: Partial<SpreadsheetGridProps<Row>> = {};
  if (scenario === 'grouping') {
    scenarioProps.columns = columns.map((c) => (c.key === 'category' || c.key === 'status' ? { ...c, rowGroup: true } : c));
  }
  if (scenario === 'detail') {
    scenarioProps.detailRow = {
      render: ({ row }) => (
        <div data-testid="detail-card" style={{ padding: 8 }}>
          <strong>詳細 {row.id}</strong>
          <input data-testid="detail-input" defaultValue={row.name} />
          <button type="button" onClick={() => log('detail-button', row.id)}>
            ボタン
          </button>
        </div>
      ),
      height: 120,
      isExpandable: (row) => row.id % 50 !== 0,
    };
    scenarioProps.onExpandedDetailRowKeysChange = (keys) => log('onExpandedDetailRowKeysChange', keys);
  }
  if (scenario === 'label') {
    scenarioProps.labelRow = {
      isLabelRow: (row) => row.isLabel === true,
      getLabel: (row) => row.label ?? '',
      sticky: true,
      height: 32,
    };
  }
  if (scenario === 'rowdrag') {
    scenarioProps.enableRowDrag = true;
    scenarioProps.isRowDraggable = (row) => row.id % 10 !== 0;
    scenarioProps.onRowMove = (p) => log('onRowMove', { rowKey: p.rowKey, from: p.fromIndex, to: p.toIndex, len: p.rows.length });
  }
  if (scenario === 'autoheight') {
    scenarioProps.autoHeight = true;
    scenarioProps.columns = columns.map((c) => (c.key === 'note' ? { ...c, autoHeight: true, wordBreak: 'auto-phrase' } : c));
    if (params.get('detail') === '1') {
      scenarioProps.detailRow = { render: ({ row }) => <div data-testid="detail-card">詳細 {row.id}</div>, height: 200 };
    }
  }
  if (scenario === 'height') {
    scenarioProps.height = '100%';
  }

  const contextItems = useCallback(
    (p: Parameters<NonNullable<SpreadsheetGridProps<Row>['getContextMenuItems']>>[0]): GridContextMenuItem[] => {
      log('getContextMenuItems', { type: p.target.type, rowIndex: p.target.rowIndex });
      return [
        { kind: 'label', label: '操作' },
        { label: 'ログ', onSelect: () => log('ctx-select', p.target.rowIndex) },
        { kind: 'separator' },
        { label: '削除', danger: true, onSelect: () => log('ctx-delete', p.target.rowKey) },
      ];
    },
    [],
  );

  return (
    <SpreadsheetGrid<Row>
      ref={ref}
      rows={dataSource ? undefined : rows}
      dataSource={dataSource}
      columns={columns}
      onRowsChange={onRowsChange}
      onColumnsChange={onColumnsChange}
      rowKeyGetter={(row) => row.id}
      createRow={() => ({ ...makeRows(1, 999)[0], id: Date.now() + Math.floor(Math.random() * 1000), name: '' })}
      createOverflowColumn={(i) => ({ key: `extra${i}`, title: `追加 ${i}`, width: 100, editable: true })}
      enableRowSelection
      enableContextMenu
      getContextMenuItems={contextItems}
      onContextMenuOpen={(p) => log('onContextMenuOpen', p.target.type)}
      scrollHint={scenario === 'big' || scenario === 'ssrm' ? { hintColumn: 'name' } : undefined}
      showFilterChipBar
      onStateChange={(s: GridState) => log('onStateChange', s)}
      onFiltersChange={(f) => log('onFiltersChange', f)}
      onSortChange={(s) => log('onSortChange', s)}
      onRowSelectionChange={(m: RowSelectionModel) => log('onRowSelectionChange', { type: m.type, n: m.rowKeys.length })}
      onUndoRedoStateChange={(s) => log('onUndoRedoStateChange', s)}
      onScroll={(p) => log('onScroll', p)}
      onHoveredRowChange={(i) => log('onHoveredRowChange', i)}
      // 追加(G-1): セル操作の通知。
      onCellClick={(p) => log('onCellClick', { rowKey: p.rowKey, columnKey: p.columnKey, rowIndex: p.rowIndex, ctrl: p.event.ctrlKey })}
      onCellDoubleClick={(p) => {
        log('onCellDoubleClick', { rowKey: p.rowKey, columnKey: p.columnKey, type: p.event.type });
        if (window.__preventDblclick) {
          p.preventDefault();
        }
      }}
      onActiveCellChange={(c) => log('onActiveCellChange', c && { rowKey: c.rowKey, columnKey: c.columnKey, rowIndex: c.rowIndex })}
      onServerSideLoadError={(e, p) => log('onServerSideLoadError', { msg: String((e as Error)?.message ?? e), ...p })}
      onServerSideWriteError={(e, p) => log('onServerSideWriteError', { msg: String((e as Error)?.message ?? e), n: p.updates.length })}
      showCellOverflowTooltip
      localeText={lang === 'en' ? localeTextEn : undefined}
      height={scenario === 'height' ? undefined : 420}
      {...scenarioProps}
      {...extra}
      {...props}
    />
  );
}

// 追加(1.1.0 / AP-07): ダイアログの中のグリッド。?host=native は素の <dialog> を showModal() で開く(トップレイヤー)。
//   ?host=radixlike は Radix(shadcn/ui)の modal の Dialog と同じ振る舞いの模擬: role="dialog"(aria-modal なし)を translate で
//   真ん中に置き、body に pointer-events: none、外へのフォーカスは中へ戻し、外側の pointerdown を記録する(本物は閉じる)。
//   ?host=mantinelike は Mantine の Modal と同じ形の模擬(1.1.0 の見直し): position: fixed で pointer-events: none の inner の中に、
//   transform と overflow-y: auto と max-height を持つ section(role="dialog" + aria-modal)。section の中ではポップアップが枠で切れる。
function DialogHost() {
  const host = params.get('host') ?? 'native';
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (host === 'native') {
      dialogRef.current?.showModal();
      return undefined;
    }
    const content = contentRef.current;
    if (!content) return undefined;
    const previous = document.body.style.pointerEvents;
    document.body.style.pointerEvents = 'none';
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !content.contains(event.target)) {
        window.__events.push({ type: 'dialog-focus-outside', t: performance.now() });
        content.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !content.contains(event.target)) {
        window.__events.push({ type: 'dialog-pointer-outside', t: performance.now() });
      }
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.body.style.pointerEvents = previous;
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [host]);
  const grid = <GridHost which={1} extra={{ height: 360 }} />;
  if (host === 'mantinelike') {
    return (
      <div>
        <div style={{ position: 'fixed', inset: 0, background: 'rgb(0 0 0 / 0.4)', zIndex: 199 }} />
        <div
          data-testid="host-layer"
          style={{
            position: 'fixed',
            width: '100%',
            top: 0,
            bottom: 0,
            zIndex: 200,
            pointerEvents: 'none',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            paddingTop: 40,
            boxSizing: 'border-box',
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            data-testid="host-dialog"
            style={{
              pointerEvents: 'all',
              transform: 'translateY(0)',
              overflowY: 'auto',
              maxHeight: 300,
              width: 960,
              maxWidth: '95vw',
              padding: 16,
              boxSizing: 'border-box',
              background: '#fff',
            }}
          >
            {grid}
          </section>
        </div>
      </div>
    );
  }
  if (host === 'native') {
    return (
      <dialog ref={dialogRef} data-testid="host-dialog" style={{ width: 960, maxWidth: '95vw', padding: 16 }}>
        {grid}
      </dialog>
    );
  }
  return (
    <div
      ref={contentRef}
      role="dialog"
      tabIndex={-1}
      data-testid="host-dialog"
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        translate: '-50% -50%',
        width: 960,
        maxWidth: '95vw',
        padding: 16,
        background: '#fff',
        boxShadow: '0 8px 32px rgb(0 0 0 / 0.3)',
        pointerEvents: 'auto',
        zIndex: 50,
      }}
    >
      {grid}
    </div>
  );
}

function App() {
  const [mounted, setMounted] = useState(true);
  const [activityVisible, setActivityVisible] = useState(true);
  useEffect(() => {
    window.__mount = (on) => setMounted(on);
    window.__activity = (visible) => setActivityVisible(visible);
  }, []);
  let body: ReactNode;
  if (scenario === 'two') {
    body = (
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <GridHost which={1} />
        </div>
        <div style={{ flex: 1 }}>
          <GridHost which={2} extra={{ theme: 'dark', density: 'compact' }} />
        </div>
      </div>
    );
  } else if (scenario === 'dialog') {
    body = <DialogHost />;
  } else if (scenario === 'height') {
    body = (
      <div className="parent-fixed">
        <GridHost which={1} />
      </div>
    );
  } else {
    body = <GridHost which={1} />;
  }
  return (
    <div>
      {mounted ? <Activity mode={activityVisible ? 'visible' : 'hidden'}>{body}</Activity> : <div data-testid="unmounted">unmounted</div>}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(strict ? <StrictMode><App /></StrictMode> : <App />);