// 追加(DevBI の報告 2026-11-07): 表で決まった CSS トークン(--ssg-*)を、document.body の直下に出すポップアップ
//   (列メニュー / フィルター / 右クリックメニュー / select の候補 / ツールパネル / フィルハンドルのメニュー / ツールチップ /
//   ドラッグのゴースト)へ写します。
//
// 背景: style.css はトークンの既定値を .ssg-root と各ポップアップの root に直接定義するため、ポップアップには表の root の値が
//   継承で届きません。利用側が `.ssg-root { … }`(README の書き方)/ `className` のクラス / `.card .ssg-root { … }` /
//   祖先の変数(`--ssg-panel-bg: var(--card-head)`)で決めた色が、ポップアップだけ既定の色になっていました。
//
// 写す変数: 表の root(from の最も近いトークンの元)の値と、ポップアップの今の値が違い、かつポップアップの今の値が次の
//   どちらかと同じもの(= 利用側がポップアップの側では変えていない)。
//   - 素の要素の値: トークンの既定値を持つ内部のクラス(.ssg-token-probe)に、表の root のライブラリの修飾子(ssg- で始まる
//     テーマ / 密度 / モーション)だけを付けた見えない要素。既定値・テーマのプリセット・themes/*.css の値になります。
//   - 素の root の値: 表の root と同じライブラリのクラスだけを付けた見えない要素。利用側の `.ssg-root { … }` のように
//     どの表にも当たる指定の値になります。
//   `.ssg-menu-panel { --ssg-panel-bg: … }` や classNames.popover の style のように、ポップアップの側で変えている指定は
//   どちらとも違うので残します。ポップアップの root にインラインで書かれた値(classNames.popover の style)は、既定値と
//   同じ値でも残します。密度の寸法(DENSITY_TOKENS)は写しません(ポップアップは density の対象外)。
// 値はポップアップの root にインラインで書き、前に写した値は毎回外してから決め直します(そのあとで同じ名前が別の値で
//   書かれていたら、それは残します)。外す / 書く間はポップアップの中の transition を止めます(既定の色からの色の
//   移り変わりが一瞬見えていたため)。変数の名前は getComputedStyle の一覧から取ります(対応ブラウザの Chrome / Edge /
//   Firefox / Safari はカスタムプロパティを一覧に含みます。含まない環境では何も写さず、今までどおりの色になります)。
const TOKEN_PREFIX = '--ssg-';
// density の修飾子が決める寸法。表の root だけに修飾子が付くため、写すと密度ごとに結果が変わります。
const DENSITY_TOKENS = ['--ssg-cell-pad-x', '--ssg-bar-pad-x', '--ssg-bar-pad-y', '--ssg-icon-btn-size'];
// 写す間だけポップアップへ付ける内部のクラス(style.css で transition: none)。
const SYNCING_CLASS = 'ssg-token-sync';
// トークンの既定値を直接持つ要素のクラス(style.css の既定値のセレクタの並びのうちクラスのもの)。
const TOKEN_ROOT_CLASSES = [
  'ssg-root',
  'ssg-popover',
  'ssg-menu-panel',
  'ssg-filter-popover',
  'ssg-select-editor-popover',
  'ssg-tooltip',
];
// 素の要素に付ける内部のクラス(style.css と themes/*.css の既定値のセレクタの並びに入れてある。利用側は書かない)。
export const TOKEN_PROBE_CLASS = 'ssg-token-probe';

const writtenByPortal = /* @__PURE__ */ new WeakMap<HTMLElement, Map<string, string>>();

export function syncPortalTokens(
  from: Element | null | undefined,
  portal: HTMLElement | null | undefined,
): void {
  if (!portal) {
    return;
  }
  const source = from?.closest(TOKEN_ROOT_CLASSES.map((name) => `.${name}`).join());
  const canRead = source && source !== portal && typeof getComputedStyle === 'function';
  const previous = writtenByPortal.get(portal);
  if (!previous && !canRead) {
    return;
  }
  portal.classList.add(SYNCING_CLASS);
  let changed = false;
  if (previous) {
    writtenByPortal.delete(portal);
    previous.forEach((value, name) => {
      if (portal.style.getPropertyValue(name) === value) {
        portal.style.removeProperty(name);
        changed = true;
      }
    });
  }
  if (!canRead) {
    finishSync(portal, changed);
    return;
  }
  const doc = portal.ownerDocument;
  const libraryClasses = Array.from(source.classList).filter((name) => name.startsWith('ssg-'));
  const createProbe = (classNames: string[]) => {
    const probe = doc.createElement('div');
    probe.className = classNames.join(' ');
    probe.style.display = 'none';
    doc.body.appendChild(probe);
    return probe;
  };
  const bareProbe = createProbe([
    TOKEN_PROBE_CLASS,
    ...libraryClasses.filter((name) => !TOKEN_ROOT_CLASSES.includes(name)),
  ]);
  const rootProbe = createProbe(libraryClasses);
  try {
    const sourceStyle = getComputedStyle(source);
    const portalStyle = getComputedStyle(portal);
    const bareStyle = getComputedStyle(bareProbe);
    const rootStyle = getComputedStyle(rootProbe);
    // 先に全部読んでから書きます(書くと var() で決まる他の変数のポップアップの値が変わるため)。
    const next = new Map<string, string>();
    for (let index = 0; index < sourceStyle.length; index += 1) {
      const name = sourceStyle[index];
      if (!name.startsWith(TOKEN_PREFIX) || DENSITY_TOKENS.includes(name) || portal.style.getPropertyValue(name) !== '') {
        continue;
      }
      const value = sourceStyle.getPropertyValue(name);
      const own = portalStyle.getPropertyValue(name);
      if (
        own !== value &&
        (own === bareStyle.getPropertyValue(name) || own === rootStyle.getPropertyValue(name))
      ) {
        next.set(name, value);
      }
    }
    next.forEach((value, name) => portal.style.setProperty(name, value));
    if (next.size > 0) {
      writtenByPortal.set(portal, next);
      changed = true;
    }
  } finally {
    bareProbe.remove();
    rootProbe.remove();
    finishSync(portal, changed);
  }
}

// 変えた値でいったん計算させてから(transition を止めたまま)、止めるクラスを外します。
function finishSync(portal: HTMLElement, changed: boolean): void {
  if (changed) {
    void portal.offsetWidth;
  }
  portal.classList.remove(SYNCING_CLASS);
}

// 開いている間、ページのテーマの切り替え(<html> / <body> の属性)、表の root の class / style、OS の配色の変化でも
//   写し直します(写した値はその時点の値のため、CSS だけでダークへ切り替えると背景だけ前の色で残っていました)。
//   返り値で見張りをやめます。
export function watchPortalTokens(
  getFrom: () => Element | null | undefined,
  portal: HTMLElement,
): () => void {
  const sync = () => syncPortalTokens(getFrom(), portal);
  sync();
  const doc = portal.ownerDocument;
  const view = doc.defaultView;
  if (!view || typeof view.MutationObserver !== 'function') {
    return () => {};
  }
  const observer = new view.MutationObserver(sync);
  for (const target of [doc.documentElement, doc.body]) {
    if (target) {
      observer.observe(target, { attributes: true });
    }
  }
  const source = getFrom();
  if (source) {
    observer.observe(source, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  const media = view.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', sync);
  return () => {
    observer.disconnect();
    media?.removeEventListener?.('change', sync);
  };
}