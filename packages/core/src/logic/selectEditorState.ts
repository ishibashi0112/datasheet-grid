// 追加(editor: select): select エディタの純粋ロジック(初期ハイライト / ハイライト移動 /
//   タイプアヘッド / ドロップダウン配置)です。DOM 非依存のため単体テストで網羅します。
import type { GridSelectEditorOption } from '../model/gridTypes.unbound';

// ドロップダウンの配置定数です(行高は styles.css の .ssg-select-editor-option と揃えます)。
export const SELECT_POPOVER_MIN_WIDTH = 180;
export const SELECT_OPTION_ROW_HEIGHT = 28;
export const SELECT_POPOVER_PADDING_Y = 4;
const SELECT_POPOVER_MAX_VISIBLE = 8;
const VIEWPORT_MARGIN = 8;
const OFFSET_Y = 2;

// タイプアヘッドのバッファ維持時間(ms)。これを超える無入力でバッファをリセットします。
export const SELECT_TYPEAHEAD_RESET_MS = 700;

// 現在のセル値に一致する候補を初期ハイライトにします(一致なしは先頭 0)。
//   候補 value は string 固定のため、セル生値は String 化して比較します。
export const resolveInitialHighlight = (
  options: GridSelectEditorOption[],
  currentValue: unknown,
): number => {
  const current = String(currentValue ?? '');
  const index = options.findIndex((option) => option.value === current);
  return index >= 0 ? index : 0;
};

// ハイライトを delta 分移動します(端で停止・ループなし)。候補 0 件は 0 を返します。
export const moveHighlight = (
  current: number,
  delta: number,
  optionCount: number,
): number => {
  if (optionCount <= 0) {
    return 0;
  }
  const next = current + delta;
  if (next < 0) {
    return 0;
  }
  if (next > optionCount - 1) {
    return optionCount - 1;
  }
  return next;
};

export type SelectTypeaheadState = {
  buffer: string;
  lastInputTime: number;
};

export const createTypeaheadState = (): SelectTypeaheadState => ({
  buffer: '',
  lastInputTime: 0,
});

// タイプアヘッド 1 打鍵分の状態遷移です。label 前方一致(locale 小文字化)の最初の候補 index を
//   返します(一致なしは null)。バッファは打鍵ごとに蓄積し、SELECT_TYPEAHEAD_RESET_MS 超の
//   無入力でリセットします。
export const typeaheadJump = (
  state: SelectTypeaheadState,
  key: string,
  now: number,
  options: GridSelectEditorOption[],
): { state: SelectTypeaheadState; index: number | null } => {
  const shouldReset = now - state.lastInputTime > SELECT_TYPEAHEAD_RESET_MS;
  const buffer = (shouldReset ? '' : state.buffer) + key.toLocaleLowerCase();
  const index = options.findIndex((option) =>
    option.label.toLocaleLowerCase().startsWith(buffer),
  );
  return {
    state: { buffer, lastInputTime: now },
    index: index >= 0 ? index : null,
  };
};

export type SelectPopoverPlacement = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

// アンカー(編集セル input)の viewport rect からドロップダウンの fixed 配置を計算します。
//   幅は max(セル幅, MIN_WIDTH) を左右マージンでクランプ、縦は下に収まらなければ上へフリップ
//   (useFilterPopoverController と同じ規則)します。
export const computeSelectPopoverPlacement = (
  anchorRect: { left: number; top: number; bottom: number; width: number },
  optionCount: number,
  viewportWidth: number,
  viewportHeight: number,
): SelectPopoverPlacement => {
  const width = Math.max(anchorRect.width, SELECT_POPOVER_MIN_WIDTH);
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
  const left = Math.min(Math.max(anchorRect.left, VIEWPORT_MARGIN), maxLeft);
  const listHeight =
    Math.min(Math.max(optionCount, 1), SELECT_POPOVER_MAX_VISIBLE) *
      SELECT_OPTION_ROW_HEIGHT +
    SELECT_POPOVER_PADDING_Y * 2;
  const belowTop = anchorRect.bottom + OFFSET_Y;
  const fitsBelow = belowTop + listHeight <= viewportHeight - VIEWPORT_MARGIN;
  const top = fitsBelow
    ? belowTop
    : Math.max(VIEWPORT_MARGIN, anchorRect.top - OFFSET_Y - listHeight);
  return { left, top, width, maxHeight: listHeight };
};
// 追加(1.0.2 / 2026-11-09 実アプリの総点検 E-08): IME で確定した文字(日本語の名前など)で候補を探します。label がその文字で
//   始まる最初の候補、無ければ label にその文字を含む最初の候補(一致なしは null)。印字キーのタイプアヘッド(前方一致だけ)と
//   違い、確定した 1 つの語で引くので途中に含む候補も探します。
// 変更(1.0.2 の確かめ直し): 全角の英数字・記号と全角スペースは半角に寄せて比べます(IME がオンのまま英字を打つと「ｓ」の
//   ような全角で確定し、英語の名前の候補へ移らなかった)。候補の label の側も同じに寄せます。
const FULL_WIDTH_ASCII_PATTERN = /[\uFF01-\uFF5E]/g;
const foldComposedText = (text: string): string =>
  text
    .replace(FULL_WIDTH_ASCII_PATTERN, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .toLocaleLowerCase();
export const findOptionByComposedText = (
  options: GridSelectEditorOption[],
  text: string,
): number | null => {
  const query = foldComposedText(text).trim();
  if (query === '') {
    return null;
  }
  const labels = options.map((option) => foldComposedText(option.label));
  const prefix = labels.findIndex((label) => label.startsWith(query));
  if (prefix >= 0) {
    return prefix;
  }
  const contains = labels.findIndex((label) => label.includes(query));
  return contains >= 0 ? contains : null;
};