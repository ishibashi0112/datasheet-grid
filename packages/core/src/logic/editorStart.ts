// 追加(Solid 版 段階 1-2): 組み込みエディタを開くときの値と、確定するときの値の決め方(React 版の editors/ と CellEditorLayer.tsx
//   から移しました。Solid 版と共用)。
import { isNumberInputPrefix, normalizeNumberText, normalizeTypedDateText, toDateInputValue, toNumberInputText } from './editorValues';

// 文字から打ち始めたときの文字(select のタイプアヘッド / date の文字の欄)。F2 / Enter / ダブルクリックでの開始はセル値の
//   文字列が初期値なので undefined(audit RD-9 / 1.0.2 / J-12)。
export const resolveTypedStartText = (initialValue: string, cellValue: unknown): string | undefined =>
  initialValue !== String(cellValue ?? '') ? initialValue : undefined;

// number エディタを開く値と、type="text" で開くか。
//   - 初期値は type="number" が表示できる半角の数値表記に直します('1,234' / '１２' の文字列の値 → '1234' / '12')。
//   - 数値の書き始め("-" / "+" / "." など)は type="text" で開きます(type="number" の input は value に途中の数値を入れると
//     空にしてしまい、セルを選んで「-5」と打つと「5」になる)。
//   - 数値に直せない初期値(英字や空白から打ち始めた / 数値でない文字列の値)も text で開き、その文字をそのまま見せます
//     (type="number" は value に入れると空に見えるのに、確定ではその文字が書かれていた。FC-17)。
//   セッションの途中で type は切り替えません(キャレットが飛ぶため)。
export const resolveNumberEditorStart = (initialValue: string): { text: string; textMode: boolean } => {
  if (initialValue === '' || isNumberInputPrefix(initialValue)) {
    return { text: initialValue, textMode: initialValue !== '' };
  }
  const numberText = toNumberInputText(initialValue);
  return numberText !== null ? { text: numberText, textMode: false } : { text: initialValue, textMode: true };
};

// number エディタが確定する値。打った文字列のまま(列のパーサが全角や 3 桁区切りも数値に直す。読めない文字列は貼り付けと
//   同じくそのまま = 検査があれば印 / reject)で、text のセッションが書き始めのまま(「-」だけ等)なら空文字にします。
export const resolveNumberEditorCommitValue = (draft: string, textMode: boolean): string =>
  textMode && isNumberInputPrefix(normalizeNumberText(draft)) ? '' : draft;

// date エディタの文字のセッション(文字から打ち始めた)で確定する値。空は空(値を消す)、日付として読めれば 'YYYY-MM-DD'、
//   読めなければ null(呼ぶ側が「日付で入力してください」を出して編集を続ける)。IME をオンのまま打った全角の数字や
//   「2026年3月15日」も読みます(1.0.2 / J-12・レビュー QA-5)。
export const readTypedDateCommitValue = (value: unknown): string | null => {
  const text = String(value).trim();
  if (text === '') {
    return '';
  }
  const normalized = toDateInputValue(normalizeTypedDateText(text));
  return normalized === '' ? null : normalized;
};