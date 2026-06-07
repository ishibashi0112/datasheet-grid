import type { CSSProperties } from 'react';

// 追加: top/bottom 共通の外側余白を返します。
export const getGridBarWrapperStyle = (
  position: 'top' | 'bottom',
): CSSProperties => ({
  marginBottom: position === 'top' ? 12 : 0,
  marginTop: position === 'bottom' ? 12 : 0,
});

// 追加: top/bottom 共通の bar 本体スタイルです。
export const gridBarContainerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 12px',
  border: '1px solid #d7dce3',
  borderRadius: 12,
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
  maxWidth: 320,
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