// 追加(motion-7 / M-9): SSRM の書き戻し(dataSource.updateRows)のセル単位の保存状態を、描画中のセルへ data 属性で
//   直付けする DOM コントローラです(React 非依存)。serverSideRowModel の onWriteStateChange(pending → ok | failed |
//   cleared)を受け、rowKey × columnKey で DOM のセルを探して data-ssg-save を付け替えます。
//   - data 属性にするのは、React が管理する className と衝突しないため(編集確定後にアクティブセルが移って
//     className が書き換わっても消えない)。
//   - pending: 斜線 + 小さなスピナー(styles.css)。ok: ✓ バッジを出して OK_BADGE_MS 後に外す。failed: 揺れ + 赤い
//     フラッシュ + ✕ バッジ、セルの下に「保存に失敗しました」のチップを FAILED_CHIP_MS だけ出す(チップはシェル直下の
//     浮き要素で、スクロールで消える)。cleared: 印だけ外す。
//   - 印の付与は rAF へ遅らせます(楽観更新の再レンダーが同じイベント内で走るため、その後に付ける)。
//   - インジケーター(スピナー / バッジ)はセルの末尾に追加する実要素です(React のセル内容には触らない)。
import type { GridRowKey } from '../model/gridTypes.unbound';

type ReadonlyRef<V> = { readonly current: V };

export type SaveStatusEvent = {
  state: 'pending' | 'ok' | 'failed' | 'cleared';
  cells: ReadonlyArray<{ rowKey: GridRowKey; columnKeys: readonly string[] }>;
};

export type SaveStatusArgs = {
  scrollContainerRef: ReadonlyRef<HTMLElement | null>;
  // シェル要素(チップの配置基準。null なら scrollContainer を使う)。
  shellRef?: ReadonlyRef<HTMLElement | null>;
  enabled: boolean;
};

export type SaveStatusController = {
  update: (args: SaveStatusArgs) => void;
  handle: (event: SaveStatusEvent) => void;
  dispose: () => void;
};

export const SAVE_STATE_ATTRIBUTE = 'data-ssg-save';
export const SAVE_INDICATOR_CLASS_NAME = 'ssg-save-indicator';
export const SAVE_FAILED_CHIP_CLASS_NAME = 'ssg-save-failed-chip';
export const OK_BADGE_MS = 1300;
export const FAILED_BADGE_MS = 1300;
export const FAILED_CHIP_MS = 4000;
export const FAILED_CHIP_TEXT = '保存に失敗しました。値を戻しました';

const cssEscape = (value: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');

export const createSaveStatusController = (): SaveStatusController => {
  let args: SaveStatusArgs | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const frames = new Set<number>();
  let chip: HTMLElement | null = null;
  let chipTimer: ReturnType<typeof setTimeout> | null = null;
  let chipScrollTarget: HTMLElement | null = null;

  const later = (ms: number, fn: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    timers.add(timer);
  };

  const cellsOf = (event: SaveStatusEvent): HTMLElement[] => {
    const container = args?.scrollContainerRef.current;
    if (!container) {
      return [];
    }
    const found: HTMLElement[] = [];
    for (const cell of event.cells) {
      const rowSelector = `.ssg-body-row[data-row-key="${cssEscape(String(cell.rowKey))}"]`;
      for (const columnKey of cell.columnKeys) {
        container
          .querySelectorAll<HTMLElement>(`${rowSelector} .ssg-body-cell[data-ssg-col-key="${cssEscape(columnKey)}"]`)
          .forEach((el) => found.push(el));
      }
    }
    return found;
  };

  const setIndicator = (cell: HTMLElement, kind: 'pending' | 'ok' | 'failed' | null) => {
    let indicator = cell.querySelector<HTMLElement>(`:scope > .${SAVE_INDICATOR_CLASS_NAME}`);
    if (kind === null) {
      indicator?.remove();
      return;
    }
    if (!indicator) {
      indicator = document.createElement('span');
      indicator.className = SAVE_INDICATOR_CLASS_NAME;
      indicator.setAttribute('aria-hidden', 'true');
      cell.appendChild(indicator);
    }
    indicator.setAttribute('data-kind', kind);
    indicator.textContent = kind === 'ok' ? '✓' : kind === 'failed' ? '✕' : '';
  };

  const clearCell = (cell: HTMLElement) => {
    cell.removeAttribute(SAVE_STATE_ATTRIBUTE);
    setIndicator(cell, null);
  };

  const removeChip = () => {
    chip?.remove();
    chip = null;
    if (chipTimer !== null) {
      clearTimeout(chipTimer);
      timers.delete(chipTimer);
      chipTimer = null;
    }
    if (chipScrollTarget) {
      chipScrollTarget.removeEventListener('scroll', removeChip);
      chipScrollTarget = null;
    }
  };

  const showChip = (cell: HTMLElement) => {
    removeChip();
    const container = args?.scrollContainerRef.current;
    const shell = args?.shellRef?.current ?? container;
    if (!container || !shell) {
      return;
    }
    const cellRect = cell.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    chip = document.createElement('div');
    chip.className = SAVE_FAILED_CHIP_CLASS_NAME;
    chip.setAttribute('role', 'status');
    chip.textContent = FAILED_CHIP_TEXT;
    chip.style.left = `${Math.max(0, cellRect.left - shellRect.left)}px`;
    chip.style.top = `${cellRect.bottom - shellRect.top + 4}px`;
    shell.appendChild(chip);
    chipScrollTarget = container;
    container.addEventListener('scroll', removeChip, { passive: true });
    chipTimer = setTimeout(() => {
      chipTimer = null;
      removeChip();
    }, FAILED_CHIP_MS);
    timers.add(chipTimer);
  };

  const apply = (event: SaveStatusEvent) => {
    const cells = cellsOf(event);
    for (const cell of cells) {
      if (event.state === 'cleared') {
        clearCell(cell);
        continue;
      }
      cell.setAttribute(SAVE_STATE_ATTRIBUTE, event.state);
      setIndicator(cell, event.state);
      if (event.state === 'ok') {
        later(OK_BADGE_MS, () => {
          if (cell.getAttribute(SAVE_STATE_ATTRIBUTE) === 'ok') {
            clearCell(cell);
          }
        });
      } else if (event.state === 'failed') {
        later(FAILED_BADGE_MS, () => {
          if (cell.getAttribute(SAVE_STATE_ATTRIBUTE) === 'failed') {
            clearCell(cell);
          }
        });
      }
    }
    if (event.state === 'failed' && cells.length > 0) {
      showChip(cells[0]);
    }
  };

  return {
    update: (next) => {
      args = next;
    },
    handle: (event) => {
      if (!args?.enabled) {
        return;
      }
      if (typeof requestAnimationFrame !== 'function') {
        apply(event);
        return;
      }
      const frameId = requestAnimationFrame(() => {
        frames.delete(frameId);
        apply(event);
      });
      frames.add(frameId);
    },
    dispose: () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
      if (typeof cancelAnimationFrame === 'function') {
        for (const frameId of frames) {
          cancelAnimationFrame(frameId);
        }
      }
      frames.clear();
      removeChip();
      const container = args?.scrollContainerRef.current;
      container?.querySelectorAll<HTMLElement>(`[${SAVE_STATE_ATTRIBUTE}]`).forEach(clearCell);
      args = null;
    },
  };
};
