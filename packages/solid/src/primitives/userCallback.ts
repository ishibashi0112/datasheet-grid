// 利用側の通知の関数(onRowsChange など)を、グリッド自身の書き込みとは別の「1 回の同期の処理」(Solid 2.0 のフレーム)で
//   呼ぶための包みです(段階 4 の測り直し S4-21)。
//
//   Solid 2.0 では、同じ同期の処理の中の書き込みはまとめて反映され、その中で非同期の処理(action など)が始まると、残りの
//   書き込みもそれと一緒に保留されます。通知の中で利用者が action を始めると(action + createOptimistic で保存する、Solid 2.0 の
//   典型的な書き方)、同じ処理の中のグリッドの書き込み(エディタを閉じる・アクティブセルを動かす)が保存の終わりまで画面に
//   出ず、その間の操作は古い画面のまま効いていました(保存中に別の行を編集すると前の行へ書かれた)。React 版では
//   startTransition に渡した関数の中の更新だけが遷移になり、グリッドの更新はすぐ出ます。それに合わせて:
//   - イベント(押した・打った)やタイマーの中から呼ぶ通知は、呼ぶ前と後にそれまでの書き込みを反映し切ります(flush)。
//     利用者の処理の中の書き込みだけが利用者のフレームに入ります。通知は今までどおり同じ処理の中で呼ばれます。
//     その途中の反映ではコントローラの update を止め(primitives/controller.ts)、イベントの処理が終わった後の反映で
//     最後の値を渡します。React 版で 1 回のイベントの更新がまとめて描かれ、コントローラ(と、その中から呼ぶ
//     onActiveCellChange などの通知)が途中の状態を見ないのと同じにするためです。
//   - グリッドの描画や effect の中(コントローラの update の中。runGridUpdate)から呼ぶ通知は、その場では反映し切れない
//     (Solid は effect の中の flush を受け付けない)ので、今の反映が終わった直後(次のマイクロタスク)に、自分のフレームで
//     呼びます。React 版でも描いた後の effect で呼ぶ通知(onActiveCellChange / onStateChange など)で、イベントの処理の
//     中では呼ばれない点は同じです。グリッドを外した後は呼びません(React 版でアンマウントした後に通知しないのと同じ)。
//   - 利用者がハンドルのメソッドを呼んだときの通知(runHandleCall の中)は、利用者の処理の中でそのまま呼びます(反映し
//     切るかどうかは利用者のフレームのことなので、グリッドは触りません。action の本体や effect の中から呼ばれることもある)。
//   Solid の書き方の案内(onFlush で書き込みを自分のフレームへ出す)と同じ考え方です。onFlush そのものはグリッドの書き込みを
//   次のマイクロタスクまで遅らせ、利用者のテストの「fireEvent → flush() → 確かめる」が通らなくなるので使いません。
import { flush, getOwner, isDisposed } from 'solid-js';

let gridUpdateDepth = 0;
let handleCallDepth = 0;
let isolatingDepth = 0;
const pendingReplays = new Set<() => void>();

// コントローラの update(primitives/controller.ts)をこの中で呼びます。
export function runGridUpdate<R>(fn: () => R): R {
  gridUpdateDepth++;
  try {
    return fn();
  } finally {
    gridUpdateDepth--;
  }
}

// 利用者が呼んだハンドルのメソッドをこの中で呼びます。
export function runHandleCall<R>(fn: () => R): R {
  handleCallDepth++;
  try {
    return fn();
  } finally {
    handleCallDepth--;
  }
}

// 通知の前後の反映の中か(コントローラの update を止める)。止めたコントローラは replay を預け、反映の後に呼ばれます。
export function isIsolatingFlush(): boolean {
  return isolatingDepth > 0;
}

export function deferControllerUpdate(replay: () => void): void {
  pendingReplays.add(replay);
}

const flushQuietly = (): void => {
  try {
    flush();
  } catch {
    // 反映できない場所(onSettled の中など)。その場の書き込みは、今の反映の続きで出る。
  }
};

const isolatedFlush = (): void => {
  isolatingDepth++;
  try {
    flushQuietly();
  } finally {
    isolatingDepth--;
  }
};

// 止めたコントローラに、次の反映でもう 1 回 update させます(書き込みはこの後のフレーム = イベントの処理の残りと一緒)。
const releaseReplays = (): void => {
  if (pendingReplays.size === 0) {
    return;
  }
  const replays = Array.from(pendingReplays);
  pendingReplays.clear();
  for (const replay of replays) {
    replay();
  }
};

// イベントの中から呼ぶ通知(グリッドの部品の中の利用者の関数。右クリックメニューの項目の onSelect など)。
export function callInOwnFrame<A extends unknown[], R>(fn: (...args: A) => R, ...args: A): R {
  if (handleCallDepth > 0 || gridUpdateDepth > 0 || getOwner() !== null) {
    return fn(...args);
  }
  isolatedFlush();
  try {
    return fn(...args);
  } finally {
    isolatedFlush();
    releaseReplays();
  }
}

export type UserCallbacks = {
  // 関数を包みます(undefined はそのまま)。グリッドの描画や effect の中から呼ばれたときは後で呼ぶので、戻り値は
  //   使えません(戻り値を使う関数は、イベントの中だけで呼ぶもの = onCellClick の preventDefault など)。
  wrap: <A extends unknown[], R>(fn: ((...args: A) => R) | undefined) => ((...args: A) => R | undefined) | undefined;
  call: <A extends unknown[], R>(fn: (...args: A) => R, ...args: A) => R | undefined;
};

// グリッド 1 つにつき 1 つ作ります(部品の本体で。後で呼ぶ通知を、外した後に呼ばないため)。
export function createUserCallbacks(): UserCallbacks {
  const owner = getOwner();
  const call = <A extends unknown[], R>(fn: (...args: A) => R, ...args: A): R | undefined => {
    if (handleCallDepth > 0 || (gridUpdateDepth === 0 && getOwner() !== null)) {
      // ハンドルの中 / 部品の本体や計算の中(反映し切れない)。そのまま呼ぶ。
      return fn(...args);
    }
    if (gridUpdateDepth > 0) {
      queueMicrotask(() => {
        if (owner && isDisposed(owner)) {
          return;
        }
        flushQuietly();
        fn(...args);
        flushQuietly();
      });
      return undefined;
    }
    return callInOwnFrame(fn, ...args);
  };
  return {
    call,
    wrap: (fn) => (fn ? (...args) => call(fn, ...args) : undefined),
  };
}