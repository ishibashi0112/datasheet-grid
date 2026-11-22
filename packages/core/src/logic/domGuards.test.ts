// @vitest-environment jsdom
// 追加(1.3.0 / RV5-4): renderHeader の中のボタンの上にポインタがある間だけ見出しのセルに属性を付けること。
import { describe, it, expect } from 'vitest';
import { RENDER_HEADER_CONTROL_HOVER_ATTRIBUTE, syncRenderHeaderControlHover } from './domGuards';

const rectOf = (left: number, top: number, width: number, height: number) =>
  ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

const makeHeader = () => {
  const cell = document.createElement('div');
  cell.className = 'ssg-header-cell';
  cell.innerHTML =
    '<div class="ssg-header-label ssg-header-label--custom"><span>A</span><button type="button">B</button></div>' +
    '<div class="ssg-header-actions"><button type="button" class="ssg-icon-btn">⋮</button></div>';
  const button = cell.querySelector('.ssg-header-label button') as HTMLButtonElement;
  button.getBoundingClientRect = () => rectOf(10, 0, 20, 20);
  const menu = cell.querySelector('.ssg-icon-btn') as HTMLButtonElement;
  menu.getBoundingClientRect = () => rectOf(40, 0, 20, 20);
  return cell;
};

describe('syncRenderHeaderControlHover', () => {
  it('renderHeader の中のボタンの上だけ属性を付け、外れたら外す(操作群のボタンは数えない)', () => {
    const cell = makeHeader();
    syncRenderHeaderControlHover(cell, { clientX: 15, clientY: 10 });
    expect(cell.hasAttribute(RENDER_HEADER_CONTROL_HOVER_ATTRIBUTE)).toBe(true);
    syncRenderHeaderControlHover(cell, { clientX: 45, clientY: 10 });
    expect(cell.hasAttribute(RENDER_HEADER_CONTROL_HOVER_ATTRIBUTE)).toBe(false);
    syncRenderHeaderControlHover(cell, { clientX: 15, clientY: 10 });
    syncRenderHeaderControlHover(cell, null);
    expect(cell.hasAttribute(RENDER_HEADER_CONTROL_HOVER_ATTRIBUTE)).toBe(false);
  });
});
