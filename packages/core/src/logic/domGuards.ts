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