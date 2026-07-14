// 追加(editor: select): select エディタの純粋ロジック(初期ハイライト / ハイライト移動 /
//   タイプアヘッド / ドロップダウン配置)です。DOM 非依存のため単体テストで網羅します。
import type { GridSelectEditorOption } from '../model/gridTypes';

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