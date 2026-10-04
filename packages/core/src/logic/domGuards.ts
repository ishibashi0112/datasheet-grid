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

// 追加: input/select/textarea/button/contenteditable 配下では
//       grid のキーボードショートカットを発火させないための判定です。
export const shouldIgnoreGridKeydown = (eventTarget: EventTarget | null) => {
  if (!(eventTarget instanceof HTMLElement)) {
    return false;
  }

  // 変更(audit RD-2): contenteditable は "true" 以外(空文字 / plaintext-only)も編集可能なので
  //   "false" 以外を対象にします。
  const interactiveElement = eventTarget.closest(
    'input, textarea, select, button, [contenteditable]:not([contenteditable="false"])',
  );

  return interactiveElement !== null;
};