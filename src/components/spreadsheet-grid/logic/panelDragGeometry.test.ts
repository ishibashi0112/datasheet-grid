// 追加(FM-4)の単体テスト: clampPanelDragPosition(パネルドラッグ位置のビューポート clamp)の
//   仕様固定です。左右は [8, vw - 幅 - 8]、上下は [8, vh - 40](下方向はヘッダー 40px が
//   必ず画面内に残る = 掴み直し可能の保証)。極小画面では左端 margin を優先します。
import { describe, it, expect } from 'vitest';
import {
  clampPanelDragPosition,
  PANEL_DRAG_MIN_VISIBLE,
  PANEL_DRAG_VIEWPORT_MARGIN,
} from './panelDragGeometry';

const base = { panelWidth: 360, viewportWidth: 1024, viewportHeight: 768 };

describe('clampPanelDragPosition', () => {
  it('範囲内の位置はそのまま返す', () => {
    expect(clampPanelDragPosition({ top: 100, left: 200, ...base })).toEqual({
      top: 100,
      left: 200,
    });
  });

  it('左は margin(8)未満にならない', () => {
    expect(clampPanelDragPosition({ top: 100, left: -50, ...base })).toEqual({
      top: 100,
      left: PANEL_DRAG_VIEWPORT_MARGIN,
    });
  });

  it('右は viewportWidth - panelWidth - margin を超えない', () => {
    expect(clampPanelDragPosition({ top: 100, left: 9999, ...base })).toEqual({
      top: 100,
      left: 1024 - 360 - PANEL_DRAG_VIEWPORT_MARGIN,
    });
  });

  it('上は margin(8)未満にならない', () => {
    expect(clampPanelDragPosition({ top: -20, left: 200, ...base })).toEqual({
      top: PANEL_DRAG_VIEWPORT_MARGIN,
      left: 200,
    });
  });

  it('下はヘッダー可視量(40px)がビューポート内に残る位置で止まる', () => {
    expect(clampPanelDragPosition({ top: 9999, left: 200, ...base })).toEqual({
      top: 768 - PANEL_DRAG_MIN_VISIBLE,
      left: 200,
    });
  });

  it('ビューポートよりパネルが広い極小画面では左端 margin に張り付く', () => {
    expect(
      clampPanelDragPosition({
        top: 100,
        left: 300,
        panelWidth: 2000,
        viewportWidth: 500,
        viewportHeight: 768,
      }),
    ).toEqual({ top: 100, left: PANEL_DRAG_VIEWPORT_MARGIN });
  });
});