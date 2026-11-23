// 追加(段 3-5): SSR でサーバーも行を描く(React 版と同じく、行・固定列のセル・件数・合計がサーバーの HTML に出る)。
//
//   Solid のハイドレーションはサーバーの要素をそのまま使い、クライアントで違う値になった文字・属性・行を直さないので
//   (段階 4 の測り直し S8-01)、ハイドレーションする骨組みは今までどおり行を空として描きます(サーバーとクライアントで必ず
//   同じ)。サーバーだけ、そのあとに行を入れた同じグリッドの写し(NoHydration の中 = ハイドレーションしない)を描き、骨組みは
//   隠しておきます(display: none)。ブラウザでは描き終わった後(onGridMounted の最初)に写しを外して骨組みを見せ、その後の
//   ふつうの描画でクライアントの行が出ます(同じタスクの中なので、写しが消えてから行が出るまでの間は画面に出ない)。
//   サーバーとブラウザでタイムゾーンや今日が違っても、ページに残るのはクライアントの行だけです。
//
//   写しはサーバーで 1 回描くだけの表示なので、利用者へハンドル(ref)を渡さず、通知(on* の関数)は何もしない関数に
//   置き換えます(関数があること自体で描き方が変わる prop があるので外さない)。
import type { SpreadsheetGridProps } from '../model/gridTypes';

// サーバーで隠した骨組みの根(.ssg-root)の印と、そのすぐ後に置く写しの根の印(どちらも内部の印。公開の契約ではない)。
export const SERVER_FRAME_ATTRIBUTE = 'data-ssg-ssr';
export const SERVER_SNAPSHOT_ATTRIBUTE = 'data-ssg-ssr-snapshot';
// グリッドの根のクラス(サーバーで隠した骨組みには付けない。1.4.1)。
const ROOT_CLASS_NAME = 'ssg-root';

const NOOP = () => {};
const isCallbackKey = (key: string | symbol): boolean => typeof key === 'string' && /^on[A-Z]/.test(key);

// 写しへ渡す props(ref を外し、通知を何もしない関数にする。ほかは元の props をそのまま読む)。
export function createSnapshotProps<T extends object>(props: SpreadsheetGridProps<T>): SpreadsheetGridProps<T> {
  const read = (key: string | symbol): unknown => {
    if (key === 'ref') {
      return undefined;
    }
    const value = Reflect.get(props, key) as unknown;
    return isCallbackKey(key) && typeof value === 'function' ? NOOP : value;
  };
  // 中身の無い入れ物を的にする(props の項目が書き換えられない形でも、Proxy の決まりに触れずに項目の形を返せる)。
  return new Proxy({} as SpreadsheetGridProps<T>, {
    get: (_target, key) => read(key),
    has: (_target, key) => Reflect.has(props, key),
    ownKeys: () => Reflect.ownKeys(props),
    getOwnPropertyDescriptor: (_target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(props, key);
      return descriptor ? { configurable: true, enumerable: descriptor.enumerable ?? true, writable: false, value: read(key) } : undefined;
    },
  });
}

// ブラウザで描き終わった後に、サーバーの写しを外して骨組みを見せます(サーバーで隠していなければ何もしない)。
//   変更(1.4.1): サーバーは骨組みに ssg-root を付けない(サーバーの HTML の .ssg-root を写しの 1 つだけにする)ので、ここで付けます
//   (Solid のハイドレーションは属性を書き直さない。この後の描画で class が変わっても、ssg-root はいつも付く語なので残る)。
//   display は根の style の display(利用者が style で渡した値。無ければ消す)へ戻します。Solid のハイドレーションは style を
//   書かず、その後の描画も前と同じ値なら書き直さないので、ここで消すだけだと利用者の display: none(隠したまま状態を残す形)が
//   効かなくなっていました(段 3-9 のレビュー)。
export function revealServerFrame(root: Element | null | undefined, display?: string | undefined): void {
  if (!root?.hasAttribute(SERVER_FRAME_ATTRIBUTE)) {
    return;
  }
  const snapshot = root.nextElementSibling;
  if (snapshot?.hasAttribute(SERVER_SNAPSHOT_ATTRIBUTE)) {
    snapshot.remove();
  }
  root.removeAttribute(SERVER_FRAME_ATTRIBUTE);
  root.removeAttribute('hidden');
  root.classList.add(ROOT_CLASS_NAME);
  const style = (root as HTMLElement).style;
  if (display === undefined || display === '') {
    style.removeProperty('display');
  } else {
    style.setProperty('display', display);
  }
}