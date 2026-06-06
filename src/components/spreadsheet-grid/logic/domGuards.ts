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

  const interactiveElement = eventTarget.closest(
    'input, textarea, select, button, [contenteditable="true"]',
  );

  return interactiveElement !== null;
};