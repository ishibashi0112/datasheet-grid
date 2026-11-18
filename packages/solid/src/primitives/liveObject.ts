// 値を読んだときに引く形のオブジェクト(各キーをゲッターにする)。利用側の関数(renderTopBar など)を 1 回だけ呼び、
//   その中で読んだ値だけを追従させるときに使います(Solid の props と同じ考え方)。
export function createLiveObject<V extends object, K extends keyof V>(keys: readonly K[], read: () => V): V {
  const live = {} as V;
  for (const key of keys) {
    Object.defineProperty(live, key, {
      enumerable: true,
      get: () => read()[key],
    });
  }
  return live;
}