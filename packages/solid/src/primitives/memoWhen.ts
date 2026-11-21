// 追加(速さの段階 3-2b): 機能を使う列のセルだけ memo を作ります。100 万行で遠くへスクロールすると見えているセルを毎回作り直す
//   ので、セルごとの memo の数がそのまま手間になります(本番ビルドで React 版の約 1.5 倍かかっていた。memo を作って依存をつなぎ、
//   捨てるときに外す手間と GC)。
//   - 作るときに needed() が真なら、今までどおり memo。
//   - 偽なら memo を作らず、読むたびに needed() を見ます。偽のあいだは empty を返し、初めて真を読んだときに、作ったときの
//     owner(セル)の下で memo を作り、以後はその memo を読みます(同じセルで何度も読んでも計算は 1 回。利用側の validate /
//     cellNote / cellClassName を読むたびに呼ばない)。セルが捨てられた後に読まれたときは memo を作らずその場で計算します。
//   memo の中でも needed() を見るので、memo を作った後に偽になれば empty(compute が needed() を見直さなくてよい)。
import { createMemo, getOwner, isDisposed, runWithOwner, untrack } from 'solid-js';

export function createMemoWhen<V>(needed: () => boolean, compute: () => V, empty: V): () => V {
  const guarded = () => (needed() ? compute() : empty);
  if (untrack(needed)) {
    return createMemo(guarded);
  }
  const owner = getOwner();
  let memo: (() => V) | undefined;
  return () => {
    if (memo) {
      return memo();
    }
    if (!needed()) {
      return empty;
    }
    if (!owner || isDisposed(owner)) {
      return compute();
    }
    memo = runWithOwner(owner, () => createMemo(guarded));
    return memo();
  };
}