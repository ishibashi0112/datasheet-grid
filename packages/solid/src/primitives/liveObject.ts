import { createMemo } from 'solid-js';

// 値を読んだときに引く形のオブジェクト(各キーをゲッターにする)。利用側の関数(renderTopBar など)へ渡し、その中で読んだ値だけを
//   追従させるときに使います(Solid の props と同じ考え方)。キーごとに memo で受けるので、読んだ側はそのキーの値が変わった
//   ときだけ走り直します(ほかのキーの値の変化や、元のオブジェクトの作り直しでは走らない。関数の本体で `setGlobalFilterText`
//   だけを分割代入しても、状態が変わるたびに中身を作り直さない)。所有者(コンポーネント)の中で呼んでください。
export function createLiveObject<V extends object, K extends keyof V>(keys: readonly K[], read: () => V): V {
  const live = {} as V;
  for (const key of keys) {
    const value = createMemo(() => read()[key]);
    Object.defineProperty(live, key, {
      enumerable: true,
      get: value,
    });
  }
  return live;
}
