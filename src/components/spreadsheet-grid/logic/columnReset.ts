// 追加(13-B2-5): 列リセット(パネルフッター「すべての列を初期状態に戻す」/ 列メニュー
//   「列のリセット」)の再構成純ロジックです。SpreadsheetGrid の handleColumnChooserReset
//   から呼びます。
// 設計メモ:
//   - 13-B2-2 のリセットは幅 / 固定 / 表示のみを初期値へ戻し、並び順は現在の配列順のまま
//     でした。ヘッダー D&D / チューザー並べ替え(applyColumnOrderAndPin)は columns 配列の
//     順序を恒久的に書き換えるため、「左固定 → 中央へ移動 → リセット」で pinned は戻るのに
//     ペイン内の相対順が初期と逆転する、という不完全復元が起きていました。本モジュールは
//     並び順まで含めた完全復元を行います。
//   - 初期順はスナップショット Map の挿入順(= 初回マウント時の columns 順)から得ます。
//     復元順は consumer 宣言の初期配列と 1:1 で一致させ、pane 連結正規化は初期マウントと
//     同じく描画側の reorderColumnsByPane に委ねます(初期状態の完全再現を優先)。
//   - スナップショット外の列(マウント後追加 = createOverflowColumn)はリセット対象外で、
//     現在の相対順のまま末尾へ置きます(applyColumnState の「新規列は末尾」方針と同型)。
//     幅は解決済み幅を defs へ書き戻して保全します(commit 時の sync effect による消失防止)。
//   - 返り値 null = no-op(初期列の幅 / 固定 / 表示 / 並び順すべて差分なし)。overflow 列の
//     幅書き戻しだけが必要なケースは従来どおり no-op です(リセット対象外のため)。
import type { GridColumn, GridColumnPinned } from '../model/gridTypes';

// 追加(13-B2-5): 初回マウント時に退避する per-column の初期状態です。Map の挿入順が
//   初期の列順を兼ねます(SpreadsheetGrid の initialColumnStateRef が保持)。
export type InitialColumnState = {
  width: number;
  pinned: GridColumnPinned | undefined;
  visible: boolean | undefined;
};

// 追加(13-B2-5): リセット後の columns 配列を組み立てます。差分がなければ null(no-op)。
export const buildResetColumns = <T,>(
  columns: GridColumn<T>[],
  snapshot: Map<string, InitialColumnState>,
  resolvedWidths: Record<string, number>,
): GridColumn<T>[] | null => {
  let changed = false;

  // ① 各列の属性(幅 / 固定 / 表示)を初期値へ戻します(並び順はまだ現在のまま)。
  const restored = columns.map((column) => {
    const resolvedWidth = resolvedWidths[column.key] ?? column.width;
    const initial = snapshot.get(column.key);

    if (!initial) {
      // マウント後に追加された列はリセット対象外。解決済み幅だけ defs へ書き戻して
      // 保全します(commit される場合の sync effect による消失を防止)。
      return resolvedWidth === column.width
        ? column
        : { ...column, width: resolvedWidth };
    }

    const initialPinned = initial.pinned ?? undefined;
    const widthDiff = resolvedWidth !== initial.width;
    const pinnedDiff = (column.pinned ?? undefined) !== initialPinned;
    const visibleDiff =
      (column.visible !== false) !== (initial.visible !== false);

    if (widthDiff || pinnedDiff || visibleDiff) {
      changed = true;
    }

    // 注記: 初期幅を column.width にセットするのが重要です。これにより commit 後の
    //       sync effect が columnWidths を初期幅で上書きし、live 幅が破棄されます。
    //       差分なしの列も同じ正規化を行い、column.width と初期幅の不整合
    //       (過去の書き戻しで def 幅がずれているケース)による幅ジャンプを防ぎます。
    return {
      ...column,
      width: initial.width,
      pinned: initial.pinned,
      visible: initial.visible,
    };
  });

  // ② 並び順を初期順へ戻します。スナップショット挿入順 = 初期順を正とし、現在の
  //    columns に存在する初期列をその順で先頭へ、スナップショット外の列を現在の
  //    相対順のまま末尾へ連結します(初期スナップショットに在って現 columns に無い
  //    key = 削除列は自然にスキップされます)。
  const byKey = new Map(restored.map((column) => [column.key, column]));
  const initialOrdered: GridColumn<T>[] = [];
  for (const key of snapshot.keys()) {
    const column = byKey.get(key);
    if (column) {
      initialOrdered.push(column);
    }
  }
  const extras = restored.filter((column) => !snapshot.has(column.key));
  const nextColumns = [...initialOrdered, ...extras];

  // ③ 並び順の差分検出です。属性差分(changed)がなくても順序が違えば commit します
  //    (nextColumns と columns は同一集合の permutation のため長さは常に一致します)。
  const orderChanged = nextColumns.some(
    (column, index) => columns[index].key !== column.key,
  );

  if (!changed && !orderChanged) {
    return null;
  }
  return nextColumns;
};