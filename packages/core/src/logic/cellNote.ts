// 追加(G-3): セルのメモ(GridColumn.cellNote)の純粋ロジックです。
//   メモは state を持たず描画時に導出します(validate の mark 表示と同じ方針。描画中のセルだけ評価)。
//   表示はグリッドの既存カスタムツールチップ(data-ssg-tooltip。white-space: pre-line で \n を改行)を使い、
//   入力エラー(validate の mark)と同じセルでは「エラー → 改行 → メモ」の順につなぎます。

// cellNote の戻り値を正規化します。文字列以外 / 空文字 / 空白だけの文字列は「メモなし」(null)。
export const normalizeCellNote = (note: unknown): string | null =>
  typeof note === 'string' && note.trim() !== '' ? note : null;

// セルのツールチップ文言(data-ssg-tooltip の値)です。どちらも無ければ null(属性を付けない)。
export const resolveCellTooltipText = (
  invalidMessage: string | null,
  note: string | null,
): string | null => {
  if (invalidMessage !== null && note !== null) {
    return `${invalidMessage}\n${note}`;
  }
  return invalidMessage ?? note;
};