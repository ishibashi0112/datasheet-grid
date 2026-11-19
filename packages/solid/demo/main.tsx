// 試作のデモ: 10,000 行の編集できる在庫表(左右の固定列 + 横に長い列で縦横の仮想化を確かめる。数量・単価・分類に条件付き書式)。
import { Show, createSignal, onSettled } from 'solid-js';
import { render } from '@solidjs/web';
import '../../react/src/styles.css';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '../src';

type Item = {
  id: number;
  name: string;
  category: string;
  qty: number;
  price: number;
  note: string;
  due: string;
  code: string;
  done: boolean;
  extra: Record<string, number>;
};

const CATEGORIES = ['文具', '食品', '家電', '衣料', '工具'];
const EXTRA_KEYS = Array.from({ length: 30 }, (_, i) => `m${i + 1}`);

const createRows = (count: number): Item[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `品目 ${i + 1}`,
    category: CATEGORIES[i % CATEGORIES.length] ?? '',
    qty: (i * 7) % 100,
    price: 100 + ((i * 37) % 900),
    note: i % 10 === 0 ? '1 行目\n2 行目' : '',
    due: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    code: `A${String(i + 1).padStart(4, '0')}`,
    done: i % 3 === 0,
    extra: Object.fromEntries(EXTRA_KEYS.map((key, k) => [key, (i * (k + 3)) % 1000])),
  }));

// 表示だけの固定行(上: 目標、下: 前月と前年)。
const pinnedRow = (id: number, name: string, qty: number, price: number): Item => ({
  ...createRows(1)[0]!,
  id,
  name,
  qty,
  price,
  note: '',
  code: '',
  done: false,
});
const PINNED_TOP = pinnedRow(-1, '目標', 90, 500);
const PINNED_BOTTOM = [pinnedRow(-2, '前月', 40, 480), pinnedRow(-3, '前年', 35, 450)];

const baseColumns: GridColumn<Item>[] = [
  { key: 'id', title: 'ID', width: 72, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 160 },
  {
    key: 'category',
    title: '分類',
    width: 100,
    editor: { type: 'select', options: CATEGORIES.map((value) => ({ value, label: value })) },
    // 条件付き書式の状態チップ。
    conditionalFormat: { chips: { 文具: 'info', 食品: 'good', 家電: 'warning', 衣料: 'neutral', 工具: 'critical' } },
  },
  {
    key: 'qty',
    title: '数量',
    width: 90,
    align: 'right',
    editor: { type: 'number', min: 0, step: 1 },
    validationMode: 'reject',
    validate: ({ value }) => (Number(value) <= 95 ? true : '95 以下にしてください'),
    cellNote: ({ row }) => (row.id % 50 === 0 ? '棚卸しで確認済み' : undefined),
    conditionalFormat: { dataBar: {} },
    aggFunc: 'sum',
  },
  { key: 'done', title: '済', width: 60, editor: { type: 'checkbox' } },
  {
    key: 'price',
    title: '単価',
    width: 100,
    align: 'right',
    editor: { type: 'number' },
    conditionalFormat: { colorScale: {} },
    aggFunc: 'avg',
  },
  { key: 'due', title: '期日', width: 130, editor: { type: 'date' } },
  {
    key: 'code',
    title: 'コード(custom)',
    width: 130,
    editor: {
      type: 'custom',
      // 自作のエディタ: Enter で大文字にして確定、Escape で取り消し。フォーカスは利用側が置く。
      render: (ctx) => {
        let input: HTMLInputElement | undefined;
        onSettled(() => input?.focus());
        return (
          <input
            ref={(element) => {
              input = element;
            }}
            class="ssg-cell-editor-input"
            value={ctx.initialText}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                ctx.commit(event.currentTarget.value.toUpperCase(), 'down');
              } else if (event.key === 'Escape') {
                event.preventDefault();
                ctx.cancel();
              }
            }}
          />
        );
      },
    },
  },
  ...EXTRA_KEYS.map<GridColumn<Item>>((key) => ({
    key,
    title: key.toUpperCase(),
    width: 90,
    align: 'right',
    getValue: (row) => row.extra[key],
    setValue: (row, value) => ({ ...row, extra: { ...row.extra, [key]: Number(value) || 0 } }),
  })),
  { key: 'note', title: 'メモ', width: 180, pinned: 'right', autoHeight: true, editor: { type: 'text', multiline: true } },
];

function App() {
  const [rows, setRows] = createSignal(createRows(10_000));
  const [active, setActive] = createSignal('');
  const [dark, setDark] = createSignal(false);
  const [pinName, setPinName] = createSignal(false);
  const [mounted, setMounted] = createSignal(true);
  const [changes, setChanges] = createSignal(0);
  const [selected, setSelected] = createSignal('');
  const [expanded, setExpanded] = createSignal('');
  const [autoHeight, setAutoHeight] = createSignal(false);
  const [footer, setFooter] = createSignal(false);
  const [aggregates, setAggregates] = createSignal(true);
  const [scrollHint, setScrollHint] = createSignal(false);
  const [highlight, setHighlight] = createSignal(false);
  const [cross, setCross] = createSignal(false);
  const [find, setFind] = createSignal('');
  const [ime, setIme] = createSignal(false);
  // 見出しの grip で並べ替えた列(onColumnsChange で受ける)。「品名を左へ固定」を押すと元の並びへ戻す。
  const [userColumns, setUserColumns] = createSignal<GridColumn<Item>[] | null>(null);
  const [liveDrag, setLiveDrag] = createSignal(false);
  const [rowDrag, setRowDrag] = createSignal(false);
  // 「品名を左へ固定」で編集中の列のペインを変える(エディタが外れるときの blur で確定しないことの確かめ)。
  const columns = () =>
    userColumns() ??
    (pinName() ? baseColumns.map((column) => (column.key === 'name' ? { ...column, pinned: 'left' as const } : column)) : baseColumns);
  let handle: SpreadsheetGridHandle<Item> | undefined;
  return (
    <div style={{ padding: '16px', 'font-family': 'system-ui, sans-serif' }}>
      <h1 style={{ 'font-size': '18px', margin: '0 0 8px' }}>Solid 2.0 版の試作</h1>
      <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '8px', 'align-items': 'center' }}>
        <button type="button" data-testid="scroll-bottom" onClick={() => handle?.scrollToRow(9_999)}>
          最後の行へ
        </button>
        <button type="button" data-testid="undo" onClick={() => handle?.undo()}>
          元に戻す
        </button>
        <button type="button" data-testid="theme" onClick={() => setDark((v) => !v)}>
          ライト / ダーク
        </button>
        <button
          type="button"
          data-testid="pin-name"
          onClick={() => {
            setUserColumns(null);
            setPinName((v) => !v);
          }}
        >
          品名を左へ固定
        </button>
        <button type="button" data-testid="unmount" onClick={() => setMounted((v) => !v)}>
          グリッドを外す / 戻す
        </button>
        <button type="button" data-testid="auto-height" onClick={() => setAutoHeight((v) => !v)}>
          行の高さの自動調整
        </button>
        <button type="button" data-testid="footer" onClick={() => setFooter((v) => !v)}>
          合計行と固定行
        </button>
        <button type="button" data-testid="aggregates" onClick={() => setAggregates((v) => !v)}>
          選択範囲の集計
        </button>
        <button type="button" data-testid="scroll-hint" onClick={() => setScrollHint((v) => !v)}>
          スクロールのヒント
        </button>
        <button type="button" data-testid="highlight" onClick={() => setHighlight((v) => !v)}>
          変更のハイライト
        </button>
        <button type="button" data-testid="cross" onClick={() => setCross((v) => !v)}>
          クロスヘア
        </button>
        <button type="button" data-testid="open-find" onClick={() => handle?.openFind('品目 12')}>
          検索を開く
        </button>
        <button type="button" data-testid="ime" onClick={() => setIme((v) => !v)}>
          IME の直接入力
        </button>
        <button type="button" data-testid="drag-motion" onClick={() => setLiveDrag((v) => !v)}>
          ドラッグ: ghost / live
        </button>
        <button type="button" data-testid="row-drag" onClick={() => setRowDrag((v) => !v)}>
          行のドラッグ
        </button>
        <span data-testid="find">{find()}</span>
        <span data-testid="active">{active()}</span>
        <span data-testid="changes">{changes()}</span>
        <span data-testid="selected">{selected()}</span>
        <span data-testid="expanded">{expanded()}</span>
      </div>
      <Show when={mounted()}>
        <SpreadsheetGrid<Item>
          ref={(h) => {
            handle = h;
            (window as unknown as { gridHandle: unknown }).gridHandle = h;
          }}
          rows={rows()}
          columns={columns()}
          theme={dark() ? 'dark' : 'light'}
          rowKeyGetter={(row) => row.id}
          onRowsChange={(next) => {
            setChanges((count) => count + 1);
            setRows(next);
          }}
          height={520}
          // メモの列は autoHeight: 「行の高さの自動調整」で、改行のある行が伸びる。
          autoHeight={autoHeight()}
          // 「合計行と固定行」: 数量の合計・単価の平均の合計行と、上下の固定行(表示だけの行)。
          totalRow={footer()}
          pinnedTopRows={footer() ? [PINNED_TOP] : undefined}
          pinnedBottomRows={footer() ? PINNED_BOTTOM : undefined}
          // 「選択範囲の集計」: 2 セル以上を選ぶと下部バーに平均 / データの個数 / 合計(既定でオン)。全選択は時間分割で集計する。
          showSelectionAggregates={aggregates()}
          // 「スクロールのヒント」: 行番号のバブル(品名つき)・ルーラー・カスタムスクロールバー。
          scrollHint={scrollHint() ? { hintColumn: 'name' } : undefined}
          // 「変更のハイライト」: 値が変わったセルのフラッシュ + 数値のトゥイーン。「クロスヘア」: ホバーの列も帯で示す。
          //   コピー範囲の点線(showCopyRange)は既定でオン。
          highlightChanges={highlight()}
          hoverHighlight={cross() ? 'cross' : 'row'}
          // セル内検索: グリッドにフォーカスがあるときの Ctrl / ⌘ + F か「検索を開く」(openFind)。
          find
          // 「IME の直接入力」: IME をオンにしたままセルで打ち始められる(変換の確定で編集を始める)。
          imeDirectInput={ime()}
          // 列の並べ替え: 見出しにホバーすると出る grip を引く(固定ペインへも移せる)。「ドラッグ: ghost / live」で live 方式に。
          onColumnsChange={(next) => setUserColumns(next)}
          columnDragMotion={liveDrag() ? 'live' : 'ghost'}
          // 「行のドラッグ」: 左端のハンドルで行を並べ替える(ソート中は淡色)。7 の倍数の行は掴めず、先頭へは落とせない。
          enableRowDrag={rowDrag()}
          rowDragMotion={liveDrag() ? 'live' : 'ghost'}
          isRowDraggable={(row) => row.id % 7 !== 0}
          canDropRow={(params) => params.toIndex !== 0}
          onFindChange={(params) => setFind(`${params.open ? 'open' : 'closed'}:${params.query}:${params.currentIndex ?? '-'}/${params.matchCount}`)}
          ariaLabel="在庫表"
          onActiveCellChange={(cell) => setActive(cell ? `${cell.columnKey} / ${String(cell.rowKey)}` : '')}
          enableRowSelection
          onRowSelectionChange={(model) => setSelected(`${model.type}:${model.rowKeys.length}`)}
          // 展開行: 5 の倍数の行は開けない。中身は入力欄 2 つと閉じるボタン(フォーカスの順を確かめる)。
          detailRow={{
            height: 120,
            isExpandable: (row) => row.id % 5 !== 0,
            render: (ctx) => (
              <div data-testid={`detail-${ctx.rowKey}`} style={{ padding: '8px', display: 'flex', gap: '8px' }}>
                <span>
                  {ctx.row.name} の詳細(表示の {ctx.rowIndex + 1} 行目)
                </span>
                <input data-testid={`detail-input-${ctx.rowKey}`} aria-label="詳細のメモ" />
                <input aria-label="詳細の担当" />
                <button type="button" data-testid={`detail-close-${ctx.rowKey}`} onClick={() => ctx.collapse()}>
                  閉じる
                </button>
              </div>
            ),
          }}
          onExpandedDetailRowKeysChange={(keys) => setExpanded(Array.from(keys).join(','))}
        />
      </Show>
    </div>
  );
}

render(() => <App />, document.getElementById('app')!);