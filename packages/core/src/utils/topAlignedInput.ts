// 追加(1.2.0 / 1.1.0 の確かめ直しの記録「背の高い上にそろえた行の 1 行のエディタ」): 背の高い行で上にそろえたセル
//   (`verticalAlign: 'top'`。auto-height の列は既定で上)の 1 行の入力欄(text / number / date / select のエディタと、IME の
//   変換中の入力受け)の文字を、セルの 1 行目にそろえます。
//
// 入力欄は文字を中身の箱の上下の真ん中に置くため、セルと同じ大きさの入力欄では文字が真ん中に出て、セルの文字(上にそろう)
//   から下へずれていました。入力欄の箱の大きさはセルのまま(枠と背景はセル全体を覆う)にして、
//   - 上の余白はセルの文字の上の余白と同じ 0.4em(styles.css の .ssg-body-cell--valign-top / auto-height の器)から枠線を引いた量
//     (複数行の入力欄と同じ。TextCellEditor の resolveMultilinePadding)、
//   - 行の間隔はセルと同じくページから受け継ぐ(line-height: inherit。1 行目の文字の高さをセルとそろえる)、
//   - 下の余白で中身の箱を 1 行ぶんの高さにする(1 行ぶんは height: auto にして測る)。
//   上にそろえないときはインラインの指定を外します(styles.css のとおり真ん中)。
// 変更(1.2.0 の確かめ直し C-N1): セルの上が見出し・固定行・固定したラベル行の帯の下に隠れたまま編集を始めたときは、文字を
//   見えている所の 1 行目へ下げます(hiddenTop = 隠れている高さ。resolveHiddenTopOf で測る)。これまでは文字がセルの 1 行目の
//   まま帯の下に入って見えなかった(1.1.0 までは真ん中に出て見えていた)。下げてもセルの下端より下へは出しません。
import { resolveGridVisibleBand } from './gridVisibleBand';
import { resolveElementScale } from '../logic/elementScale';

export const TOP_ALIGNED_PADDING_EM = 0.4;

// 入力欄の上のうち、見出し・固定行・固定したラベル行の帯の下に隠れている高さ(入力欄の中の px。隠れていなければ 0)。
export const resolveHiddenTopOf = (input: HTMLElement): number => {
  const band = resolveGridVisibleBand(input);
  if (band === null) {
    return 0;
  }
  const rect = input.getBoundingClientRect();
  const hidden = band.top - rect.top;
  if (hidden <= 0) {
    return 0;
  }
  return hidden / resolveElementScale(input, rect).y;
};

export const alignInputTextToTop = (
  input: HTMLInputElement,
  alignTop: boolean,
  boxHeight: number,
  hiddenTop = 0,
): void => {
  const style = input.style;
  if (!alignTop) {
    style.paddingTop = '';
    style.paddingBottom = '';
    style.lineHeight = '';
    return;
  }
  const height = style.height;
  style.lineHeight = 'inherit';
  style.paddingTop = '0px';
  style.paddingBottom = '0px';
  style.height = 'auto';
  const lineBox = input.clientHeight;
  style.height = height;
  const computed = getComputedStyle(input);
  const fontSize = Number.parseFloat(computed.fontSize) || 0;
  const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
  const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;
  const base = Math.max(0, Math.round(fontSize * TOP_ALIGNED_PADDING_EM - borderTop));
  const lowest = Math.max(0, boxHeight - borderTop - borderBottom - lineBox);
  const top = hiddenTop > 0 ? Math.max(base, Math.min(lowest, Math.round(base + hiddenTop))) : base;
  const bottom = Math.max(0, boxHeight - borderTop - borderBottom - top - lineBox);
  style.paddingTop = `${top}px`;
  style.paddingBottom = `${bottom}px`;
};