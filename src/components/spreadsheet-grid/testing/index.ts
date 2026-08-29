// 追加(proposals ③): jsdom テスト用レイアウトスタブの公式化です。
//   `@ishibashi0112/spreadsheet-grid/testing` サブパスで公開します(React 非依存)。
//
// 背景: jsdom はレイアウトを計算しないため、素の jsdom では実グリッドが 1 行も描画されません。
//   - 縦方向: SpreadsheetGrid の effect がスクロール要素の clientHeight / clientWidth を読み、
//     以後 ResizeObserver で追従します(jsdom では 0 のため行が出ない)。
//   - 横方向: @tanstack/react-virtual の useVirtualizer がスクロール要素の矩形を
//     「ResizeObserver の通知」から得るため、observe() が no-op のスタブだと幅 0 のまま
//     列が 1 本も描画されません(getBoundingClientRect のスタブだけでは不足)。
//   本モジュールは両方をまとめて解決し、実グリッドの行 / セル(付与クラス・セル文字列)を
//   DOM で検証できるようにします。
//
// 使い方(Vitest / jsdom):
//   // @vitest-environment jsdom
//   import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing';
//   beforeAll(() => { installJsdomLayoutStubs(); });
//   // 寸法を変えたい場合: installJsdomLayoutStubs({ width: 800, height: 400 })
//   // teardown したい場合: const restore = installJsdomLayoutStubs(); afterAll(restore);

export type JsdomLayoutStubOptions = {
  // スクロール要素として通知する幅(px)。既定 1200。
  width?: number;
  // スクロール要素として通知する高さ(px)。既定 600。
  height?: number;
};

type ResizeObserverCallbackLike = (entries: unknown[], observer: unknown) => void;

// jsdom に「width × height のビューポートを持つ要素」を装わせるレイアウトスタブ一式を
//   インストールします。返り値はインストール前の状態へ戻す restore 関数です(通常の
//   テストスイートでは beforeAll で 1 回呼べば十分で、restore は任意)。
//   - HTMLElement.prototype.clientHeight / clientWidth を固定値の getter に差し替え
//   - Element.prototype.getBoundingClientRect を固定矩形に差し替え
//   - globalThis.ResizeObserver を「observe() 時に即時コールバックする」スタブへ差し替え
//     (react-virtual はこの通知から矩形を得るため、即時発火が必須)
//   - Element.prototype.scrollTo が無ければ no-op を補う
export function installJsdomLayoutStubs(
  options: JsdomLayoutStubOptions = {},
): () => void {
  const width = options.width ?? 1200;
  const height = options.height ?? 600;

  const elementProto = Element.prototype;
  const htmlElementProto = HTMLElement.prototype;

  // restore 用に元の記述子 / 値を退避します。
  const originalClientHeight = Object.getOwnPropertyDescriptor(
    htmlElementProto,
    'clientHeight',
  );
  const originalClientWidth = Object.getOwnPropertyDescriptor(
    htmlElementProto,
    'clientWidth',
  );
  const originalGetBoundingClientRect = elementProto.getBoundingClientRect;
  const originalResizeObserver = (
    globalThis as { ResizeObserver?: unknown }
  ).ResizeObserver;
  const originalScrollTo = elementProto.scrollTo;

  Object.defineProperty(htmlElementProto, 'clientHeight', {
    configurable: true,
    get: () => height,
  });
  Object.defineProperty(htmlElementProto, 'clientWidth', {
    configurable: true,
    get: () => width,
  });
  elementProto.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: height,
      right: width,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect;

  class ResizeObserverStub {
    private readonly callback: ResizeObserverCallbackLike;
    constructor(callback: ResizeObserverCallbackLike) {
      this.callback = callback;
    }
    observe(target: Element): void {
      const size = { inlineSize: width, blockSize: height };
      // observe 時に即時コールバックします。react-virtual はここから矩形を得ます。
      this.callback(
        [
          {
            target,
            contentRect: { width, height, top: 0, left: 0 },
            borderBoxSize: [size],
            contentBoxSize: [size],
          },
        ],
        this,
      );
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as { ResizeObserver: unknown }).ResizeObserver =
    ResizeObserverStub;

  if (!elementProto.scrollTo) {
    elementProto.scrollTo = () => {};
  }

  return () => {
    if (originalClientHeight) {
      Object.defineProperty(htmlElementProto, 'clientHeight', originalClientHeight);
    } else {
      delete (htmlElementProto as { clientHeight?: unknown }).clientHeight;
    }
    if (originalClientWidth) {
      Object.defineProperty(htmlElementProto, 'clientWidth', originalClientWidth);
    } else {
      delete (htmlElementProto as { clientWidth?: unknown }).clientWidth;
    }
    elementProto.getBoundingClientRect = originalGetBoundingClientRect;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
      originalResizeObserver;
    elementProto.scrollTo = originalScrollTo;
  };
}