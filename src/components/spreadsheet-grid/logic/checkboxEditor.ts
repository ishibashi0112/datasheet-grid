// 追加(editor: checkbox): checkbox エディタ(直接トグル方式)の純粋ロジックです。
//   値マッピングは checkedValue(既定 true)/ uncheckedValue(既定 false)。checked 判定は
//   Object.is 一致のみで、それ以外の値はすべて unchecked 扱いです(indeterminate 表示は対象外)。
type CheckboxValueOptions = {
  checkedValue?: unknown;
  uncheckedValue?: unknown;
};

// checked / unchecked の実値を解決します(未指定は true / false)。
export const resolveCheckboxValues = (
  editor: CheckboxValueOptions,
): { checkedValue: unknown; uncheckedValue: unknown } => ({
  checkedValue: editor.checkedValue ?? true,
  uncheckedValue: editor.uncheckedValue ?? false,
});

export const isCheckboxChecked = (
  value: unknown,
  editor: CheckboxValueOptions,
): boolean => Object.is(value, resolveCheckboxValues(editor).checkedValue);

export const toggleCheckboxValue = (
  value: unknown,
  editor: CheckboxValueOptions,
): unknown => {
  const { checkedValue, uncheckedValue } = resolveCheckboxValues(editor);
  return Object.is(value, checkedValue) ? uncheckedValue : checkedValue;
};

// checkbox の既定パーサです(ペースト / クリア経路用)。'' → uncheckedValue /
//   checked・unchecked の文字列表現に一致 → 対応値 / 'true'・'1'(大文字小文字無視)→ checked /
//   それ以外 → uncheckedValue(2 値列に不正値を持ち込まない)。
export const parseCheckboxEditorValue = (
  raw: string,
  editor: CheckboxValueOptions,
): unknown => {
  const { checkedValue, uncheckedValue } = resolveCheckboxValues(editor);
  if (raw === '') {
    return uncheckedValue;
  }
  if (raw === String(checkedValue)) {
    return checkedValue;
  }
  if (raw === String(uncheckedValue)) {
    return uncheckedValue;
  }
  const lowered = raw.toLowerCase();
  if (lowered === 'true' || lowered === '1') {
    return checkedValue;
  }
  return uncheckedValue;
};