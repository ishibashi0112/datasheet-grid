// 追加(0.1.0 の前の実アプリ点検 S5-01): グリッド 1 つぶんの「描き終わった後の最初の処理」(コントローラの最初の update、
//   store の購読、capture のリスナーなど)を順に覚えておき、利用者がハンドルを呼んだ時点でまだ走っていなければ先に走らせます。
//
//   Solid では子(グリッド)の onSettled が親(利用者の部品)の最初の createEffect と onSettled より後に走ります。これまでは
//   ハンドルも onSettled で渡していたので、README どおりに `let grid!` + `ref={grid}` で受けた利用者の最初の effect では
//   ハンドルがまだ undefined で、呼ぶと TypeError から Solid の反応全体が止まっていました(REACTIVITY_HALTED。本番でも)。
//   React 版は子のレイアウト effect(コントローラの update)が利用者の useEffect より先に済んでいます。
//
//   そこでハンドルは部品を作った時点で ref へ渡し、ハンドルのメソッドが呼ばれたときに、描き終わっていれば(根の要素が
//   文書の中にある)この待ち行列を先に流します。流した処理は後の onSettled では走らせず、片付け(戻り値)だけを onSettled の
//   片付けに回します。順番は onSettled と同じ(登録した順)です。
import { onSettled, untrack } from 'solid-js';

type Cleanup = void | (() => void);

export type MountGate = {
  // まだ走っていない処理(登録した順)。
  queue: (() => void)[];
  // すべての onSettled が走った後か、先に流した後。
  done: boolean;
};

let current: MountGate | null = null;

export function createMountGate(): MountGate {
  return { queue: [], done: false };
}

// 部品の本体(同期)の間だけ、onGridMounted の登録先をこの待ち行列にします(入れ子のグリッドは内側のものに切り替わり、
//   抜けると戻る)。
export function runInMountGate<R>(gate: MountGate, fn: () => R): R {
  const previous = current;
  current = gate;
  try {
    return fn();
  } finally {
    current = previous;
  }
}

// 待ち行列を流します(2 回目からは何もしない)。
export function flushMountGate(gate: MountGate): void {
  if (gate.done) {
    return;
  }
  gate.done = true;
  const queue = gate.queue;
  gate.queue = [];
  for (const run of queue) {
    run();
  }
}

// 部品の本体の最後に呼びます。ここまでに登録した onSettled がすべて走った後に、待ち行列を閉じます。
export function closeMountGateOnSettled(gate: MountGate): void {
  onSettled(() => {
    gate.done = true;
    gate.queue = [];
  });
}

// onSettled の代わり(描き終わった後に 1 回。戻り値の関数は片付け)。グリッドの本体の中で呼ぶと、ハンドルが呼ばれたときに
//   先に走らせられます。それ以外(後から描く部品の中など)では onSettled と同じです。
export function onGridMounted(fn: () => Cleanup): void {
  const gate = current;
  let ran = false;
  let cleanup: Cleanup;
  const run = () => {
    if (ran) {
      return;
    }
    ran = true;
    // 部品の owner の中へは戻さない(owner の中では signal に書けない = REACTIVE_WRITE_IN_OWNED_SCOPE。onSettled と同じく
    //   owner の外で走らせる。中で onCleanup / createX は使わず、片付けは戻り値で返す)。
    cleanup = untrack(fn);
  };
  gate?.queue.push(run);
  onSettled(() => {
    run();
    return () => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
  });
}