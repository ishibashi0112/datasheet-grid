// 追加(段 3-2 / S1-01): rows に Solid の store(createStore)を渡したときの読み方です。
//
//   グリッドは React 版と同じく、編集の結果を onRowsChange で新しい配列として返し、渡した配列がそのまま rows へ戻ってきたかで
//   「自分の編集」か「外からの差し替え」かを見分けます(元に戻すの履歴は外からの差し替えで消える)。store に入れると、戻って
//   くる rows は渡した配列ではなく store のプロキシになるので、どの編集も外からの差し替えに見えて元に戻すが効かず、グリッドの
//   計算がプロキシを通して全部の行を読むので、開発時に Solid の知らせ(HUGE_FAN_IN / STRICT_READ_UNTRACKED)が大量に出ていました。
//
//   そこで store のときは、グリッドの計算にはプロキシではなく中身(snapshot。手を付けていない部分は元の配列と行そのもの)を
//   渡します。`setStore((s) => { s.rows = next })` や `reconcile(next, 'id')(s.rows)` で戻した rows の中身は、グリッドが渡した
//   配列そのものなので、signal のときと同じく元に戻すが効きます。store の中を直接変えたとき(`s.rows[0].name = …` / push /
//   splice)は、中身が新しい配列になるので外からの変更として映ります(React 版で親が rows を差し替えたときと同じ)。
//
//   中を直接変えたことに気づくため、全部の行を追います:
//   - 配列の並び(足す・消す・入れ替える)は配列の $TRACK(Solid の store の「入れ物」の印)を読む 1 つの effect で追う。
//   - 行の中身(項目を変える)は Solid の deep で行ごとに追う(1 行につき 2 つほどの元)。1 つの計算で全部を追うと 1,000 行ほどから
//     開発時に HUGE_FAN_IN が出るので、ROWS_PER_TRACKER 行ずつ別の effect(追いかけ)で追い、行の項目を変えたときに読み直すのも
//     その組だけにする。追いかけは行(のプロキシ)ごとに作るので、編集で戻ってきた新しい配列(手を付けていない行は同じ)でも、
//     中の行が変わらない組はそのまま使い回す(1 行の編集で作り直すのは 1 組 = 300 行だけ)。
//   store は行ごとに追いかけの部品を持つので、数十万行より多いときは signal で持つほうが軽くなります(README に書く)。
//
//   変更(段 3-9 のレビュー): 中身の変化は memo ではなく effect で追い、effect の中の書き込み(storeRowsContents)でグリッドの
//   計算へ知らせます。`action` の中で `reconcile(next, 'id')(s.rows)` と戻したり項目を変えたりすると、その書き込みは保存(遷移)が
//   終わるまで保留されます。memo で追うと、保留中の中身を読んだ計算は latest で読んでも遷移に入り、そこから先のグリッドの計算が
//   すべて止まって(選択も貼り付けも映らない)、保存中の次の編集は古い行から作られて前の編集を上書きしていました(S4-21 と同じ形。
//   0.1.2 では起きない)。effect が latest(保留中でも今の値)で読み、effect の中で書けば遷移に入りません(SpreadsheetGrid の
//   relayRows と同じ形)。グリッドの計算は store の中身を読まず、知らせを受けて snapshot を latest で取り直します。
import { $PROXY, $TRACK, createEffect, createMemo, createRoot, createSignal, deep, getOwner, latest, onCleanup, runWithOwner, snapshot, untrack } from 'solid-js';
import { outsideGraphApply } from './effectApply';

// store のプロキシか(Solid の store のプロキシは $PROXY を持つ)。
export const isSolidStore = (value: unknown): value is object =>
  typeof value === 'object' && value !== null && $PROXY in value;

// 1 つの追いかけで追う行の数です。項目が値だけの行は 1 行につき 2 つほどの元なので 600 個、行の中に配列やオブジェクトが
//   いくつかあっても Solid の HUGE_FAN_IN の 2,000 より下。
const ROWS_PER_TRACKER = 300;

// これより多い行を store で渡したら、開発時に 1 回 signal を勧めます(10 万行で編集 1 回 0.1 秒ほど。2026-11-23 の計測)。
const LARGE_STORE_ROWS = 50_000;

type Tracker = { items: readonly unknown[]; dispose: () => void };

const sameItems = (a: readonly unknown[], b: readonly unknown[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
};

// 追いかけは組ごとの root に置きます(配列が変わって並びを読み直しても、中の行が同じ組は作り直さない)。effect の apply の
//   中で作るので、親はグリッドの owner を明示します(apply には owner が無い)。要らなくなったとき(組の中の行が変わった)は
//   自分で片付け、グリッドを外したときは親と一緒に片付きます。compute は毎回新しい値を返すので、中身が変わるたびに apply が
//   走ります(最初の 1 回は作ったときの中身なので知らせない)。
const createTracker = (owner: ReturnType<typeof getOwner>, items: readonly unknown[], changed: () => void): Tracker =>
  runWithOwner(owner, () =>
    createRoot((dispose) => {
      let first = true;
      createEffect(
        () =>
          latest(() => {
            for (const item of items) {
              deep(item);
            }
            return {};
          }),
        outsideGraphApply(() => {
          if (first) {
            first = false;
            return;
          }
          changed();
        }),
        { name: 'storeRowsTracker' },
      );
      return { items, dispose };
    }),
  );

export function createPlainRows<T>(read: () => readonly T[] | undefined): () => readonly T[] | undefined {
  const owner = getOwner();
  let trackers: Tracker[] = [];
  let warnedLarge = false;
  // 追いかけている store(配列のプロキシ)。別の store(配列の差し替え)は下の memo が rows の変化として読むので知らせない。
  let watched: object | null = null;
  const [contents, setContents] = createSignal(0, { name: 'storeRowsContents' });
  const changed = () => {
    setContents((count) => count + 1);
  };
  const disposeAll = () => {
    for (const tracker of trackers) {
      tracker.dispose();
    }
    trackers = [];
  };
  onCleanup(disposeAll);
  const track = (rows: readonly unknown[]) => {
    const next: Tracker[] = [];
    const kept = new Set<Tracker>();
    untrack(() =>
      latest(() => {
        const length = rows.length;
        if (process.env.NODE_ENV !== 'production' && !warnedLarge && length > LARGE_STORE_ROWS) {
          warnedLarge = true;
          console.warn(
            `[SpreadsheetGrid] rows に ${LARGE_STORE_ROWS.toLocaleString('en-US')} 行を超える Solid の store(createStore)を渡しています。store の中を直接変えたことに気づくため行ごとに追うので、行が多いと編集のたびに時間がかかります(10 万行で 1 回 0.1 秒ほど)。多い行は createSignal で持ち、受け取った配列をそのまま set してください。\n` +
              `[SpreadsheetGrid] rows is a Solid store (createStore) with more than ${LARGE_STORE_ROWS.toLocaleString('en-US')} rows. The grid tracks each row to notice changes made inside the store, so every edit takes longer with many rows (about 0.1s per edit with 100,000 rows). Keep many rows in a createSignal and set the array you receive as is.`,
          );
        }
        for (let start = 0, chunk = 0; start < length; start += ROWS_PER_TRACKER, chunk += 1) {
          const items: unknown[] = [];
          const end = Math.min(start + ROWS_PER_TRACKER, length);
          for (let index = start; index < end; index += 1) {
            items.push(rows[index]);
          }
          const previous = trackers[chunk];
          if (previous !== undefined && !kept.has(previous) && sameItems(previous.items, items)) {
            kept.add(previous);
            next.push(previous);
          } else {
            next.push(createTracker(owner, items, changed));
          }
        }
      }),
    );
    for (const tracker of trackers) {
      if (!kept.has(tracker)) {
        tracker.dispose();
      }
    }
    trackers = next;
  };
  // 並び(足す・消す・入れ替える)を追う。項目の変更では変わらない。
  createEffect(
    () =>
      latest(() => {
        const value = read();
        if (!isSolidStore(value)) {
          return { rows: null };
        }
        const rows = value as readonly unknown[] & { [$TRACK]?: unknown };
        void rows[$TRACK];
        return { rows };
      }),
    outsideGraphApply(({ rows }) => {
      if (rows === null) {
        watched = null;
        disposeAll();
        return;
      }
      const sameStore = rows === watched;
      watched = rows;
      track(rows);
      if (sameStore) {
        changed();
      }
    }),
    { name: 'storeRowsStructure' },
  );
  return createMemo(
    () => {
      const value = read();
      if (!isSolidStore(value)) {
        return value;
      }
      contents();
      return untrack(() => latest(() => snapshot(value))) as readonly T[];
    },
    { name: 'storeRows' },
  );
}