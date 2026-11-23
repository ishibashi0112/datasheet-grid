import { createMemo } from 'solid-js';

// 値を読んだときに引く形のオブジェクト(各キーをゲッターにする)。利用側の関数(renderTopBar など)へ渡し、その中で読んだ値だけを
//   追従させるときに使います(Solid の props と同じ考え方)。キーごとに memo で受けるので、読んだ側はそのキーの値が変わった
//   ときだけ走り直します(ほかのキーの値の変化や、元のオブジェクトの作り直しでは走らない。関数の本体で `setGlobalFilterText`
//   だけを分割代入しても、状態が変わるたびに中身を作り直さない)。所有者(コンポーネント)の中で呼んでください。
//   memo は読まれるまで計算しない(lazy。段 3-4 / S5-22): 誰も読まないキーまで元のオブジェクトが変わるたびに計算し直すと、
//   バーの文脈の filteredRows(表示順の行の配列を作る。100 万行で約 30ms)をアクティブセルが動くたびに作っていた。
//   読む側がいなくなった memo は片付き、次に読んだときに計算し直す。
export function createLiveObject<V extends object, K extends keyof V>(keys: readonly K[], read: () => V): V {
  const live = {} as V;
  for (const key of keys) {
    const value = createMemo(() => read()[key], { lazy: true });
    Object.defineProperty(live, key, {
      enumerable: true,
      get: value,
    });
  }
  return live;
}