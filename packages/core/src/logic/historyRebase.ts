// 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-14): 外からの更新(applyRows(next, { undoable: false }))を挟んだ「元に戻す」。
//
// 背景: 株価のように外から絶えず rows が変わる表では、rows を作り直すと元に戻すの履歴が消え、applyRows で渡すと
//   更新の 1 つずつが履歴に積まれて Ctrl+Z が株価を巻き戻していました。undoable: false の更新は履歴を消さず積みもせず、
//   元に戻すときに「その編集(before → after)だけ」を今の rows(current)から取り消します。
//
// 取り消し方(行は行キーで対応づける。キーの無い表は位置):
//   - 編集で変わった行: 編集で変わった項目のうち、今も編集の後の値のままの項目だけを編集の前の値へ戻す(外の更新が
//     後から書いた項目は外の値のまま)。行の参照が編集の後のままなら編集の前の行をそのまま使う。
//   - 編集で足した行は除き、編集で消した行は編集の前の位置(直前の行の後ろ)へ戻す。外で足した行 / 消した行はそのまま。
//   - 並び: 編集が並びを変えていなければ今の並び、変えていれば(行ドラッグなど)編集の前の並び(外で足した行は今の
//     並びで直前にある行の後ろ)。
//   何も変わらないときは current をそのまま返す。

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null;

const hasOwn = (value: Fields, key: string) => Object.prototype.hasOwnProperty.call(value, key);

// 1 行の取り消し(before の行 b → after の行 a の編集を、今の行 c から取り消す)。
const revertRow = <T,>(b: T, a: T, c: T): T => {
  if (c === a) {
    return b;
  }
  if (!isFields(b) || !isFields(a) || !isFields(c)) {
    return c;
  }
  let next: Fields | null = null;
  for (const field of new Set([...Object.keys(b), ...Object.keys(a)])) {
    const inAfter = hasOwn(a, field);
    // 編集で変わっていない項目と、外の更新が後から書いた項目(外の値のまま)は飛ばす。
    if (
      (hasOwn(b, field) === inAfter && Object.is(b[field], a[field])) ||
      hasOwn(c, field) !== inAfter ||
      !Object.is(c[field], a[field])
    ) {
      continue;
    }
    next ??= (Array.isArray(c) ? c.slice() : { ...c }) as Fields;
    if (hasOwn(b, field)) {
      next[field] = b[field];
    } else {
      delete next[field];
    }
  }
  return (next ?? c) as T;
};

const START = Symbol('start');

/**
 * 編集(`before` → `after`)を、外の更新を挟んだ今の行(`current`)から取り消した行を返す。
 * `current === after`(外の更新が無い)なら `before` をそのまま返す。
 */
export function revertRowsChange<T>(
  before: T[],
  after: readonly T[],
  current: T[],
  getKey: (row: T, index: number) => unknown,
): T[] {
  if (current === after) {
    return before;
  }
  const keyRows = (rows: readonly T[]) => {
    const map = new Map<unknown, T>();
    rows.forEach((row, index) => map.set(getKey(row, index), row));
    return map;
  };
  const b = keyRows(before);
  const a = keyRows(after);
  const c = keyRows(current);
  const bKeys = [...b.keys()];
  const cKeys = [...c.keys()];
  // 編集で足した行(after にあって before に無い)は除き、編集で消した行(before にあって after に無い)は今も無ければ戻す。
  const deletedByEdit = (key: unknown) => b.has(key) && !a.has(key) && !c.has(key);
  // 編集が並びを変えたか(before と after の両方にある行の順番を比べる)。
  const common = bKeys.filter((key) => a.has(key));
  const reordered = [...a.keys()].filter((key) => b.has(key)).some((key, index) => !Object.is(common[index], key));
  // 並べ替えていなければ今の並びに、編集で消した行を before で直前にあった行の後ろへ。並べ替えていれば before の並びに、
  //   外で足した行(before にも after にも無い)を今の並びで直前にある行の後ろへ。
  const [primary, secondary] = reordered ? [bKeys, cKeys] : [cKeys, bKeys];
  const keep = reordered
    ? (key: unknown) => b.has(key) && (c.has(key) || deletedByEdit(key))
    : (key: unknown) => c.has(key) && !(a.has(key) && !b.has(key));
  const extra = reordered ? (key: unknown) => !b.has(key) && !a.has(key) : deletedByEdit;
  const anchored = new Map<unknown, unknown[]>();
  let anchor: unknown = START;
  for (const key of secondary) {
    if (extra(key)) {
      const list = anchored.get(anchor);
      if (list) {
        list.push(key);
      } else {
        anchored.set(anchor, [key]);
      }
    } else if (keep(key)) {
      anchor = key;
    }
  }
  const result: T[] = [];
  const emit = (key: unknown) => {
    if (key !== START) {
      const row = c.get(key);
      const beforeRow = b.get(key);
      const afterRow = a.get(key);
      result.push(
        !c.has(key)
          ? (beforeRow as T)
          : b.has(key) && a.has(key)
            ? revertRow(beforeRow as T, afterRow as T, row as T)
            : (row as T),
      );
    }
    // 足す行(extra)は直前の行(anchor)にはならないので、入れ子は 1 段だけ。
    for (const extraKey of anchored.get(key) ?? []) {
      emit(extraKey);
    }
  };
  emit(START);
  for (const key of primary) {
    if (keep(key)) {
      emit(key);
    }
  }
  return result.length === current.length && result.every((row, index) => row === current[index]) ? current : result;
}