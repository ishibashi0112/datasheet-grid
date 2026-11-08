// 追加(段階 2 DU-26): コンポーネントの中で createSpreadsheetGrid を呼び、描くたびにグリッドが作り直されているのを見つけたら、
//   開発時だけ 1 回警告します(作り直すと選択・スクロール位置・編集中の値が毎回消えるのに、これまでは何も言われなかった)。
//   見つけ方: 「どれかのグリッドが表示されている間に作った」コンポーネントのグリッドが、その表示されていたグリッドと同じ
//   コミットで入れ替わり、しかも同じ rows を受けている(同じ場所の描き直し)とき。モジュールの先頭で作ったコンポーネントの
//   切り替え(タブなど)は、作ったときに表示されていたグリッドが無いので当たりません。StrictMode の付け外しは同じ
//   コンポーネントなので当たりません。本番では何もしない関数に差し替わり、利用側のバンドラが処理ごと取り除きます。
//   追記(段階 2 の見直し): モジュールの先頭で作っていても、そのモジュールを書き換えたとき(HMR)は表示中にモジュールが
//   読み直されて同じ形になり、1 回だけ出ることがあります(ライブラリからは見分けられない)。文言でそう断ります。
import { useEffect } from 'react';

// 型だけの宣言です(利用側のバンドラが process.env.NODE_ENV を文字列へ置き換える。useUnregisteredFeatureWarnings と同じ)。
declare const process: { env: { NODE_ENV?: string } };

export type GridFactoryTrace = {
  id: number;
  // 作ったときに表示されていたグリッドの、作ったコンポーネントの id。
  liveAtCreation: ReadonlySet<number>;
};

let nextFactoryId = 1;
// 表示されているグリッドの数(作ったコンポーネントの id ごと)。
const mountedCounts = /* @__PURE__ */ new Map<number, number>();
// このコミットで外れたグリッド(次のマイクロタスクで消す)。
let recentlyUnmounted: { factoryId: number; rows: unknown }[] = [];
let warned = false;

const traceGridFactoryInDev = (): GridFactoryTrace => ({
  id: nextFactoryId++,
  liveAtCreation: new Set(mountedCounts.keys()),
});

function useRecreatedGridWarningInDev(trace: GridFactoryTrace | null, rows: unknown): void {
  useEffect(() => {
    if (trace === null) {
      return undefined;
    }
    if (!warned && recentlyUnmounted.some((entry) => trace.liveAtCreation.has(entry.factoryId) && entry.rows === rows)) {
      warned = true;
      console.warn(
        '[spreadsheet-grid] createSpreadsheetGrid がコンポーネントの中で呼ばれ、描くたびにグリッドが作り直されています' +
          '(選択・スクロール位置・編集中の値などが毎回消えます)。モジュールの先頭で 1 回だけ呼んでください' +
          '(モジュールの先頭で呼んでいて、そのファイルを書き換えた直後(HMR)に 1 回だけ出たのなら、書き換えで作り直されたためで問題ありません)。',
      );
    }
    mountedCounts.set(trace.id, (mountedCounts.get(trace.id) ?? 0) + 1);
    return () => {
      const count = (mountedCounts.get(trace.id) ?? 1) - 1;
      if (count > 0) {
        mountedCounts.set(trace.id, count);
      } else {
        mountedCounts.delete(trace.id);
      }
      if (recentlyUnmounted.length === 0) {
        queueMicrotask(() => {
          recentlyUnmounted = [];
        });
      }
      recentlyUnmounted.push({ factoryId: trace.id, rows });
    };
    // 付け外し(と rows の参照)のときだけ。trace は作ったコンポーネントごとに固定です。
  }, [trace, rows]);
}

const useRecreatedGridWarningInProduction: typeof useRecreatedGridWarningInDev = () => {};

export const traceGridFactory: () => GridFactoryTrace | null =
  process.env.NODE_ENV === 'production' ? () => null : traceGridFactoryInDev;

export const useRecreatedGridWarning =
  process.env.NODE_ENV === 'production' ? useRecreatedGridWarningInProduction : useRecreatedGridWarningInDev;

// テスト用: 1 回だけの警告と記録を戻します。
export const resetRecreatedGridWarning = (): void => {
  warned = false;
  recentlyUnmounted = [];
  mountedCounts.clear();
};
