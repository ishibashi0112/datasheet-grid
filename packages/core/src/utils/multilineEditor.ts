// 追加(Solid 版 段階 1-2): 複数行の text エディタ(`editor: { type: 'text', multiline: true }`)の入力欄の大きさと改行の入れ方
//   (React 版の editors/TextCellEditor.tsx から移しました。DOM だけを見るので Solid 版と共用)。
//   入力欄は中身に合わせて下へ伸び(下限はセルの高さ、上限は表の見える範囲の下端まで。超える分は入力欄の中でスクロール)、
//   上下の余白は 1 行目をセルの文字にそろえる量です(段階 2 DU-14 / その確かめ直し N2-2・N3-2、1.0.2 / G-12 の見直し QB-4)。

// 1 行の高さが読めないとき(line-height: normal など)の値です。行の間隔はセルと同じくページから受け継ぐ(styles.css の
//   line-height: inherit)ので、余白の計算には実際の値を読みます。
const FALLBACK_LINE_HEIGHT = 20;

// 上にそろえたセルは、文字の上に 0.4em の余白があります(auto-height の列は中身の器 .ssg-autoheight-content、ほかの列はセル)。
//   エディタもその分から入力欄の上の枠線のぶんを引いた量を余白にします。
const TOP_ALIGNED_PADDING_EM = 0.4;

// 複数行の入力欄の上下の余白(px)。上にそろえたセルは 0.4em − 枠線、真ん中にそろえたセルは開いたときの中身の高さをセルの
//   真ん中に置く量(4 は上下の枠線 2px × 2)。開いたときにセルの高さと揃え方ごとに 1 回だけ決めます(打っている間に変えると、
//   改行を入れたときに文字が上下へ動くため)。
export const resolveMultilinePadding = (
  textarea: HTMLTextAreaElement,
  cellHeight: number,
  alignTop: boolean,
): number => {
  if (alignTop) {
    const style = getComputedStyle(textarea);
    const fontSize = Number.parseFloat(style.fontSize) || 0;
    const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
    return Math.max(0, Math.round(fontSize * TOP_ALIGNED_PADDING_EM - borderTop));
  }
  textarea.style.paddingTop = '0px';
  textarea.style.paddingBottom = '0px';
  textarea.style.height = '0px';
  const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || FALLBACK_LINE_HEIGHT;
  const textHeight = Math.max(textarea.scrollHeight, lineHeight);
  return Math.max(0, Math.floor((cellHeight - 4 - textHeight) / 2));
};

// 複数行の入力欄の高さを中身に合わせます。下限はセルの高さ、上限は表の見える範囲の下端まで(超える分は入力欄の中でスクロール)。
export const fitMultilineEditor = (textarea: HTMLTextAreaElement, cellHeight: number, padding: number): void => {
  textarea.style.paddingTop = `${padding}px`;
  textarea.style.paddingBottom = `${padding}px`;
  textarea.style.height = `${cellHeight}px`;
  const border = textarea.offsetHeight - textarea.clientHeight;
  const needed = textarea.scrollHeight + border;
  let limit = Number.POSITIVE_INFINITY;
  const scroller = textarea.closest('.ssg-scroll-container');
  if (scroller instanceof HTMLElement) {
    const scrollerRect = scroller.getBoundingClientRect();
    limit = scrollerRect.top + scroller.clientTop + scroller.clientHeight - textarea.getBoundingClientRect().top;
  }
  textarea.style.height = `${Math.max(cellHeight, Math.min(needed, limit))}px`;
};

// 修飾キー付きの Enter で改行を入れます。execCommand なら入力欄の「元に戻す」(Ctrl+Z)に載り、input イベントでドラフトも
//   更新されます(true を返す)。使えない環境では false で、呼んだ側が値を組み立てて入れ、キャレットを改行の後ろへ置きます
//   (insertNewlineText)。
export const insertNewlineByCommand = (): boolean =>
  typeof document.execCommand === 'function' && document.execCommand('insertText', false, '\n');

// execCommand が使えないときの改行の入れ方: 選択範囲を改行に置き換えた値と、その後ろのキャレットの位置。
export const insertNewlineText = (textarea: HTMLTextAreaElement): { value: string; caret: number } => {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  return { value: `${textarea.value.slice(0, start)}\n${textarea.value.slice(end)}`, caret: start + 1 };
};