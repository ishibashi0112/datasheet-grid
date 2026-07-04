// 追加(SF-ENTER)のテスト: set フィルター検索の一致関数と Enter 確定の振る舞い判定です。
//   Enter 確定(Excel の検索 → OK 相当)は「既存選択を捨てて一致値のみへ置換」する操作で、
//   積み増しは従来どおり(検索結果をすべて選択)チェックの役割です(役割分担)。
//   コンポーネント側(SetFilterBody)はこの純関数の結果に従って onReplaceSelection /
//   onRequestClose を呼ぶだけなので、判定ロジックはここで網羅します。
import { describe, it, expect } from 'vitest';

import {
  filterSetOptionsBySearch,
  resolveSetFilterEnterAction,
} from './setFilterSearch';
import type { SetFilterSearchOption } from './setFilterSearch';

// label と value が異なる候補(filterOptions 指定列)と小文字 label を混ぜたデータです。
const options: SetFilterSearchOption[] = [
  { label: 'A-1019', value: 'A-1019' },
  { label: 'A-1119', value: 'A-1119' },
  { label: 'B-2000', value: 'B-2000' },
  { label: 'b-3000', value: 'B-3000-v' },
];

describe('filterSetOptionsBySearch(SF-ENTER)', () => {
  it('空(空白のみ含む)検索は全候補をそのまま返す(同一参照 = memo に優しい)', () => {
    expect(filterSetOptionsBySearch(options, '')).toBe(options);
    expect(filterSetOptionsBySearch(options, '   ')).toBe(options);
  });

  it('label の部分一致で絞り込む(前後空白は無視)', () => {
    const result = filterSetOptionsBySearch(options, ' 11 ');
    expect(result.map((option) => option.value)).toEqual(['A-1119']);
  });

  it('大文字小文字を無視して一致する', () => {
    const result = filterSetOptionsBySearch(options, 'B-');
    expect(result.map((option) => option.value)).toEqual([
      'B-2000',
      'B-3000-v',
    ]);
  });
});

describe('resolveSetFilterEnterAction(SF-ENTER)', () => {
  it('空検索は close(即時適用済みの現状を確定して閉じるだけ)', () => {
    expect(resolveSetFilterEnterAction(options, '  ')).toEqual({
      kind: 'close',
    });
  });

  it('一致 0 件は none(include{} での全行消滅を防ぐ。Excel も OK を無効化する)', () => {
    expect(resolveSetFilterEnterAction(options, 'zzz')).toEqual({
      kind: 'none',
    });
  });

  it('一致ありは replace(一致値のみへ置換)', () => {
    expect(resolveSetFilterEnterAction(options, '11')).toEqual({
      kind: 'replace',
      values: ['A-1119'],
    });
  });

  it('一致は label 基準・返すのは value(label≠value の列でも正しく置換できる)', () => {
    expect(resolveSetFilterEnterAction(options, 'b-3000')).toEqual({
      kind: 'replace',
      values: ['B-3000-v'],
    });
  });

  it('全候補一致は全値の replace(clear への正規化は commit 側の責務)', () => {
    expect(resolveSetFilterEnterAction(options, '-')).toEqual({
      kind: 'replace',
      values: ['A-1019', 'A-1119', 'B-2000', 'B-3000-v'],
    });
  });
});