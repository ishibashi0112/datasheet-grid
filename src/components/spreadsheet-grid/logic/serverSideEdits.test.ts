// serverSideEdits(SSRM 書き戻しの純ロジック)のテストです。
//   - createServerSidePendingEdits: 楽観オーバーレイの登録 / 世代(writeId)ガード / settle / clear。
//   - buildServerSideRowUpdates: セル編集の行単位集約(初出順・未ロードスキップ・changes 連鎖)。
import { describe, it, expect } from 'vitest';
import {
  buildServerSideRowUpdates,
  createServerSidePendingEdits,
  type ServerSideCellEditInput,
} from './serverSideEdits';
import type { GridColumn } from '../model/gridTypes';

type Row = { id: number; name: string; price: number };

const nameColumn: GridColumn<Row> = { key: 'name', width: 100 };
const priceColumn: GridColumn<Row> = { key: 'price', width: 100 };

const makeRow = (id: number): Row => ({ id, name: `row-${id}`, price: id * 10 });

describe('createServerSidePendingEdits', () => {
  it('beginWrite で楽観行が getRow から引ける / 無ければ undefined', () => {
    const pending = createServerSidePendingEdits<Row>();
    expect(pending.getRow(5)).toBeUndefined();
    pending.beginWrite(5, { id: 5, name: 'edited', price: 50 });
    expect(pending.getRow(5)).toEqual({ id: 5, name: 'edited', price: 50 });
    expect(pending.pendingCount()).toBe(1);
  });

  it('settleWrite は最新 writeId のときだけ overlay を外す(世代ガード)', () => {
    const pending = createServerSidePendingEdits<Row>();
    const write1 = pending.beginWrite(5, { id: 5, name: 'v1', price: 0 });
    // 同一行へ 2 回目の編集(write1 は in-flight のまま)。
    const write2 = pending.beginWrite(5, { id: 5, name: 'v2', price: 0 });
    expect(pending.isLatestWrite(5, write1)).toBe(false);
    expect(pending.isLatestWrite(5, write2)).toBe(true);

    // 古い write1 の決着(遅延到着)は新しい楽観値 v2 を巻き戻さない。
    pending.settleWrite(5, write1);
    expect(pending.getRow(5)).toEqual({ id: 5, name: 'v2', price: 0 });

    // 最新 write2 の決着で overlay が外れる。
    pending.settleWrite(5, write2);
    expect(pending.getRow(5)).toBeUndefined();
    expect(pending.pendingCount()).toBe(0);
  });

  it('writeId は行をまたいで単調増加し、行ごとに独立して決着できる', () => {
    const pending = createServerSidePendingEdits<Row>();
    const writeA = pending.beginWrite(1, makeRow(1));
    const writeB = pending.beginWrite(2, makeRow(2));
    expect(writeB).toBeGreaterThan(writeA);
    pending.settleWrite(1, writeA);
    expect(pending.getRow(1)).toBeUndefined();
    expect(pending.getRow(2)).toEqual(makeRow(2));
  });

  it('clear で全 pending を破棄する', () => {
    const pending = createServerSidePendingEdits<Row>();
    pending.beginWrite(1, makeRow(1));
    pending.beginWrite(2, makeRow(2));
    pending.clear();
    expect(pending.pendingCount()).toBe(0);
    expect(pending.getRow(1)).toBeUndefined();
  });

  it('clear 後の古い settleWrite は no-op(新しい beginWrite を壊さない)', () => {
    const pending = createServerSidePendingEdits<Row>();
    const stale = pending.beginWrite(1, { id: 1, name: 'old', price: 0 });
    pending.clear();
    const fresh = pending.beginWrite(1, { id: 1, name: 'new', price: 0 });
    // writeId はインスタンス内で再利用されないため、stale の決着は fresh を外せない。
    pending.settleWrite(1, stale);
    expect(pending.getRow(1)).toEqual({ id: 1, name: 'new', price: 0 });
    pending.settleWrite(1, fresh);
    expect(pending.getRow(1)).toBeUndefined();
  });
});

describe('buildServerSideRowUpdates', () => {
  const rows = new Map<number, Row>([
    [0, makeRow(0)],
    [1, makeRow(1)],
    [2, makeRow(2)],
  ]);
  const getBaseRow = (viewIndex: number): Row | undefined => rows.get(viewIndex);
  const getRowKey = (row: Row): number => row.id;

  it('単一セル編集を 1 件の行更新へ変換する', () => {
    const edits: ServerSideCellEditInput<Row>[] = [
      { viewIndex: 1, column: nameColumn, value: 'edited' },
    ];
    const updates = buildServerSideRowUpdates(edits, getBaseRow, getRowKey);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      rowKey: 1,
      rowIndex: 1,
      row: { id: 1, name: 'edited', price: 10 },
      previousRow: makeRow(1),
      changes: [{ columnKey: 'name', previousValue: 'row-1', newValue: 'edited' }],
    });
  });

  it('同一行の複数セル編集を 1 エントリへ集約する(changes は 1 セル 1 件)', () => {
    const edits: ServerSideCellEditInput<Row>[] = [
      { viewIndex: 1, column: nameColumn, value: 'edited' },
      { viewIndex: 1, column: priceColumn, value: 999 },
    ];
    const updates = buildServerSideRowUpdates(edits, getBaseRow, getRowKey);
    expect(updates).toHaveLength(1);
    expect(updates[0].row).toEqual({ id: 1, name: 'edited', price: 999 });
    expect(updates[0].previousRow).toEqual(makeRow(1));
    expect(updates[0].changes).toEqual([
      { columnKey: 'name', previousValue: 'row-1', newValue: 'edited' },
      { columnKey: 'price', previousValue: 10, newValue: 999 },
    ]);
  });

  it('複数行は初出順で並ぶ', () => {
    const edits: ServerSideCellEditInput<Row>[] = [
      { viewIndex: 2, column: nameColumn, value: 'c' },
      { viewIndex: 0, column: nameColumn, value: 'a' },
      { viewIndex: 2, column: priceColumn, value: 1 },
    ];
    const updates = buildServerSideRowUpdates(edits, getBaseRow, getRowKey);
    expect(updates.map((update) => update.rowIndex)).toEqual([2, 0]);
  });

  it('未ロード行(base 不在)はスキップする', () => {
    const edits: ServerSideCellEditInput<Row>[] = [
      { viewIndex: 99, column: nameColumn, value: 'x' },
      { viewIndex: 1, column: nameColumn, value: 'edited' },
    ];
    const updates = buildServerSideRowUpdates(edits, getBaseRow, getRowKey);
    expect(updates).toHaveLength(1);
    expect(updates[0].rowIndex).toBe(1);
  });

  it('同一セルの重複編集は previousValue が連鎖する', () => {
    const edits: ServerSideCellEditInput<Row>[] = [
      { viewIndex: 1, column: nameColumn, value: 'first' },
      { viewIndex: 1, column: nameColumn, value: 'second' },
    ];
    const updates = buildServerSideRowUpdates(edits, getBaseRow, getRowKey);
    expect(updates[0].changes).toEqual([
      { columnKey: 'name', previousValue: 'row-1', newValue: 'first' },
      { columnKey: 'name', previousValue: 'first', newValue: 'second' },
    ]);
    expect(updates[0].row.name).toBe('second');
  });

  it('base 行を破壊しない(setCellValue の shallow copy)', () => {
    const base = makeRow(1);
    const edits: ServerSideCellEditInput<Row>[] = [
      { viewIndex: 1, column: nameColumn, value: 'edited' },
    ];
    const updates = buildServerSideRowUpdates(edits, () => base, getRowKey);
    expect(base.name).toBe('row-1');
    expect(updates[0].previousRow).toBe(base);
    expect(updates[0].row).not.toBe(base);
  });
});