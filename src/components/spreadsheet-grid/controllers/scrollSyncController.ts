// 追加(本体分解 E-6b): 共有スクロールコンテナの計測と onScroll 通知のコントローラです(React 非依存。旧
//   SpreadsheetGrid.tsx の「縦スクロール計測(scroll-space 仮想化の駆動)」effect + onScroll の latest-ref を移設)。
//   - 最初の update で要素が揃ったら、初期計測(scrollTop / viewport 幅高)を view スライスへ書き、scroll(passive)
//     リスナーと ResizeObserver(viewport サイズ変化で窓・倍率・flex 配分を再計算)を付けます。dispose で外します。
//   - onScroll 通知は rAF で間引き、フレーム内の最後の位置を 1 回で通知します。同一フレームに user / api が混在
//     したら 'user' を優先(実ユーザー操作の通知を落とすと同期先が追従しなくなるため)。
//   - markApiScroll: 命令的 API 由来のスクロールで「これから発火する scroll イベント」の残数を増やします。
//     イベント処理時に 1 消費して source:'api' を割り当てます(位置が変わらない scrollTo は scroll イベントを
//     発火しないため、実際に位置が変わるときだけ呼ぶこと = engine/gridApi が担保)。
import type { GridScrollEventParams } from '../model/gridTypes';
import type { GridViewStatePatch } from '../model/gridStore';

type ReadonlyRef<V> = { readonly current: V };

export type ScrollSyncArgs = {
  scrollContainerRef: ReadonlyRef<HTMLElement | null>;
  setViewState: (patch: GridViewStatePatch) => void;
  onScroll: ((params: GridScrollEventParams) => void) | undefined;
};

export type ScrollSyncController = {
  update: (args: ScrollSyncArgs) => void;
  markApiScroll: () => void;
  dispose: () => void;
};

export const createScrollSyncController = (): ScrollSyncController => {
  let args: ScrollSyncArgs | null = null;
  let detach: (() => void) | null = null;
  let apiScrollPending = 0;
  let pendingNotify: GridScrollEventParams | null = null;
  let notifyFrameId: number | null = null;

  const flushScrollNotify = () => {
    notifyFrameId = null;
    const params = pendingNotify;
    pendingNotify = null;
    if (params) {
      args?.onScroll?.(params);
    }
  };

  const attach = (el: HTMLElement) => {
    // center 列 flex の利用可能幅算出に使う可視幅も同時に計測します(3 値をまとめて 1 回の更新)。
    args?.setViewState({
      scrollTop: el.scrollTop,
      viewportHeight: el.clientHeight,
      viewportWidth: el.clientWidth,
    });
    const handleScroll = () => {
      args?.setViewState({ scrollTop: el.scrollTop });
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
    const resizeObserver = new ResizeObserver(() => {
      args?.setViewState({
        viewportHeight: el.clientHeight,
        viewportWidth: el.clientWidth,
      });
    });
    resizeObserver.observe(el);
    detach = () => {
      el.removeEventListener('scroll', handleScroll);
      if (notifyFrameId !== null) {
        cancelAnimationFrame(notifyFrameId);
        notifyFrameId = null;
      }
      resizeObserver.disconnect();
    };
  };

  return {
    update: (next) => {
      args = next;
      if (detach === null) {
        const el = next.scrollContainerRef.current;
        if (el) {
          attach(el);
        }
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