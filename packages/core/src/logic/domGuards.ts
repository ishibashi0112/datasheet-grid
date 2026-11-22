// 追加: 文字キー入力で編集開始する判定です。
export const isPrintableKey = (event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}) =>
  event.key.length === 1 &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.altKey;

// 追加(1.0 前の最終チェック FC-13): IME の変換中のキー(候補の操作 / 変換を確定する Enter / 取り消す Escape)か。
//   Safari は変換を確定する keydown を isComposing=false / keyCode 229 で送るため、isComposing だけでは確定の Enter が
//   セルの確定や検索の「次へ」になっていました(GridAskBar と同じ判定)。React の合成イベントは nativeEvent を渡します。
export const isImeComposingKeyEvent = (event: { isComposing?: boolean; keyCode?: number }): boolean =>
  event.isComposing === true || event.keyCode === 229;

// 追加(Solid 版 段階 1-3): Tab キーか。key が 'Unidentified' のときは keyCode(9)で見ます(WebKitGTK の WebDriver は
//   Shift+Tab の keydown を key='Unidentified' で送る。React の合成イベントは key を keyCode から 'Tab' に直すので、
//   元のイベント(nativeEvent / Solid)を読むところはこれで React の合成イベントと同じ判定にそろえます)。
export const isTabKeyEvent = (event: { key: string; keyCode?: number }): boolean =>
  event.key === 'Tab' || (event.key === 'Unidentified' && event.keyCode === 9);

// 追加(G-2): IME オンのままの直接入力(imeDirectInput)の入力受けに付ける属性です。入力受けは編集していない
//   あいだグリッドのフォーカスを持つ透明な input で、キー操作 / 貼り付けはグリッド本体と同じ扱いにします。
export const IME_INPUT_ATTRIBUTE = 'data-ssg-ime-input';

// 追加(G-2): イベントの発火元が入力受けか。
export const isImeInputTarget = (eventTarget: EventTarget | null): boolean =>
  typeof HTMLElement !== 'undefined' &&
  eventTarget instanceof HTMLElement &&
  eventTarget.hasAttribute(IME_INPUT_ATTRIBUTE);

// 追加: input/select/textarea/button/contenteditable 配下では
//       grid のキーボードショートカットを発火させないための判定です。
// 変更(G-2): 入力受け(IME_INPUT_ATTRIBUTE)は input でもグリッド本体として扱います(無視しない)。
export const shouldIgnoreGridKeydown = (eventTarget: EventTarget | null) => {
  if (!(eventTarget instanceof HTMLElement)) {
    return false;
  }
  if (eventTarget.hasAttribute(IME_INPUT_ATTRIBUTE)) {
    return false;
  }

  // 変更(audit RD-2): contenteditable は "true" 以外(空文字 / plaintext-only)も編集可能なので
  //   "false" 以外を対象にします。
  const interactiveElement = eventTarget.closest(
    'input, textarea, select, button, [contenteditable]:not([contenteditable="false"])',
  );

  return interactiveElement !== null;
};

// 追加(audit V-16): renderHeader の中のボタン / 入力欄 / リンク等から始まった pointerdown では列の範囲選択を
//   始めません(既定動作の preventDefault も掛けないため、入力欄へフォーカスも入ります)。
//   React 版の view/GridHeaderRow から移しました(Solid 版も同じ判定を使う)。
const RENDER_HEADER_CONTROL_SELECTOR =
  'button, input, select, textarea, a[href], label, [contenteditable]:not([contenteditable="false"]), ' +
  '[role="button"], [role="checkbox"], [role="switch"], [role="link"], [role="textbox"], [role="combobox"], [role="slider"]';

// target = イベントの target、headerCell = 見出しのセル(イベントの currentTarget)。
export const isFromRenderHeaderControl = (target: EventTarget | null, headerCell: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }
  const control = target.closest(RENDER_HEADER_CONTROL_SELECTOR);
  if (control === null) {
    return false;
  }
  // renderHeader の中身(= このヘッダーセル直下の .ssg-header-label の内側)にあるものだけを対象にします
  //   (グリッドの外側の祖先や、組み込みのボタンは対象外)。
  const label = control.closest('.ssg-header-label');
  return label !== null && label.parentElement === headerCell;
};

// 追加(1.3.0 / RV5-4): 細い列では、ホバーで出る操作群(つまみ / ⋮)が renderHeader の中のボタンを覆い、押すと列が選ばれて
//   ボタンの onClick が呼ばれていませんでした。ポインタが renderHeader の中のボタン等の上にある間は見出しのセルにこの属性を
//   付け、CSS(styles.css)で操作群を隠して下のボタンへ届くようにします。操作群が上に重なっていても分かるよう、要素の
//   矩形とポインタの位置で比べます(見出しの pointermove / pointerleave から呼ぶ。外れたら point は null)。
export const RENDER_HEADER_CONTROL_HOVER_ATTRIBUTE = 'data-ssg-header-control-hover';

export const syncRenderHeaderControlHover = (
  headerCell: Element,
  point: { readonly clientX: number; readonly clientY: number } | null,
): void => {
  let over = false;
  // 見出しのセルの最初の .ssg-header-label が直下のラベル(renderHeader の中身を入れる所)です。
  const label = point === null ? null : headerCell.querySelector('.ssg-header-label');
  if (label !== null && point !== null) {
    for (const control of label.querySelectorAll(RENDER_HEADER_CONTROL_SELECTOR)) {
      const rect = control.getBoundingClientRect();
      if (point.clientX >= rect.left && point.clientX < rect.right && point.clientY >= rect.top && point.clientY < rect.bottom) {
        over = true;
        break;
      }
    }
  }
  if (headerCell.hasAttribute(RENDER_HEADER_CONTROL_HOVER_ATTRIBUTE) !== over) {
    headerCell.toggleAttribute(RENDER_HEADER_CONTROL_HOVER_ATTRIBUTE, over);
  }
};