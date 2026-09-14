// 追加(SF-ENTER): set フィルター popover の「検索一致」と「Enter 確定」の純関数です。
//   ColumnFilterPopover(view)からの非コンポーネント export は react-refresh 制約
//   (eslint の only-export-components = baseline 対象)に触れるため、logic 層に置いて
//   view とテストで共有します。view 側の表示リスト(visibleOptions)と Enter 確定の
//   再マッチが同じ filterSetOptionsBySearch を通ることで、一致基準の食い違いを
//   構造的に防ぎます。

// select / set フィルター候補の最小型です(view の ColumnFilterPopoverOption と構造一致)。
export type SetFilterSearchOption = {
  label: string;
  value: string;
};

// set フィルターの検索マッチです(label の部分一致・大文字小文字無視・前後空白は無視)。
//   空検索は入力配列をそのまま返します(同一参照 = memo に優しい)。
export const filterSetOptionsBySearch = <O extends SetFilterSearchOption>(
  options: O[],
  searchText: string,
): O[] => {
  const normalized = searchText.trim().toLowerCase();
  if (!normalized) {
    return options;
  }
  return options.filter((option) =>
    option.label.toLowerCase().includes(normalized),
  );
};

// 検索ボックスの Enter 確定(Excel の「検索 → OK」相当)の振る舞い判定です。
//   - 空検索('close'): チェック操作は即時適用済みのため、現状を確定として popover を
//     閉じるだけです(Excel の OK と等価)。
//   - 一致 0 件('none'): 何もしません。include{} を適用すると全行が消えるためです
//     (Excel も一致 0 件では OK を無効化します)。
//   - 一致あり('replace'): 選択を「一致値のみ」へ置換して閉じます。既存選択は解除されます
//     (積み増しは従来どおり(検索結果をすべて選択)チェックで行えます = 役割分担)。
export type SetFilterEnterAction =
  | { kind: 'close' }
  | { kind: 'none' }
  | { kind: 'replace'; values: string[] };

export const resolveSetFilterEnterAction = (
  options: SetFilterSearchOption[],
  searchText: string,
): SetFilterEnterAction => {
  if (!searchText.trim()) {
    return { kind: 'close' };
  }
  const matched = filterSetOptionsBySearch(options, searchText);
  if (matched.length === 0) {
    return { kind: 'none' };
  }
  return { kind: 'replace', values: matched.map((option) => option.value) };
};