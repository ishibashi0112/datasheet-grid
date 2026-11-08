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
//   - 追加(dogfood DF-14): 保存中のセルを覚えておき、保存中の間はスクロール等で描き直されたセル(仮想化で外れて戻った
//     行 / 列)にも保存中の印を付け直します(これまでは印が消え、保存中なのに普通のセルに見えていた)。
import type { GridRowKey } from '../model/gridTypes.unbound';
import { isInsideDetailCardOf } from '../logic/detailRow';
import { DEFAULT_GRID_LOCALE_TEXT } from '../logic/localeText';

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
  // 追加(英語対応): 保存に失敗したセルの下に出す文言(localeText の saveFailedCell。未指定 = 日本語の既定)。
  failedText?: string;
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
  // 追加(dogfood DF-14): 保存中のセル(rowKey の文字列 → 列キー)。印を付け直すために使います。
  const pendingCells = new Map<string, Set<string>>();
  let observer: MutationObserver | null = null;
  let observedContainer: HTMLElement | null = null;
  let reapplyFrame: number | null = null;

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
          .forEach((el) => {
            // 変更(1.0 前の最終チェック FC-15): 展開行の中の入れ子のグリッドのセルには付けません。
            if (!isInsideDetailCardOf(container, el)) found.push(el);
          });
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
    chip.textContent = args?.failedText ?? DEFAULT_GRID_LOCALE_TEXT.saveFailedCell;
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

  // 追加(dogfood DF-14): 保存中のセルの記録と、描き直されたセルへの付け直し。
  const stopObserving = () => {
    observer?.disconnect();
    observer = null;
    observedContainer = null;
    if (reapplyFrame !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(reapplyFrame);
      }
      frames.delete(reapplyFrame);
      reapplyFrame = null;
    }
  };

  const reapplyPending = () => {
    const container = args?.scrollContainerRef.current;
    if (!container || pendingCells.size === 0) {
      return;
    }
    container.querySelectorAll<HTMLElement>('.ssg-body-row[data-row-key]').forEach((row) => {
      const columnKeys = pendingCells.get(row.getAttribute('data-row-key') ?? '');
      if (!columnKeys) {
        return;
      }
      row.querySelectorAll<HTMLElement>('.ssg-body-cell[data-ssg-col-key]').forEach((cell) => {
        if (
          columnKeys.has(cell.getAttribute('data-ssg-col-key') ?? '') &&
          cell.getAttribute(SAVE_STATE_ATTRIBUTE) !== 'pending' &&
          !isInsideDetailCardOf(container, cell)
        ) {
          cell.setAttribute(SAVE_STATE_ATTRIBUTE, 'pending');
          setIndicator(cell, 'pending');
        }
      });
    });
  };

  const scheduleReapply = () => {
    if (reapplyFrame !== null) {
      return;
    }
    if (typeof requestAnimationFrame !== 'function') {
      reapplyPending();
      return;
    }
    const frameId = requestAnimationFrame(() => {
      frames.delete(frameId);
      if (reapplyFrame === frameId) {
        reapplyFrame = null;
      }
      reapplyPending();
    });
    reapplyFrame = frameId;
    frames.add(frameId);
  };

  const syncObserver = () => {
    const container = args?.scrollContainerRef.current ?? null;
    if (pendingCells.size === 0 || !container || typeof MutationObserver !== 'function') {
      stopObserving();
      return;
    }
    if (observer && observedContainer === container) {
      return;
    }
    stopObserving();
    observer = new MutationObserver(scheduleReapply);
    observer.observe(container, { childList: true, subtree: true });
    observedContainer = container;
  };

  const trackPending = (event: SaveStatusEvent) => {
    for (const cell of event.cells) {
      const rowKey = String(cell.rowKey);
      if (event.state === 'pending') {
        const columnKeys = pendingCells.get(rowKey) ?? new Set<string>();
        for (const columnKey of cell.columnKeys) {
          columnKeys.add(columnKey);
        }
        pendingCells.set(rowKey, columnKeys);
        continue;
      }
      const columnKeys = pendingCells.get(rowKey);
      if (!columnKeys) {
        continue;
      }
      for (const columnKey of cell.columnKeys) {
        columnKeys.delete(columnKey);
      }
      if (columnKeys.size === 0) {
        pendingCells.delete(rowKey);
      }
    }
    syncObserver();
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
      if (!next.enabled) {
        pendingCells.clear();
      }
      syncObserver();
    },
    handle: (event) => {
      if (!args?.enabled) {
        return;
      }
      trackPending(event);
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
      reapplyFrame = null;
      pendingCells.clear();
      stopObserving();
      removeChip();
      const container = args?.scrollContainerRef.current;
      container?.querySelectorAll<HTMLElement>(`[${SAVE_STATE_ATTRIBUTE}]`).forEach((cell) => {
        if (!isInsideDetailCardOf(container, cell)) clearCell(cell);
      });
      args = null;
    },
  };
};
