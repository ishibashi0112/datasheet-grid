// 追加(SSR 回帰): useResolvedGridTheme が server render(renderToString)で throw しないことの
//   回帰テストです。getServerSnapshot 欠如時、React は SSR で
//   「Missing getServerSnapshot」エラーを投げます(website ドッグフーディングで発見)。
//   本テストは node 環境(window 未定義)で実行されることが前提です。
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useResolvedGridTheme } from './useResolvedGridTheme';
import type { GridTheme } from '../model/gridTypes';

// 変更(段階 2 DU-13): フックは修飾子クラス('ssg-theme-dark' / 'ssg-theme-class' / ライトはなし)を返す。
function Probe({ theme }: { theme: GridTheme }) {
  const resolved = useResolvedGridTheme(theme);
  return <span>{resolved ?? 'light'}</span>;
}

describe('useResolvedGridTheme(SSR)', () => {
  it('auto は server render で throw せず light 既定で描画する', () => {
    expect(renderToString(<Probe theme="auto" />)).toContain('light');
  });

  it('dark は server render でも dark を返す', () => {
    expect(renderToString(<Probe theme="dark" />)).toContain('ssg-theme-dark');
  });

  it('class は server render でも ssg-theme-class を返す(サーバーの描画から CSS でダークにできる)', () => {
    expect(renderToString(<Probe theme="class" />)).toContain('ssg-theme-class');
  });

  it('light は server render でも light を返す', () => {
    expect(renderToString(<Probe theme="light" />)).toContain('light');
  });
});