// 追加(1.1.0 / AP-14): 外からの更新を挟んだ「元に戻す」(revertRowsChange)の単体テストです。
import { describe, it, expect } from 'vitest';
import { revertRowsChange } from './historyRebase';

type Row = { id: number; price: number; memo: string; extra?: string };
const byId = (row: Row) => row.id;
const r = (id: number, price: number, memo = '', extra?: string): Row =>
  extra === undefined ? { id, price, memo } : { id, price, memo, extra };

describe('revertRowsChange', () => {
  it('外の更新が無ければ(current === after)編集の前の配列をそのまま返す', () => {
    const before = [r(1, 10)];
    const after = [r(1, 10, 'x')];
    expect(revertRowsChange(before, after, after, byId)).toBe(before);
  });

  it('編集した項目だけを戻し、外が書いた項目(別の項目・後から同じ項目)は外の値のまま', () => {
    const before = [r(1, 10, ''), r(2, 20, ''), r(3, 30, '')];
    // 編集: 1 の memo と 3 の price。
    const after = [r(1, 10, 'A'), before[1] as Row, r(3, 31, '')];
    // 外: 1 と 2 の price、3 の price を上書き。
    const current = [r(1, 11, 'A'), r(2, 21, ''), r(3, 35, '')];
    expect(revertRowsChange(before, after, current, byId)).toEqual([r(1, 11, ''), r(2, 21, ''), r(3, 35, '')]);
  });

  it('外が触っていない行は編集の前の行(参照)へ、編集で足した項目は消す', () => {
    const before = [r(1, 10), r(2, 20)];
    const after = [r(1, 10, '', 'new'), before[1] as Row];
    const current = [after[0] as Row, r(2, 22)];
    const result = revertRowsChange(before, after, current, byId);
    expect(result[0]).toBe(before[0]);
    expect(result[1]).toBe(current[1]);
    const after2 = [r(1, 10, ''), before[1] as Row];
    const before2 = [r(1, 10, '', 'old'), before[1] as Row];
    const current2 = [r(1, 15, ''), before[1] as Row];
    expect(revertRowsChange(before2, after2, current2, byId)[0]).toEqual({ id: 1, price: 15, memo: '', extra: 'old' });
  });

  it('編集で足した行は除き、編集で消した行は前の位置へ戻す(外で足した行 / 消した行はそのまま)', () => {
    const before = [r(1, 10), r(2, 20), r(3, 30), r(4, 40)];
    // 編集: 2 と 3 を消し、5 を末尾へ足す。
    const after = [before[0] as Row, before[3] as Row, r(5, 50)];
    // 外: 4 を消し、6 を先頭へ足し、1 の price を変える。
    const current = [r(6, 60), r(1, 11), after[2] as Row];
    expect(revertRowsChange(before, after, current, byId).map((row) => [row.id, row.price])).toEqual([
      [6, 60],
      [1, 11],
      [2, 20],
      [3, 30],
    ]);
  });

  it('先頭の行を消した編集は先頭へ戻す', () => {
    const before = [r(1, 10), r(2, 20)];
    const after = [before[1] as Row];
    const current = [r(2, 21)];
    expect(revertRowsChange(before, after, current, byId).map((row) => row.id)).toEqual([1, 2]);
  });

  it('並べ替えた編集(行ドラッグ)は前の並びへ戻し、外で足した行は今の並びの直前の行の後ろ', () => {
    const before = [r(1, 10), r(2, 20), r(3, 30)];
    const after = [before[2] as Row, before[0] as Row, before[1] as Row];
    const current = [r(3, 33), r(7, 70), r(1, 10), r(2, 20)];
    expect(revertRowsChange(before, after, current, byId).map((row) => [row.id, row.price])).toEqual([
      [1, 10],
      [2, 20],
      [3, 33],
      [7, 70],
    ]);
  });

  it('外が並べ替えても、並びを変えない編集は今の並びのまま', () => {
    const before = [r(1, 10), r(2, 20)];
    const after = [r(1, 10, 'A'), before[1] as Row];
    const current = [before[1] as Row, after[0] as Row];
    expect(revertRowsChange(before, after, current, byId).map((row) => [row.id, row.memo])).toEqual([
      [2, ''],
      [1, ''],
    ]);
  });

  it('何も戻すものが無ければ current をそのまま返す', () => {
    const before = [r(1, 10, '')];
    const after = [r(1, 10, 'A')];
    const current = [r(1, 10, 'B')];
    expect(revertRowsChange(before, after, current, byId)).toBe(current);
  });

  it('キーが無い表は位置で対応づける', () => {
    const before = [r(1, 10), r(2, 20)];
    const after = [r(1, 10, 'A'), before[1] as Row];
    const current = [r(1, 12, 'A'), r(2, 22)];
    expect(revertRowsChange(before, after, current, (_row, index) => index)).toEqual([r(1, 12, ''), r(2, 22)]);
  });

  // 追加(1.1.0 / AP-14 の見直し)
  it('行キーが重なっていると対応づけられないので、編集の前の配列をそのまま返す', () => {
    const before = [r(1, 10), r(0, 20), r(0, 30)];
    const after = [r(1, 10, 'A'), before[1] as Row, before[2] as Row];
    const current = [r(1, 11, 'A'), r(0, 21), r(0, 31)];
    expect(revertRowsChange(before, after, current, byId)).toBe(before);
  });
});