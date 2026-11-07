// 追加(非依存化 ③-19): 行ドラッグコントローラの単体テストです。スロット解決 / キャンセル / pointerId フィルタ等は
//   hooks/useRowDragController.test.ts(hook 経由)が担うため、ここではコントローラ固有の契約(ドラッグ中行の
//   淡色属性の付け外し、dispose の後始末、update で enabled が切り替わること)を検証します。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

import {
  createRowDragController,
  type RowDragArgs,
  type RowDragHandlePointerEvent,
} from './rowDragController';
import { createUniformRowMetrics } from '../logic/verticalGeometry';

const makeRect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

// 行高 10px × 10 行。コンテナと中央ペインは原点 (0, 0)、高さ 100。
const makeArgs = () => {
  const container = document.createElement('div');
  container.getBoundingClientRect = () => makeRect(0, 0, 200, 100);
  Object.defineProperty(container, 'clientWidth', { value: 200 });
  Object.defineProperty(container, 'clientHeight', { value: 100 });
  Object.defineProperty(container, 'scrollHeight', { value: 100 });
  for (let i = 0; i < 10; i += 1) {
    const row = document.createElement('div');
    row.className = 'ssg-body-row';
    row.dataset.rowIndex = String(i);
    container.appendChild(row);
  }
  document.body.appendChild(container);
  const body = document.createElement('div');
  body.getBoundingClientRect = () => makeRect(0, 0, 200, 100);
  const commitRowMove = vi.fn<(from: number, to: number) => void>();
  const args: RowDragArgs = {
    enabled: true,
    rowMetrics: createUniformRowMetrics(10, 10),
    headerHeight: 0,
    verticalScaleFactor: 1,
    windowBaseOffsetPx: 0,
    scrollContainerRef: { current: container },
    bodyScrollRef: { current: body },
    leftIndicatorRef: { current: document.createElement('div') },
    centerIndicatorRef: { current: document.createElement('div') },
    rightIndicatorRef: { current: document.createElement('div') },
    getRowDragLabel: (index) => `行 ${index}`,
    commitRowMove,
  };
  return { args, container, commitRowMove };
};

const handleEvent = (overrides: Partial<RowDragHandlePointerEvent> = {}): RowDragHandlePointerEvent => ({
  button: 0,
  pointerId: 1,
  clientX: 20,
  clientY: 15,
  currentTarget: { setPointerCapture: () => {}, releasePointerCapture: () => {} },
  preventDefault: () => {},
  stopPropagation: () => {},
  ...overrides,
});

const dispatchPointer = (type: string, pointerId: number, clientX: number, clientY: number) => {
  const event = new window.PointerEvent(type, { pointerId, clientX, clientY, bubbles: true });
  if (event.pointerId !== pointerId) {
    Object.defineProperty(event, 'pointerId', { value: pointerId });
  }
  window.dispatchEvent(event);
};

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.cursor = '';
  document.body.innerHTML = '';
});

describe('rowDragController', () => {
  it('掴んだ行に淡色属性を付け、ガイド線を出し、up で commitRowMove(from, to) を呼んで属性を外す', () => {
    const controller = createRowDragController();
    const { args, container, commitRowMove } = makeArgs();
    controller.update(args);

    // 行 1(y=10..20)を掴む。
    controller.onRowDragHandlePointerDown(1, handleEvent());
    const row1 = container.querySelector('[data-row-index="1"]')!;
    expect(row1.hasAttribute('data-ssg-row-dragging')).toBe(true);
    expect(document.querySelector('[data-grid-drag-ghost]')?.textContent).toBe('行 1');
    // 直上 / 直下(slot 1 / 2)はガイド線なし。
    expect(args.centerIndicatorRef.current?.style.display).toBe('none');

    // y=47 → slot 5(行 4 の後半)= 行 4 の下(y=50)にガイド線。
    dispatchPointer('pointermove', 1, 20, 47);
    expect(args.centerIndicatorRef.current?.style.display).toBe('block');
    expect(args.centerIndicatorRef.current?.style.top).toBe('50px');

    dispatchPointer('pointerup', 1, 20, 47);
    expect(commitRowMove).toHaveBeenCalledWith(1, 4);
    expect(row1.hasAttribute('data-ssg-row-dragging')).toBe(false);
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    expect(document.body.style.cursor).toBe('');
    controller.dispose();
  });

  it('ドラッグ中に dispose すると属性 / ゴースト / cursor / window リスナーを後始末する', () => {
    const controller = createRowDragController();
    const { args, container, commitRowMove } = makeArgs();
    controller.update(args);
    controller.onRowDragHandlePointerDown(2, handleEvent());
    controller.dispose();
    const row2 = container.querySelector('[data-row-index="2"]')!;
    expect(row2.hasAttribute('data-ssg-row-dragging')).toBe(false);
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    expect(document.body.style.cursor).toBe('');
    dispatchPointer('pointerup', 1, 20, 80);
    expect(commitRowMove).not.toHaveBeenCalled();
  });

  // 追加(audit C-8): ウィンドウがフォーカスを失ったらキャンセル(pointerup を取りこぼしても後片付けが残らない)。
  it('ドラッグ中にウィンドウが blur したらキャンセルし、その後の up でも確定しない', () => {
    const controller = createRowDragController();
    const { args, container, commitRowMove } = makeArgs();
    controller.update(args);
    controller.onRowDragHandlePointerDown(1, handleEvent());
    dispatchPointer('pointermove', 1, 20, 47);
    window.dispatchEvent(new Event('blur'));
    expect(container.querySelector('[data-row-index="1"]')?.hasAttribute('data-ssg-row-dragging')).toBe(false);
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    expect(args.centerIndicatorRef.current?.style.display).toBe('none');
    expect(document.body.style.cursor).toBe('');
    dispatchPointer('pointerup', 1, 20, 47);
    expect(commitRowMove).not.toHaveBeenCalled();
    controller.dispose();
  });

  // 追加(audit C-9): ドラッグ中に別のポインタでハンドルを押しても始め直さない(前のポインタの up で前の行のまま確定)。
  //   同じポインタで押し直したときは前のドラッグを取り消して始め直す。
  it('ドラッグ中の 2 本目のポインタは無視し、同じポインタの押し直しは前のドラッグを取り消して始め直す', () => {
    const controller = createRowDragController();
    const { args, container, commitRowMove } = makeArgs();
    controller.update(args);
    controller.onRowDragHandlePointerDown(1, handleEvent());
    controller.onRowDragHandlePointerDown(6, handleEvent({ pointerId: 2, clientY: 65 }));
    expect(container.querySelector('[data-row-index="6"]')?.hasAttribute('data-ssg-row-dragging')).toBe(false);
    dispatchPointer('pointerup', 2, 20, 85);
    expect(commitRowMove).not.toHaveBeenCalled();
    dispatchPointer('pointermove', 1, 20, 47);
    dispatchPointer('pointerup', 1, 20, 47);
    expect(commitRowMove).toHaveBeenCalledTimes(1);
    expect(commitRowMove).toHaveBeenCalledWith(1, 4);

    controller.onRowDragHandlePointerDown(1, handleEvent());
    controller.onRowDragHandlePointerDown(6, handleEvent({ clientY: 65 }));
    expect(container.querySelector('[data-row-index="1"]')?.hasAttribute('data-ssg-row-dragging')).toBe(false);
    expect(container.querySelector('[data-row-index="6"]')?.hasAttribute('data-ssg-row-dragging')).toBe(true);
    expect(document.querySelectorAll('[data-grid-drag-ghost]')).toHaveLength(1);
    dispatchPointer('pointermove', 1, 20, 27);
    dispatchPointer('pointerup', 1, 20, 27);
    expect(commitRowMove).toHaveBeenCalledTimes(2);
    expect(commitRowMove).toHaveBeenLastCalledWith(6, 3);
    controller.dispose();
  });

  it('update で enabled=false にすると以後のドラッグは開始しない', () => {
    const controller = createRowDragController();
    const { args } = makeArgs();
    controller.update({ ...args, enabled: false });
    controller.onRowDragHandlePointerDown(0, handleEvent());
    expect(document.body.style.cursor).toBe('');
    expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
    controller.dispose();
  });

  // 追加(motion-8 / M-11): live 方式。掴んだ行がポインタに追従し、通る先の行が退避する。確定で commitRowMove、
  //   Esc で基準位置へ戻る。ガイド線 / ゴーストは出ない。
  it("motion='live': 掴んだ行が追従し、通る先の行が退避し、up で commit / Escape で戻る", () => {
    vi.useFakeTimers();
    try {
      const controller = createRowDragController();
      const { args, container, commitRowMove } = makeArgs();
      const rows = Array.from(container.querySelectorAll<HTMLElement>('.ssg-body-row'));
      rows.forEach((row, i) => {
        row.style.transform = `translateY(${i * 10}px)`;
      });
      controller.update({ ...args, motion: 'live' });

      controller.onRowDragHandlePointerDown(1, handleEvent());
      expect(rows[1].getAttribute('data-ssg-row-dragging')).toBe('live');
      expect(document.querySelector('[data-grid-drag-ghost]')).toBeNull();
      // y=47 → slot 5 → target 4。行 1 は +32px 追従、行 2..4 は -10px 退避、行 5 以降は不変。
      dispatchPointer('pointermove', 1, 20, 47);
      expect(rows[1].style.transform).toBe('translateY(42px)');
      expect(rows[2].style.transform).toBe('translateY(10px)');
      expect(rows[4].style.transform).toBe('translateY(30px)');
      expect(rows[5].style.transform).toBe('translateY(50px)');
      expect(rows[2].style.transition).toContain('transform');
      expect(args.centerIndicatorRef.current?.style.display).toBe('none');
      // 枠外へ出ても直前のスロットを保つ(退避は維持)。
      dispatchPointer('pointermove', 1, 500, 47);
      expect(rows[2].style.transform).toBe('translateY(10px)');
      dispatchPointer('pointerup', 1, 500, 47);
      expect(commitRowMove).toHaveBeenCalledWith(1, 4);
      expect(rows[1].hasAttribute('data-ssg-row-dragging')).toBe(false);
      // 変更(1.0 前の最終チェック FC-02): 確定時は今の画面位置を控えてから transform を基準位置へ戻す(transition なし)。
      //   行キーが index のとき React が行要素を使い回して transform を書き直さないため(settle は控えた位置から動かす)。
      expect(rows[2].style.transition).toBe('');
      expect(rows[2].style.transform).toBe('translateY(20px)');
      expect(rows[1].style.transform).toBe('translateY(10px)');

      // Escape: 基準位置へ戻る。
      commitRowMove.mockClear();
      rows.forEach((row, i) => {
        row.style.transform = `translateY(${i * 10}px)`;
      });
      controller.onRowDragHandlePointerDown(1, handleEvent());
      dispatchPointer('pointermove', 1, 20, 47);
      expect(rows[3].style.transform).toBe('translateY(20px)');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(commitRowMove).not.toHaveBeenCalled();
      expect(rows[1].style.transform).toBe('translateY(10px)');
      expect(rows[3].style.transform).toBe('translateY(30px)');
      vi.advanceTimersByTime(300);
      expect(rows[3].style.transition).toBe('');
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  // 追加(dogfood DF-02): live 方式で展開中の行を掴むと、その行の帯がポインタに追従し、間の行の帯は同じだけ退避する。
  //   確定 / 取り消しで帯の transform を外す。帯の高さは行メトリクス(rowsHeight)に入っている前提。
  it("motion='live': 展開行の帯も行と一緒に動き、確定 / Escape で transform を外す", () => {
    vi.useFakeTimers();
    try {
      const controller = createRowDragController();
      const { args, container, commitRowMove } = makeArgs();
      const rows = Array.from(container.querySelectorAll<HTMLElement>('.ssg-body-row'));
      rows.forEach((row, i) => {
        row.style.transform = `translateY(${i * 10}px)`;
      });
      // 行 1(掴む行)と行 3(間の行)が展開中。帯は 3 ペイン分(ここでは 2 つずつ)。ネストしたグリッドの帯は対象外。
      const makeBand = (index: number) => {
        const band = document.createElement('div');
        band.className = 'ssg-detail-band';
        band.setAttribute('data-detail-row-index', String(index));
        container.appendChild(band);
        return band;
      };
      const band1 = [makeBand(1), makeBand(1)];
      const band3 = makeBand(3);
      const band7 = makeBand(7);
      const card = document.createElement('div');
      card.setAttribute('data-ssg-detail', '');
      const nested = document.createElement('div');
      nested.className = 'ssg-detail-band';
      nested.setAttribute('data-detail-row-index', '1');
      card.appendChild(nested);
      band3.appendChild(card);
      controller.update({ ...args, motion: 'live' });

      controller.onRowDragHandlePointerDown(1, handleEvent());
      // y=47 → target 4。掴んだ行の帯は +32px 追従して前面、行 3 の帯は -10px 退避、行 7 の帯は動かない。
      dispatchPointer('pointermove', 1, 20, 47);
      for (const band of band1) {
        expect(band.style.transform).toBe('translateY(32px)');
        expect(band.style.zIndex).toBe('10');
      }
      expect(band3.style.transform).toBe('translateY(-10px)');
      expect(band3.style.transition).toContain('transform');
      expect(band7.style.transform).toBe('translateY(0px)');
      expect(nested.style.transform).toBe('');
      dispatchPointer('pointerup', 1, 20, 47);
      expect(commitRowMove).toHaveBeenCalledWith(1, 4);
      for (const band of [...band1, band3, band7]) {
        expect(band.style.transform).toBe('');
        expect(band.style.zIndex).toBe('');
      }

      // Escape: 元の位置へ戻してから外す。
      rows.forEach((row, i) => {
        row.style.transform = `translateY(${i * 10}px)`;
      });
      controller.onRowDragHandlePointerDown(1, handleEvent());
      dispatchPointer('pointermove', 1, 20, 47);
      expect(band3.style.transform).toBe('translateY(-10px)');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(band3.style.transform).toBe('translateY(0px)');
      expect(band1[0].style.zIndex).toBe('');
      vi.advanceTimersByTime(300);
      expect(band3.style.transform).toBe('');
      expect(band3.style.transition).toBe('');
      expect(band1[0].style.transform).toBe('');
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  // 追加(アプリの再確認): live 方式で展開中の行(行 10px + 帯 30px)を下へ引くと、空く隙間が掴んだ行 + 帯と重なるよう、
  //   帯の高さぶん下の位置でスロットを決める(ポインタの位置で決めると隙間が帯の高さぶん上にずれ、間の行が帯の裏に
  //   隠れていた)。上へ引くとき・ゴースト方式はポインタの位置のまま。
  it("motion='live': 展開中の行を下へ引くと、帯の高さぶん下の位置でスロットを決める", () => {
    // 行 1 だけ帯 30px。行の上端: 0, 10, 50, 60, 70, 80, ...(全高 130)。
    const detail = (index: number) => (index === 1 ? 30 : 0);
    const top = (index: number) => index * 10 + (index > 1 ? 30 : 0);
    const rowMetrics = {
      rowCount: 10,
      rowTop: top,
      rowsHeight: (start: number, end: number) => top(end + 1) - top(start),
      totalBodyHeight: top(10),
      rowAtContentY: (y: number) => {
        for (let i = 9; i >= 0; i -= 1) if (y >= top(i)) return i;
        return 0;
      },
      cellHeight: () => 10,
      detailHeight: detail,
    };
    for (const motion of ['live', 'ghost'] as const) {
      const controller = createRowDragController();
      const { args, commitRowMove } = makeArgs();
      controller.update({ ...args, motion, rowMetrics });
      // 行 1 を y=15 で掴み、y=57(行 2 の下半分)へ。live は帯の下端の位置 y=87(行 5 の下半分)→ 行 5 の後ろ = 5。
      controller.onRowDragHandlePointerDown(1, handleEvent({ clientY: 15 }));
      dispatchPointer('pointermove', 1, 20, 57);
      dispatchPointer('pointerup', 1, 20, 57);
      expect(commitRowMove).toHaveBeenLastCalledWith(1, motion === 'live' ? 5 : 2);
      // 上へ引くときはポインタの位置のまま(y=3 → 先頭)。
      controller.onRowDragHandlePointerDown(1, handleEvent({ clientY: 15 }));
      dispatchPointer('pointermove', 1, 20, 3);
      dispatchPointer('pointerup', 1, 20, 3);
      expect(commitRowMove).toHaveBeenLastCalledWith(1, 0);
      controller.dispose();
      document.body.innerHTML = '';
    }
  });

  // 追加(見直し): 合計行(footerHeight)の上で離しても、合計行の裏に隠れた位置へは落とさない。
  it('footerHeight があると、合計行の上のポインタは本体の見えている最後の位置として扱う', () => {
    const controller = createRowDragController();
    const { args, commitRowMove } = makeArgs();
    controller.update({ ...args, footerHeight: 30 });
    controller.onRowDragHandlePointerDown(1, handleEvent());
    // y=95 は合計行(70..100)の上 → y=69(行 6 の後半)= 行 6 の下(y=70)にガイド線。
    dispatchPointer('pointermove', 1, 20, 95);
    expect(args.centerIndicatorRef.current?.style.top).toBe('70px');
    dispatchPointer('pointerup', 1, 20, 95);
    expect(commitRowMove).toHaveBeenCalledWith(1, 6);
    controller.dispose();

    // 合計行が無ければ従来どおり(行 9 の下へ)。
    const plain = createRowDragController();
    const second = makeArgs();
    plain.update(second.args);
    plain.onRowDragHandlePointerDown(1, handleEvent());
    dispatchPointer('pointermove', 1, 20, 95);
    dispatchPointer('pointerup', 1, 20, 95);
    expect(second.commitRowMove).toHaveBeenCalledWith(1, 9);
    plain.dispose();
  });
});