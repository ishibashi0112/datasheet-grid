// 追加(本体分解 E-6b): 共有スクロールコンテナの計測と onScroll 通知のコントローラです(React 非依存。旧
//   SpreadsheetGrid.tsx の「縦スクロール計測(scroll-space 仮想化の駆動)」effect + onScroll の latest-ref を移設)。
//   - 最初の update で要素が揃ったら、初期計測(scrollTop / viewport 幅高)を view スライスへ書き、scroll(passive)
//     リスナーと ResizeObserver(viewport サイズ変化で窓・倍率・flex 配分を再計算)を付けます。dispose で外します。
//   - onScroll 通知は rAF で間引き、フレーム内の最後の位置を 1 回で通知します。同一フレームに user / api が混在
//     したら 'user' を優先(実ユーザー操作の通知を落とすと同期先が追従しなくなるため)。
//   - markApiScroll: 命令的 API 由来のスクロールで「これから発火する scroll イベント」の残数を増やします。
//     イベント処理時に 1 消費して source:'api' を割り当てます(位置が変わらない scrollTo は scroll イベントを
//     発火しないため、実際に位置が変わるときだけ呼ぶこと = engine/gridApi が担保)。
import type { GridScrollEventParams } from '../model/gridTypes.unbound';
import type { GridViewStatePatch } from '../model/gridStore';

type ReadonlyRef<V> = { readonly current: V };

export type ScrollSyncArgs = {
  scrollContainerRef: ReadonlyRef<HTMLElement | null>;
  setViewState: (patch: GridViewStatePatch) => void;
  onScroll: ((params: GridScrollEventParams) => void) | undefined;
  // 追加(合計行 3A): 下端に固定する行(合計行)の高さ。view スライスの viewportHeight は clientHeight からこれを
  //   引いた「本体の行が見える高さ」にします(窓の行数 / scroll-space 仮想化の倍率 / 末尾の判定が合計行の裏の行を
  //   見えている扱いにしないため)。既定 0(従来どおり clientHeight)。
  footerHeight?: number;
};

export type ScrollSyncController = {
  update: (args: ScrollSyncArgs) => void;
  markApiScroll: () => void;
  dispose: () => void;
};

// 追加(motion-1 / M-1): スクロール中だけスクロールコンテナへ付く修飾子です。styles.css はこの間、アクティブセル枠 /
//   選択範囲オーバーレイの追従 transition を切ります(scroll-space 仮想化で描画ウィンドウの基準が動くと overlay の
//   top が変わるため、滑らせると画面上で漂って見える)。停止から SCROLLING_IDLE_MS で外します。
export const SCROLLING_CLASS_NAME = 'ssg-scroll-container--scrolling';
export const SCROLLING_IDLE_MS = 120;

export const createScrollSyncController = (): ScrollSyncController => {
  let args: ScrollSyncArgs | null = null;
  let detach: (() => void) | null = null;
  let apiScrollPending = 0;
  let pendingNotify: GridScrollEventParams | null = null;
  let notifyFrameId: number | null = null;
  let scrollingIdleTimer: ReturnType<typeof setTimeout> | null = null;
  let attachedElement: HTMLElement | null = null;

  const flushScrollNotify = () => {
    notifyFrameId = null;
    const params = pendingNotify;
    pendingNotify = null;
    if (params) {
      args?.onScroll?.(params);
    }
  };

  // 追加(合計行 3A): 本体の行が見える高さ(clientHeight − 合計行の高さ)。
  const bodyViewportHeight = (el: HTMLElement): number =>
    Math.max(el.clientHeight - (args?.footerHeight ?? 0), 0);

  const attach = (el: HTMLElement) => {
    attachedElement = el;
    // center 列 flex の利用可能幅算出に使う可視幅も同時に計測します(3 値をまとめて 1 回の更新)。
    args?.setViewState({
      scrollTop: el.scrollTop,
      viewportHeight: bodyViewportHeight(el),
      viewportWidth: el.clientWidth,
    });
    const handleScroll = () => {
      args?.setViewState({ scrollTop: el.scrollTop });
      // 追加(motion-1): スクロール中の修飾子(停止から SCROLLING_IDLE_MS 後に外す)。
      el.classList.add(SCROLLING_CLASS_NAME);
      if (scrollingIdleTimer !== null) {
        clearTimeout(scrollingIdleTimer);
      }
      scrollingIdleTimer = setTimeout(() => {
        scrollingIdleTimer = null;
        el.classList.remove(SCROLLING_CLASS_NAME);
      }, SCROLLING_IDLE_MS);
      // source の判定はイベント単位(rAF 単位だと api 消費がずれるため)。
      const source: GridScrollEventParams['source'] = apiScrollPending > 0 ? 'api' : 'user';
      if (source === 'api') {
        apiScrollPending -= 1;
      }
      const pending = pendingNotify;
      pendingNotify = {
        top: el.scrollTop,
        left: el.scrollLeft,
        source: pending?.source === 'user' ? 'user' : source,
      };
      if (args?.onScroll && notifyFrameId === null) {
        notifyFrameId = requestAnimationFrame(flushScrollNotify);
      }
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    // 変更(BR-1 2026-10-28): 見える高さ / 幅は次のフレームで書き込みます。ResizeObserver のコールバックの中で書くと、
    //   同じフレームの描き直しでスクロール領域の大きさがまた変わり(横スクロールバーの出入り等)、ブラウザが
    //   「ResizeObserver loop completed with undelivered notifications」を window の error に出すためです。
    //   隠れている間(display: none で幅 0)は書きません。前の大きさを残しておくと、同じ大きさで出し直したとき
    //   (タブの切り替えなど)の最初のフレームが正しく描けるためです(書き込みが 1 フレーム遅れるので、0 を書くと
    //   出し直した最初のフレームが flex 列の配分なしで描かれる)。
    let resizeFrameId: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      resizeFrameId ??= requestAnimationFrame(() => {
        resizeFrameId = null;
        if (el.clientWidth === 0) {
          return;
        }
        args?.setViewState({
          viewportHeight: bodyViewportHeight(el),
          viewportWidth: el.clientWidth,
        });
      });
    });
    resizeObserver.observe(el);
    detach = () => {
      el.removeEventListener('scroll', handleScroll);
      if (notifyFrameId !== null) {
        cancelAnimationFrame(notifyFrameId);
        notifyFrameId = null;
      }
      if (scrollingIdleTimer !== null) {
        clearTimeout(scrollingIdleTimer);
        scrollingIdleTimer = null;
      }
      el.classList.remove(SCROLLING_CLASS_NAME);
      resizeObserver.disconnect();
      if (resizeFrameId !== null) {
        cancelAnimationFrame(resizeFrameId);
      }
      attachedElement = null;
    };
  };

  return {
    update: (next) => {
      const previousFooterHeight = args?.footerHeight ?? 0;
      args = next;
      if (detach === null) {
        const el = next.scrollContainerRef.current;
        if (el) {
          attach(el);
        }
        return;
      }
      // 追加(合計行 3A): 合計行の表示 / 高さが変わったら見える高さを測り直します(要素のサイズは変わらないため
      //   ResizeObserver は発火しない)。
      //   変更(BR-1 見直し): 隠れている間(幅 0)は書きません(ResizeObserver の書き込みと同じ理由。見えたときに測り直す)。
      const footerHeight = next.footerHeight ?? 0;
      if (footerHeight !== previousFooterHeight && attachedElement?.clientWidth) {
        // 追加(見直し): 末尾までスクロールしていたときに合計行が出た / 高くなったら、末尾に留めます(最後の行を
        //   合計行の裏に隠さない)。update はコミット後に呼ばれるため、scrollHeight は増えたあとの値です。
        const el = attachedElement;
        const grownBy = footerHeight - previousFooterHeight;
        if (grownBy > 0) {
          const previousMaxScrollTop = el.scrollHeight - grownBy - el.clientHeight;
          if (previousMaxScrollTop > 0 && el.scrollTop >= previousMaxScrollTop - 1) {
            el.scrollTop = el.scrollHeight - el.clientHeight;
          }
        }
        next.setViewState({ viewportHeight: bodyViewportHeight(el) });
      }
    },
    markApiScroll: () => {
      apiScrollPending += 1;
    },
    dispose: () => {
      detach?.();
      detach = null;
    },
  };
};