// 追加(13-B2-5)の単体テスト: buildResetColumns(列リセットの再構成)の仕様固定です。
//   - 幅 / 固定 / 表示の初期値復元(13-B2-2 からの継承挙動)。
//   - 並び順の初期順復元(13-B2-5 の本体)。「左固定 → 中央へ移動 → リセット」で
//     ペイン内相対順が初期と逆転していた不完全復元の回帰テストを含みます。
//   - スナップショット外の列(マウント後追加)は末尾・相対順維持・幅書き戻し保全。
//   - no-op(null)判定: 全差分なし / overflow 幅書き戻しのみのケース。
import { describe, it, expect } from 'vitest';
import { buildResetColumns } from './columnReset';
import type { InitialColumnState } from './columnReset';
import type { GridColumn } from '../model/gridTypes';

type Row = { id: number };

const col = (
  key: string,
  extra: Partial<GridColumn<Row>> = {},
): GridColumn<Row> => ({
  key,
  width: 100,
  ...extra,
});

// 初期 columns 配列からスナップショット(Map 挿入順 = 初期順)を作ります
// (SpreadsheetGrid の initialColumnStateRef 構築と同型)。
const makeSnapshot = (
  initial: GridColumn<Row>[],
): Map<string, InitialColumnState> =>
  new Map(
    initial.map((column) => [
      column.key,
      {
        width: column.width,
        pinned: column.pinned,
        visible: column.visible,
      },
    ]),
  );

describe('buildResetColumns(列リセット再構成 13-B2-5)', () => {
  it('幅 / 固定 / 表示を初期値へ戻す(手動リサイズの live 幅は破棄)', () => {
    const initial = [col('a', { pinned: 'left' }), col('b'), col('c')];
    const snapshot = makeSnapshot(initial);
    // a: pin 解除 + def 幅ずれ / b: 非表示 / c: 手動リサイズ(live 幅 240)
    const current = [
      col('a', { width: 150 }),
      col('b', { visible: false }),
      col('c'),
    ];

    const result = buildResetColumns(current, snapshot, { c: 240 });

    expect(result).not.toBeNull();
    expect(result!.map((column) => column.key)).toEqual(['a', 'b', 'c']);
    expect(result![0].pinned).toBe('left');
    expect(result![0].width).toBe(100);
    expect(result![1].visible).toBeUndefined();
    expect(result![2].width).toBe(100); // live 幅 240 は破棄され初期幅へ
  });

  it('並び順を初期順へ戻す(左固定 → 中央移動 → リセットの回帰: ペイン内逆転を修正)', () => {
    // 初期: [品番(left), 品名(left), 単価]。品番を中央へ D&D すると
    // applyColumnOrderAndPin の pane 正規化で配列は [品名(left), 単価, 品番] になる。
    const initial = [
      col('品番', { pinned: 'left' }),
      col('品名', { pinned: 'left' }),
      col('単価'),
    ];
    const snapshot = makeSnapshot(initial);
    const current = [
      col('品名', { pinned: 'left' }),
      col('単価'),
      col('品番'), // pin 解除済み
    ];

    const result = buildResetColumns(current, snapshot, {});

    expect(result).not.toBeNull();
    // 旧実装は属性のみ復元で ['品名', '単価', '品番'] の順のまま
    // → 左ペインが [品名, 品番] と初期の逆になっていた。
    expect(result!.map((column) => column.key)).toEqual([
      '品番',
      '品名',
      '単価',
    ]);
    expect(result![0].pinned).toBe('left');
    expect(result![1].pinned).toBe('left');
    expect(result![2].pinned).toBeUndefined();
  });

  it('属性が全一致でも並び順が違えば commit する(順序のみの差分)', () => {
    const initial = [col('a'), col('b'), col('c')];
    const snapshot = makeSnapshot(initial);
    const current = [col('b'), col('a'), col('c')];

    const result = buildResetColumns(current, snapshot, {});

    expect(result).not.toBeNull();
    expect(result!.map((column) => column.key)).toEqual(['a', 'b', 'c']);
  });

  it('スナップショット外の列は末尾へ相対順維持で置き、live 幅を defs へ書き戻す', () => {
    const initial = [col('a'), col('b')];
    const snapshot = makeSnapshot(initial);
    // マウント後追加の x, y(overflow 列)。y は手動リサイズ済み(live 200)。
    const current = [
      col('x'),
      col('a', { width: 150 }),
      col('y'),
      col('b'),
    ];

    const result = buildResetColumns(current, snapshot, { y: 200 });

    expect(result).not.toBeNull();
    expect(result!.map((column) => column.key)).toEqual(['a', 'b', 'x', 'y']);
    expect(result![0].width).toBe(100); // 初期列は初期幅へ
    expect(result![3].width).toBe(200); // overflow 列は live 幅を書き戻して保全
  });

  it('スナップショットに在って現 columns に無い列(削除列)はスキップする', () => {
    const initial = [col('a'), col('gone'), col('b')];
    const snapshot = makeSnapshot(initial);
    const current = [col('b', { width: 130 }), col('a')];

    const result = buildResetColumns(current, snapshot, {});

    expect(result).not.toBeNull();
    expect(result!.map((column) => column.key)).toEqual(['a', 'b']);
    expect(result![1].width).toBe(100);
  });

  it('幅 / 固定 / 表示 / 並び順すべて初期状態なら null(no-op)', () => {
    const initial = [col('a', { pinned: 'left' }), col('b')];
    const snapshot = makeSnapshot(initial);
    const current = [col('a', { pinned: 'left' }), col('b')];

    expect(buildResetColumns(current, snapshot, {})).toBeNull();
    // live 幅が def と同値のエントリがあっても no-op のまま。
    expect(buildResetColumns(current, snapshot, { a: 100 })).toBeNull();
  });

  it('overflow 列の幅書き戻しだけが必要なケースは no-op(リセット対象外のため)', () => {
    const initial = [col('a')];
    const snapshot = makeSnapshot(initial);
    const current = [col('a'), col('x')];

    // x(スナップショット外)だけ live 幅 180。初期列 a と並び順に差分なし。
    expect(buildResetColumns(current, snapshot, { x: 180 })).toBeNull();
  });
});