// 追加(fill-height): `height` / `maxHeight` props からルート要素とスクロールコンテナへ当てる
//   inline style を決める純関数です(React 非依存)。
//   旧実装は height を常にスクロールコンテナ(.ssg-scroll-container)へだけ当てていたため、
//   '100%' がその親 .ssg-shell(高さ auto)基準で解決されて auto になり、利用側の親が確定高さを
//   持っていても全行分の高さまで伸びていました(仮想化も効かない)。本関数は値の種類で 2 系統に分けます。
//   - 親基準モード(height が '%' を含む文字列。'100%' / '50%' / 'calc(100% - 40px)' 等):
//     ルートに height を当て、ルートを flex column 化(.ssg-root--fill-height)して、トップバー /
//     フィルターチップバー / ボトムバーを除いた残りをスクロールコンテナへ配分します
//     (= バー込みのグリッド全体が親の高さに収まる)。
//   - それ以外(number / '%' を含まない文字列 / 未指定): 従来どおりスクロールコンテナの高さです
//     (後方互換。number = px。ルートはバーの分だけ高くなる)。
//   maxHeight はどちらの系統でも「スクロールコンテナの高さ上限」です。親基準モードで併用したときは
//   ルートの height を max-height に回し、スクロールコンテナを maxHeight の高さで置いて縮められる
//   ようにします(スクロール領域 = min(maxHeight, 親の高さ − バー)。数値 height + maxHeight の
//   min と同じ意味)。

export type GridHeightValue = number | string;

export type GridHeightStyle = {
  height?: GridHeightValue;
  maxHeight?: GridHeightValue;
};

export type GridHeightLayout = {
  // true のときルートへ修飾子 .ssg-root--fill-height を付けます(flex column 化)。
  fillParent: boolean;
  // ルート要素の inline style(親基準モードのみ。利用側の style / classNames.root.style が後勝ち)。
  rootStyle: GridHeightStyle | undefined;
  // スクロールコンテナの inline style。undefined は CSS 既定(max-height: 480px)に委ねます。
  scrollContainerStyle: GridHeightStyle | undefined;
};

const DEFAULT_LAYOUT: GridHeightLayout = Object.freeze({
  fillParent: false,
  rootStyle: undefined,
  scrollContainerStyle: undefined,
});

// height が親要素基準の値(親基準モード)かを判定します。'%' を含む文字列のみ true です。
//   'px' / 'vh' / 'calc(100vh - 120px)' 等は親に依存しないため従来どおりスクロール領域の高さです。
export function isParentRelativeHeight(
  height: GridHeightValue | undefined,
): height is string {
  return typeof height === 'string' && height.includes('%');
}

export function resolveGridHeightLayout(
  height: GridHeightValue | undefined,
  maxHeight: GridHeightValue | undefined,
): GridHeightLayout {
  if (isParentRelativeHeight(height)) {
    if (maxHeight === undefined) {
      // スクロールコンテナは flex で残りを埋めます。CSS 既定 480px を打ち消すため max-height:none。
      return {
        fillParent: true,
        rootStyle: { height },
        scrollContainerStyle: { maxHeight: 'none' },
      };
    }
    return {
      fillParent: true,
      rootStyle: { maxHeight: height },
      scrollContainerStyle: { height: maxHeight, maxHeight },
    };
  }
  if (height === undefined && maxHeight === undefined) {
    // 両者未指定: inline を付けず CSS 既定 480px に委ねます(従来挙動)。
    return DEFAULT_LAYOUT;
  }
  // 従来どおり: height はスクロールコンテナの明示高さ。maxHeight 未指定時は CSS 既定 480 を
  //   打ち消すため max-height:'none' にします(height をクリップさせない)。
  return {
    fillParent: false,
    rootStyle: undefined,
    scrollContainerStyle: {
      ...(height !== undefined ? { height } : {}),
      maxHeight: maxHeight ?? 'none',
    },
  };
}