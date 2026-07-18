// 追加(SSR 回帰): useResolvedGridTheme が server render(renderToString)で throw しないことの
//   回帰テストです。getServerSnapshot 欠如時、React は SSR で
//   「Missing getServerSnapshot」エラーを投げます(website ドッグフーディングで発見)。
//   本テストは node 環境(window 未定義)で実行されることが前提です。
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useResolvedGridTheme } from './useResolvedGridTheme';
import type { GridTheme } from '../model/gridTypes';

function Probe({ theme }: { theme: GridTheme }) {
  const resolved = useResolvedGridTheme(theme);
  return <span>{resolved}</span>;
}

describe('useResolvedGridTheme(SSR)', () => {
  it('auto は server render で throw せず light 既定で描画する', () => {
    expect(renderToString(<Probe theme="auto" />)).toContain('light');
  });

  it('dark は server render でも dark を返す', () => {
    expect(renderToString(<Probe theme="dark" />)).toContain('dark');
  });

  it('light は server render でも light を返す', () => {
    expect(renderToString(<Probe theme="light" />)).toContain('light');
  });
});