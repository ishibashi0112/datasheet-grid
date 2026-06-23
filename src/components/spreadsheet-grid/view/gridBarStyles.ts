import type { CSSProperties } from 'react';

// 統合(UI): バーは外枠 frame の内側に収め、本体との境界は 1px の divider のみで表します
//   (top は下境界 / bottom は上境界)。以前の外側 margin による「浮いたカード」分離を廃止しました。
export const getGridBarWrapperStyle = (
  position: 'top' | 'bottom',
): CSSProperties => ({
  borderBottom: position === 'top' ? '1px solid #d7dce3' : undefined,
  borderTop: position === 'bottom' ? '1px solid #d7dce3' : undefined,
});

// 統合(UI): top/bottom 共通の bar 本体スタイルです。個別の border / borderRadius は撤去し、
//   外枠 frame が単一の境界・角丸を担います。バーは本体と地続きのセクションになり、背景 #f8fafc は
//   ヘッダー行と同系色で連続感を出します。
export const gridBarContainerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 12px',
  backgroundColor: '#f8fafc',
  flexWrap: 'wrap',
};

// 追加: bar 内の左/右グループで共通利用する style です。
export const gridBarGroupStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
};

// 追加: top bar 左側のタイトル + summary 用 style です。
export const gridBarLeadingGroupStyle: CSSProperties = {
  ...gridBarGroupStyle,
  minWidth: 0,
  flex: '1 1 auto',
  color: '#334155',
  fontSize: 13,
};

// 追加: bar のタイトル表示用 style です。
export const gridBarTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#334155',
};

// 追加: 薄い badge / chip 表示用 style です。
export const gridBarChipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: 9999,
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  color: '#334155',
  fontSize: 12,
  whiteSpace: 'nowrap',
};

// 追加: top bar の件数 badge 用に、やや濃い背景の variant を定義します。
export const gridBarEmphasisChipStyle: CSSProperties = {
  ...gridBarChipStyle,
  backgroundColor: '#e2e8f0',
  border: '1px solid transparent',
  fontWeight: 600,
};

// 追加: Global Filter input の共通 style です。
export const gridBarInputStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  padding: '10px 12px',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  outline: 'none',
  backgroundColor: '#ffffff',
  // 追加: 入力文字色を明示して、dark/light やブラウザ差異で
  //       文字が見えなくなるのを防ぎます。
  color: '#0f172a',
  // 追加: キャレット色も明示します。
  caretColor: '#0f172a',
  // 追加: bar 内での可読性を安定させます。
  fontSize: 14,
  lineHeight: 1.4,
  // 追加: Chromium / WebKit 系で text fill が変わるケースに備えます。
  WebkitTextFillColor: '#0f172a',
};

// 追加: Global Filter input とクリアボタンを横並びにする wrapper です。
export const gridBarInputGroupStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  maxWidth: 420,
};

// 追加: Global Filter クリアボタンの共通 style です。
export const gridBarClearButtonStyle: CSSProperties = {
  flex: '0 0 auto',
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  color: '#475569',
  borderRadius: 8,
  padding: '10px 12px',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1,
  whiteSpace: 'nowrap',
};