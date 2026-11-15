// 追加(F-2 / セル内検索): findController のテストです(走査は時間分割なので await で流す)。
import { describe, expect, it, vi } from 'vitest';
import { createFindController } from './findController';
import type { GridColumn, RowModel } from '../model/gridTypes.unbound';

type Row = { id: number; name: string; qty: number };
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 120 },
  { key: 'qty', title: 'Qty', width: 80, valueFormatter: ({ value }) => `${value}個` },
];
const makeRowModel = (rows: Row[]): RowModel<Row> => ({
  getRow: (i) => rows[i],
  getRowCount: () => rows.length,
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id ?? i,
});
const rows: Row[] = [
  { id: 1, name: 'Alpha', qty: 10 },
  { id: 2, name: 'beta alpha', qty: 2 },
  { id: 3, name: 'gamma', qty: 100 },
];
const flush = async () => {
  for (let i = 0; i < 6; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
};

describe('findController', () => {
  it('open(query) で走査し、ヒット(大文字小文字を無視・複数列・1 セル複数)をカレント先頭で onNavigate する', async () => {
    const controller = createFindController<Row>();
    const onNavigate = vi.fn();
    const onChange = vi.fn();
    controller.update({ enabled: true, rowModel: makeRowModel(rows), columns, caseSensitive: false, onNavigate, onChange });
    controller.open('alpha');
    expect(controller.getSnapshot().open).toBe(true);
    await flush();
    const s = controller.getSnapshot();
    expect(s.matches.map((m) => [m.rowIndex, m.colIndex, m.start])).toEqual([
      [0, 0, 0],
      [1, 0, 5],
    ]);
    expect(s.currentIndex).toBe(0);
    expect(s.index.get(1)?.get(0)?.[0]).toEqual({ start: 5, length: 5, matchIndex: 1 });
    expect(onNavigate).toHaveBeenLastCalledWith(0, 0);
    expect(onChange).toHaveBeenLastCalledWith({ query: 'alpha', matchCount: 2, currentIndex: 0, open: true });
    // 順送り(循環)。
    controller.next();
    expect(controller.getSnapshot().currentIndex).toBe(1);
    expect(onNavigate).toHaveBeenLastCalledWith(1, 0);
    controller.next();
    expect(controller.getSnapshot().currentIndex).toBe(0);
    controller.prev();
    expect(controller.getSnapshot().currentIndex).toBe(1);
    // 整形後の文字列(「10個」)にヒットする。
    controller.setQuery('0個');
    await flush();
    expect(controller.getSnapshot().matches.map((m) => [m.rowIndex, m.colIndex])).toEqual([
      [0, 1],
      [2, 1],
    ]);
    // close でクエリと結果が消える。
    controller.close();
    expect(controller.getSnapshot()).toMatchObject({ open: false, query: '', matches: [], currentIndex: null });
    expect(onChange).toHaveBeenLastCalledWith({ query: '', matchCount: 0, currentIndex: null, open: false });
    controller.dispose();
  });

  // 追加(1.0 前の最終チェック FC-26): 文字を出さない列(チェックボックス / showValue: false のデータバー)は探さない。
  it('チェックボックスの列とデータバーの showValue: false の列は検索の対象にしない', async () => {
    type FlagRow = { id: number; name: string; done: boolean; score: number };
    const flagColumns: GridColumn<FlagRow>[] = [
      { key: 'name', title: 'Name', width: 120 },
      { key: 'done', title: 'Done', width: 60, editor: { type: 'checkbox' } },
      { key: 'score', title: 'Score', width: 80, conditionalFormat: { dataBar: { showValue: false } } },
    ];
    const flagRows: FlagRow[] = [{ id: 1, name: 'true 12', done: true, score: 12 }];
    const controller = createFindController<FlagRow>();
    controller.update({
      enabled: true,
      rowModel: {
        getRow: (i) => flagRows[i],
        getRowCount: () => flagRows.length,
        getSourceIndex: (i) => i,
        getRowKey: (i) => flagRows[i]?.id ?? i,
      },
      columns: flagColumns,
      caseSensitive: false,
      onNavigate: vi.fn(),
      onChange: vi.fn(),
    });
    controller.open('true');
    await flush();
    expect(controller.getSnapshot().matches.map((m) => m.colIndex)).toEqual([0]);
    controller.setQuery('12');
    await flush();
    expect(controller.getSnapshot().matches.map((m) => m.colIndex)).toEqual([0]);
    // renderCell の列は renderCell が中身を描くので、チェックボックス / showValue: false でも従来どおり探す。
    controller.update({
      enabled: true,
      rowModel: {
        getRow: (i) => flagRows[i],
        getRowCount: () => flagRows.length,
        getSourceIndex: (i) => i,
        getRowKey: (i) => flagRows[i]?.id ?? i,
      },
      columns: flagColumns.map((column) => (column.key === 'name' ? column : { ...column, renderCell: () => null })),
      caseSensitive: false,
      onNavigate: vi.fn(),
      onChange: vi.fn(),
    });
    await flush();
    expect(controller.getSnapshot().matches.map((m) => m.colIndex)).toEqual([0, 2]);
    controller.dispose();
  });

  it('条件付き書式を描かない構成(conditionalFormat: false)では、チップの label ではなく値を探し、showValue: false のデータバーの列も探す(レビュー QB-1)', async () => {
    type CfRow = { id: number; status: string; score: number };
    const cfColumns: GridColumn<CfRow>[] = [
      { key: 'status', title: 'Status', width: 120, conditionalFormat: { chips: { A: { tone: 'good', label: 'Approved' } } } },
      { key: 'score', title: 'Score', width: 80, conditionalFormat: { dataBar: { showValue: false } } },
    ];
    const cfRows: CfRow[] = [{ id: 1, status: 'A', score: 12 }];
    const cfRowModel: RowModel<CfRow> = {
      getRow: (i) => cfRows[i],
      getRowCount: () => cfRows.length,
      getSourceIndex: (i) => i,
      getRowKey: (i) => cfRows[i]?.id ?? i,
    };
    const controller = createFindController<CfRow>();
    const args = { enabled: true, rowModel: cfRowModel, columns: cfColumns, caseSensitive: false, onNavigate: vi.fn() };
    // 既定(描く): label にヒットし、データバーの列は探さない。
    controller.update(args);
    controller.open('approved');
    await flush();
    expect(controller.getSnapshot().matches.map((m) => m.colIndex)).toEqual([0]);
    controller.setQuery('12');
    await flush();
    expect(controller.getSnapshot().matches).toEqual([]);
    // 描かない: 画面に出る値の文字を探す。
    controller.update({ ...args, conditionalFormat: false });
    await flush();
    expect(controller.getSnapshot().matches.map((m) => m.colIndex)).toEqual([1]);
    controller.setQuery('approved');
    await flush();
    expect(controller.getSnapshot().matches).toEqual([]);
    controller.setQuery('a');
    await flush();
    expect(controller.getSnapshot().matches.map((m) => m.colIndex)).toEqual([0]);
    controller.dispose();
  });

  it('rowModel の差し替えで再走査し、同じヒットがあればカレントを保つ(移動はしない)。大文字小文字区別も反映', async () => {
    const controller = createFindController<Row>();
    const onNavigate = vi.fn();
    const base = { enabled: true, columns, caseSensitive: false, onNavigate };
    controller.update({ ...base, rowModel: makeRowModel(rows) });
    controller.open('alpha');
    await flush();
    controller.next();
    expect(controller.getSnapshot().currentIndex).toBe(1);
    onNavigate.mockClear();
    // 行 0 を編集(Alpha → Zeta): ヒットは行 1 だけになり、カレントは同じヒット(行 1)を保つ。
    const edited = [{ ...rows[0], name: 'Zeta' }, rows[1], rows[2]];
    controller.update({ ...base, rowModel: makeRowModel(edited) });
    await flush();
    expect(controller.getSnapshot().matches.map((m) => m.rowIndex)).toEqual([1]);
    expect(controller.getSnapshot().currentIndex).toBe(0);
    expect(onNavigate).not.toHaveBeenCalled();
    // 大文字小文字を区別すると 'alpha' は行 1 だけ(Alpha は外れる)。
    controller.update({ ...base, rowModel: makeRowModel(rows), caseSensitive: true });
    await flush();
    expect(controller.getSnapshot().matches.map((m) => m.rowIndex)).toEqual([1]);
    controller.dispose();
  });

  it('enabled=false では開かず、開いている最中に無効化されると閉じる。未ロード行(undefined)は読み飛ばす', async () => {
    const controller = createFindController<Row>();
    const onNavigate = vi.fn();
    controller.update({ enabled: false, rowModel: makeRowModel(rows), columns, caseSensitive: false, onNavigate });
    controller.open('a');
    expect(controller.getSnapshot().open).toBe(false);
    // 未ロード行は「型は T のまま実行時 undefined」の契約(SSRM / グループ行と同じ)。
    const sparse: RowModel<Row> = { ...makeRowModel(rows), getRow: (i) => (i === 1 ? undefined : rows[i]) as Row };
    controller.update({ enabled: true, rowModel: sparse, columns, caseSensitive: false, onNavigate });
    controller.open('a');
    await flush();
    // 'Alpha' / 'gamma' はそれぞれ 2 箇所ヒット(行 1 は読み飛ばし)。
    expect([...new Set(controller.getSnapshot().matches.map((m) => m.rowIndex))]).toEqual([0, 2]);
    controller.update({ enabled: false, rowModel: sparse, columns, caseSensitive: false, onNavigate });
    expect(controller.getSnapshot().open).toBe(false);
    controller.dispose();
  });

  // 追加(onFindChange の連続呼び出し): インラインの rowKeyGetter で再レンダーごとに rowModel が作り直され、
  //   onChange の中で setState(= 再レンダー = update)する利用側でも、結果が変わらなければ通知は 1 回で止まる。
  it('rowModel が作り直されても結果が同じなら onChange を呼ばない(通知 → 再レンダー → 再走査の連鎖が止まる)', async () => {
    const controller = createFindController<Row>();
    const onNavigate = vi.fn();
    let renders = 0;
    const render = () => {
      renders += 1;
      // 利用側の再レンダーのたびに新しい rowModel(中身は同じ)が渡る。
      controller.update({ enabled: true, rowModel: makeRowModel(rows), columns, caseSensitive: false, onNavigate, onChange });
    };
    const onChange = vi.fn(() => {
      if (renders < 50) {
        render();
      }
    });
    render();
    controller.open('alpha');
    await flush();
    await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ query: 'alpha', matchCount: 2, currentIndex: 0, open: true });
    expect(renders).toBe(2);
    // 中身が変われば通知する(next でカレントが動く / close)。
    controller.next();
    expect(onChange).toHaveBeenLastCalledWith({ query: 'alpha', matchCount: 2, currentIndex: 1, open: true });
    controller.close();
    expect(onChange).toHaveBeenLastCalledWith({ query: '', matchCount: 0, currentIndex: null, open: false });
    expect(onChange).toHaveBeenCalledTimes(3);
    controller.dispose();
  });

  // 追加(1.0.1 / 実アプリの総点検 AP-19): rows がよく変わる表で、打った直後の走査が行の変化でやり直しになっても
  //   最初のヒットへ移る(移動を忘れていた)。
  it('打った直後の走査が rowModel の変化でやり直しになっても、最初のヒットへ移る(AP-19)', async () => {
    const controller = createFindController<Row>();
    const onNavigate = vi.fn();
    const base = { enabled: true, columns, caseSensitive: false, onNavigate };
    controller.update({ ...base, rowModel: makeRowModel(rows) });
    controller.open('gamma');
    controller.update({ ...base, rowModel: makeRowModel([...rows, { id: 4, name: 'delta', qty: 1 }]) });
    await flush();
    expect(onNavigate).toHaveBeenCalledWith(2, 0);
    controller.dispose();
  });

  // 追加(1.0.1 / AP-19): 大きな表では行ごとのヒットを控え、行を足したやり直しは足した行だけを読む。やり直しの間も
  //   前の件数を出したまま(「検索中…」へ戻さない)。
  it('大きな表のやり直しは足した行だけを読み、走査の間も前の結果を出したまま(AP-19)', async () => {
    let reads = 0;
    const countingColumns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 120, getValue: (row) => ((reads += 1), row.name) }];
    const many: Row[] = Array.from({ length: 60_000 }, (_, i) => ({ id: i, name: i === 5 ? 'needle' : `r${i}`, qty: i }));
    const controller = createFindController<Row>();
    const base = { enabled: true, columns: countingColumns, caseSensitive: false, onNavigate: vi.fn() };
    controller.update({ ...base, rowModel: makeRowModel(many) });
    controller.open('needle');
    for (let i = 0; i < 200 && controller.getSnapshot().scanning; i += 1) {
      await flush();
    }
    expect(controller.getSnapshot().matches).toHaveLength(1);
    expect(reads).toBe(many.length);
    const appended = [...many, { id: 60_000, name: 'needle too', qty: 0 }];
    // 新しい結果が出た時点で読んだ行の数(足した 1 行だけ)。
    let readsWhenFound: number | null = null;
    const unsubscribe = controller.subscribe(() => {
      if (readsWhenFound === null && controller.getSnapshot().matches.length === 2) readsWhenFound = reads;
    });
    controller.update({ ...base, rowModel: makeRowModel(appended) });
    expect(controller.getSnapshot()).toMatchObject({ scanning: false });
    expect(controller.getSnapshot().matches).toHaveLength(1);
    for (let i = 0; i < 400 && reads < many.length + 1 + appended.length; i += 1) {
      await flush();
    }
    unsubscribe();
    expect(controller.getSnapshot().matches.map((m) => m.rowIndex)).toEqual([5, 60_000]);
    expect(readsWhenFound).toBe(many.length + 1);
    // そのあと控えを使わずに全行を 1 回確かめる(RB-3)。
    expect(reads).toBe(many.length + 1 + appended.length);
    controller.dispose();
  });

  // 1.0.1 のレビュー RB-3: 行のオブジェクトをその場で書き換えて新しい配列を渡すと、控えが古く、古い件数と印のままだった。
  it('大きな表で行をその場で書き換えて新しい配列を渡しても、確かめの走査で正しい結果になる(RB-3)', async () => {
    const many: Row[] = Array.from({ length: 60_000 }, (_, i) => ({ id: i, name: i === 5 ? 'needle' : `r${i}`, qty: i }));
    const controller = createFindController<Row>();
    const base = { enabled: true, columns, caseSensitive: false, onNavigate: vi.fn() };
    controller.update({ ...base, rowModel: makeRowModel(many) });
    controller.open('needle');
    for (let i = 0; i < 200 && controller.getSnapshot().scanning; i += 1) {
      await flush();
    }
    expect(controller.getSnapshot().matches.map((m) => m.rowIndex)).toEqual([5]);
    many[5].name = 'r5';
    many[7].name = 'needle';
    controller.update({ ...base, rowModel: makeRowModel([...many]) });
    for (let i = 0; i < 400 && controller.getSnapshot().matches[0]?.rowIndex !== 7; i += 1) {
      await flush();
    }
    expect(controller.getSnapshot().matches.map((m) => m.rowIndex)).toEqual([7]);
    controller.dispose();
  });
});