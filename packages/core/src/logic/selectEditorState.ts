// 追加(editor: select): select エディタの純粋ロジック(初期ハイライト / ハイライト移動 /
//   タイプアヘッド / ドロップダウン配置)です。DOM 非依存のため単体テストで網羅します。
import type { EditorCommitDirection, EditorEnterMove, GridSelectEditorOption } from '../model/gridTypes.unbound';
import { resolveEnterDirection } from './editorKeys';

// ドロップダウンの配置定数です(行高は styles.css の .ssg-select-editor-option と揃えます)。
export const SELECT_POPOVER_MIN_WIDTH = 180;
export const SELECT_OPTION_ROW_HEIGHT = 28;
export const SELECT_POPOVER_PADDING_Y = 4;
// 追加(1.2.0 の見直し QH-1): 一覧の枠線(styles.css の .ssg-select-editor-popover は box-sizing: border-box なので、高さに枠線も
//   入れないと中身が 2px 足りず、候補が全部見えていても一覧がスクロールしていた)。
export const SELECT_POPOVER_BORDER_Y = 1;
const SELECT_POPOVER_MAX_VISIBLE = 8;
const VIEWPORT_MARGIN = 8;
const OFFSET_Y = 2;

// タイプアヘッドのバッファ維持時間(ms)。これを超える無入力でバッファをリセットします。
export const SELECT_TYPEAHEAD_RESET_MS = 700;

// 現在のセル値に一致する候補を初期ハイライトにします(一致なしは先頭 0)。
//   候補 value は string 固定のため、セル生値は String 化して比較します。
export const resolveInitialHighlight = (
  options: readonly GridSelectEditorOption[],
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
  options: readonly GridSelectEditorOption[],
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
// 変更(1.2.0 の見直し QH-1): 候補の行の高さを渡せるようにしました(タッチが主の端末は CSS の (pointer: coarse) で 44px に
//   なるため、28px のまま見積もると一覧の高さが足りずスクロールが要った)。省略時は SELECT_OPTION_ROW_HEIGHT。
export const SELECT_OPTION_ROW_HEIGHT_COARSE = 44;
export const resolveSelectOptionRowHeight = (): number =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
    ? SELECT_OPTION_ROW_HEIGHT_COARSE
    : SELECT_OPTION_ROW_HEIGHT;
export const computeSelectPopoverPlacement = (
  anchorRect: { left: number; top: number; bottom: number; width: number },
  optionCount: number,
  viewportWidth: number,
  viewportHeight: number,
  rowHeight: number = SELECT_OPTION_ROW_HEIGHT,
): SelectPopoverPlacement => {
  const width = Math.max(anchorRect.width, SELECT_POPOVER_MIN_WIDTH);
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
  const left = Math.min(Math.max(anchorRect.left, VIEWPORT_MARGIN), maxLeft);
  const listHeight =
    Math.min(Math.max(optionCount, 1), SELECT_POPOVER_MAX_VISIBLE) * rowHeight +
    SELECT_POPOVER_PADDING_Y * 2 +
    SELECT_POPOVER_BORDER_Y * 2;
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
  options: readonly GridSelectEditorOption[],
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

// 追加(dogfood DF-13): PageUp / PageDown で動かす候補の数です。
export const SELECT_PAGE_STEP = 8;

// 追加(Solid 版 段階 1-2): select エディタのキーの割り当て(React 版の editors/SelectCellEditor.tsx と同じ。Solid 版が使います)。
//   React 版は同じ割り当てを展開したまま持ちます(この関数へ寄せるとフル版が 0.08KB 増えるため。変えるときは両方を直す。
//   Solid 版の React 版と並べて比べるテストが差を見つけます)。IME の変換中のキーは呼ぶ側が先に除きます(変換の始まりに表示中の名前を選ぶため)。割り当てたキーは preventDefault して
//   から呼ぶ側の関数を呼び、それ以外は既定の動作のままにします。
//   - ArrowUp / ArrowDown は 1 つずつ、Home / End は先頭 / 末尾、PageUp / PageDown は SELECT_PAGE_STEP 件ずつ(端で止まる。
//     候補が無いときの Home / End / PageUp / PageDown は何もしない。これまではブラウザの既定の動作でグリッドがスクロールし、
//     エディタが画面の外へ出ていた。DF-13)。onMove には今のハイライトから行き先を決める関数を渡します
//   - Enter はハイライト中の候補で確定して enterMove の向きへ、Tab は左右へ、Escape は取り消し
//   - 修飾キー(Ctrl / ⌘ / Alt)の無い印字キーはタイプアヘッド(label の前方一致へ)
export type SelectEditorKeyEventLike = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
};

export type SelectEditorKeyOptions = {
  optionCount: number;
  enterMove: EditorEnterMove | undefined;
  onMove: (next: (current: number) => number) => void;
  onCommit: (direction: EditorCommitDirection | undefined) => void;
  onCancel: () => void;
  onTypeahead: (key: string) => void;
};

export const handleSelectEditorKeyDown = (event: SelectEditorKeyEventLike, options: SelectEditorKeyOptions): void => {
  const { key } = event;
  const count = options.optionCount;
  if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End' || key === 'PageUp' || key === 'PageDown') {
    event.preventDefault();
    if (key === 'ArrowDown' || key === 'ArrowUp' || count > 0) {
      options.onMove((current) => moveSelectHighlight(key, current, count));
    }
  } else if (key === 'Enter' || key === 'Tab') {
    event.preventDefault();
    options.onCommit(key === 'Enter' ? resolveEnterDirection(options.enterMove) : event.shiftKey ? 'left' : 'right');
  } else if (key === 'Escape') {
    event.preventDefault();
    options.onCancel();
  } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    options.onTypeahead(key);
  }
};

// 上下の矢印 / Home / End / PageUp / PageDown の行き先(端で止まる)。ハイライトが無い(-1)ときの PageUp / PageDown は先頭から
//   数えます。
export const moveSelectHighlight = (key: string, current: number, optionCount: number): number => {
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    return moveHighlight(current, key === 'ArrowDown' ? 1 : -1, optionCount);
  }
  if (key === 'Home' || key === 'End') {
    return key === 'Home' ? 0 : optionCount - 1;
  }
  const base = current < 0 ? 0 : current;
  return Math.min(Math.max(base + (key === 'PageDown' ? SELECT_PAGE_STEP : -SELECT_PAGE_STEP), 0), optionCount - 1);
};

// 開いたときのハイライトとタイプアヘッドの状態(React 版の SelectCellEditor と同じ。React 版は大きさのため展開したまま)。印字キー / IME 確定で編集を始めたとき(initialText)は、タイプアヘッドを
//   1 回適用した状態から始めます(続けて打つと前方一致を伸ばせるよう、バッファも引き継ぐ。audit RD-9)。一致が無ければ今の値。
export const resolveSelectEditorStart = (
  options: readonly GridSelectEditorOption[],
  value: unknown,
  initialText: string | undefined,
  now: number,
): { highlight: number; typeahead: SelectTypeaheadState } => {
  const fallback = resolveInitialHighlight(options, value);
  if (!initialText) {
    return { highlight: fallback, typeahead: createTypeaheadState() };
  }
  const result = typeaheadJump(createTypeaheadState(), initialText, now, options);
  return { highlight: result.index ?? fallback, typeahead: result.state };
};