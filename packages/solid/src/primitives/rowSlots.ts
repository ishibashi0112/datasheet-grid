// 追加(1.5.0 / 速さの案 B): 本体の描く行へ「枠」(行の要素を表す For のキー)を割り当てます。
//   これまでは行のキーそのものを For のキーにしていたので、遠くへスクロールすると見えている行の要素とセルの部品を
//   すべて捨てて作り直していました(列の多い表の遠くへの移動で、JS の時間が React 版の約 2 倍)。
//   - 前にもあった行(同じキー)は前と同じ枠のまま(並べ替えで行が動いても同じ要素 = animateRows の transition が効く)。
//   - 行の並び(行モデル)が前と同じとき = スクロールなどで描く範囲だけが変わったときは、範囲から出た行の枠を、新しく
//     入ってきた行に使い回します(要素とセルの部品はそのまま、中身の値だけを書き換える)。空いた枠は前の並びの順に
//     使うので、遠くへ飛んでも要素の並べ替え(DOM の移動)は起きません。
//   - 行の並びが変わったとき(並べ替え・絞り込み・行の追加 / 削除・データの到着)は使い回さず、入ってきた行には新しい
//     枠を作ります(React 版と同じく、別の行の要素が別の行に替わらない)。
//   - 使い回すのはデータ行どうしと読み込み中の行(serverSide)どうしだけ。グループ行とラベル行は軽いので使い回さず、行の
//     キーをそのまま枠にします(1.4 までと同じ)。
//   ここは描く行の配列(1 ペインの数十行)だけを見る純粋な関数で、DOM には触りません。

export type RowSlotKind = 'data' | 'skeleton' | 'keyed';
export type RowSlotItem = { readonly key: string };
export type SlottedRow<R extends RowSlotItem> = R & { readonly slot: string };
export type RowSlotState<R extends RowSlotItem> = {
  readonly items: readonly SlottedRow<R>[];
  // 次に作る枠の番号(枠の名前は種類の 1 文字 + 番号。番号は種類をまたいで増やす)。
  readonly next: number;
};

const PREFIX: Record<RowSlotKind, string> = { data: 'r', skeleton: 's', keyed: 'k' };

export const assignRowSlots = <R extends RowSlotItem>(
  prev: RowSlotState<R> | undefined,
  rows: readonly R[],
  kindOf: (row: R) => RowSlotKind,
  reuseFreedSlots: boolean,
): RowSlotState<R> => {
  const slotByKey = new Map<string, string>();
  if (prev) {
    for (const item of prev.items) {
      slotByKey.set(item.key, item.slot);
    }
  }
  const used = new Set<string>();
  const items: SlottedRow<R>[] = new Array<SlottedRow<R>>(rows.length);
  const unassigned: number[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const kind = kindOf(row);
    if (kind === 'keyed') {
      const slot = `${PREFIX.keyed}${row.key}`;
      items[index] = { ...row, slot };
      used.add(slot);
      continue;
    }
    const slot = slotByKey.get(row.key);
    if (slot !== undefined && slot[0] === PREFIX[kind] && !used.has(slot)) {
      items[index] = { ...row, slot };
      used.add(slot);
    } else {
      unassigned.push(index);
    }
  }
  // 範囲から出た行の枠(前の並びの順)。
  const freed: Record<string, string[]> = { [PREFIX.data]: [], [PREFIX.skeleton]: [] };
  if (reuseFreedSlots && prev) {
    for (const item of prev.items) {
      if (!used.has(item.slot)) {
        freed[item.slot[0]!]?.push(item.slot);
      }
    }
  }
  const taken: Record<string, number> = { [PREFIX.data]: 0, [PREFIX.skeleton]: 0 };
  let next = prev?.next ?? 0;
  for (const index of unassigned) {
    const row = rows[index]!;
    const prefix = PREFIX[kindOf(row)];
    const position = taken[prefix]!;
    let slot = freed[prefix]![position];
    if (slot === undefined) {
      slot = `${prefix}${next}`;
      next += 1;
    } else {
      taken[prefix] = position + 1;
    }
    items[index] = { ...row, slot };
  }
  return { items, next };
};