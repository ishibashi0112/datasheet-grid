// 追加(G-2): IME オンのままの直接入力(imeDirectInput)の入力受けコントローラです(React 非依存)。
//
// 背景: グリッドは編集していないあいだルート(.ssg-shell = tabIndex の div)にフォーカスを置くため、IME がオンだと
//   キーは 'Process' で届き、入力欄が無いので変換そのものが始まらず、打った文字が失われていました。
// 方式: 透明な input(入力受け)をシェル内に置き、編集していないあいだはグリッドのフォーカスをそこへ置きます。
//   - キー操作 / 貼り付けはグリッド本体と同じ扱い(logic/domGuards の IME_INPUT_ATTRIBUTE で除外しない)。
//   - 変換が始まったら(compositionstart)、アクティブセルが text エディタで編集可能なら入力受けをセルの上に
//     エディタと同じ見た目で表示し、変換中の文字を見せます。変換は入力受けの中でそのまま続きます
//     (変換中に別の要素へフォーカスを移すと変換が途切れるため、入力受け自身で受ける)。
//   - 変換が確定したら(compositionend)、確定した文字列を初期値に通常の編集を開始します(startEdit)。もう一度
//     Enter でセルを確定して移動するのは通常のエディタの動き(Excel / SPREAD と同じ)。編集できないセルでの変換は
//     捨てます(従来どおり何も入らない)。
//   - 変換中にポインタを押した(別のセル / グリッド外をクリックした)ことで確定した変換は捨てます(Chromium は
//     フォーカスが移る前の mousedown で変換を確定させるため、そこで編集を始めるとクリック先からフォーカスを奪う)。
//   - ルートへのフォーカス(セルのクリック / 編集確定後 / ポップアップを閉じた後 / Tab で入ってきたとき)は
//     focus リスナーで入力受けへ回します。端の列の Tab(グリッドが既定動作に任せる = 監査 C-5)は、既定動作の前に
//     フォーカスをルートへ戻し、従来どおりルートを起点にグリッド外へ出します。
//   接続: React 版は SpreadsheetGrid で useController(update はレイアウト effect)し、<input ref={attach}> を
//   シェルの末尾に描画します。input は非制御(値 / class / style はこのコントローラが直接扱う)。
import type { CellCoord } from '../model/gridTypes.unbound';

type ReadonlyRef<V> = { readonly current: V };

export const IME_INPUT_COMPOSING_CLASS = 'ssg-ime-input--composing';

export type ImeInputCellInfo = {
  // セル要素の検索に使う列キー(data-ssg-col-key)。
  colKey: string;
  align?: 'left' | 'center' | 'right';
};

export type ImeInputControllerArgs = {
  enabled: boolean;
  gridRootRef: ReadonlyRef<HTMLElement | null>;
  // 編集中(エディタがフォーカスを持つ)か。
  editing: boolean;
  activeCell: CellCoord | null;
  resolveCell: (cell: CellCoord) => ImeInputCellInfo | null;
  // 変換の開始 / 確定時に、そのセルへ入力してよいか(logic/imeInput の canStartImeEdit)。
  canStartEdit: (cell: CellCoord) => boolean;
  // 確定した文字列を初期値に編集を開始します(edit controller の startEditWithValue)。
  startEdit: (cell: CellCoord, text: string) => void;
};

export type ImeInputController = {
  update: (args: ImeInputControllerArgs) => void;
  // input 要素の受け取り(React の ref コールバック。参照恒久安定)。null で切り離し。
  attach: (input: HTMLInputElement | null) => void;
  dispose: () => void;
};

// アクティブセルの要素を探します(仮想化で描画されていなければ null)。行は 3 ペインに分かれているため、
//   同じ data-row-index の行をすべて見て列キーが一致するセルを返します。
const findCellElement = (root: HTMLElement, cell: CellCoord, colKey: string): HTMLElement | null => {
  const rows = root.querySelectorAll<HTMLElement>(`.ssg-body-row[data-row-index="${cell.row}"]`);
  for (const row of Array.from(rows)) {
    const cells = row.querySelectorAll<HTMLElement>('.ssg-body-cell');
    for (const el of Array.from(cells)) {
      if (el.getAttribute('data-ssg-col-key') === colKey) {
        return el;
      }
    }
  }
  return null;
};

const sameCell = (a: CellCoord | null, b: CellCoord | null) =>
  a === b || (a !== null && b !== null && a.row === b.row && a.col === b.col);

export const createImeInputController = (): ImeInputController => {
  let args: ImeInputControllerArgs | null = null;
  let input: HTMLInputElement | null = null;
  let listenedRoot: HTMLElement | null = null;
  let listenedInput: HTMLInputElement | null = null;
  let documentListening = false;
  // 変換中のセル(入力してよいセルのときだけ表示する)。
  let composing: { cell: CellCoord; allowed: boolean } | null = null;
  // 確定 → 編集開始の受け渡し中(エディタが表示されるまで入力受けの表示を保つ)。
  let handoff = false;
  // 端の列の Tab でルートへ戻すあいだは入力受けへ回さない。
  let suppressRedirect = false;
  // 変換中にポインタが押された(その後の compositionend は確定操作ではなくクリックによるもの)。
  let pointerInterrupted = false;
  let positionedCell: CellCoord | null = null;

  const root = () => args?.gridRootRef.current ?? null;

  const focusInput = () => {
    if (input && input.ownerDocument.activeElement !== input) {
      input.focus({ preventScroll: true });
    }
  };

  // 入力受けをセルの位置へ合わせます(シェル = position: relative 基準)。composing では寸法と寄せも合わせます。
  const positionAt = (cell: CellCoord, composingView: boolean): boolean => {
    const rootEl = root();
    const info = args?.resolveCell(cell) ?? null;
    if (!input || !rootEl || !info) {
      return false;
    }
    const cellEl = findCellElement(rootEl, cell, info.colKey);
    if (!cellEl) {
      return false;
    }
    const base = rootEl.getBoundingClientRect();
    const rect = cellEl.getBoundingClientRect();
    input.style.left = `${rect.left - base.left - rootEl.clientLeft}px`;
    input.style.top = `${rect.top - base.top - rootEl.clientTop}px`;
    input.style.width = `${rect.width}px`;
    input.style.height = `${rect.height}px`;
    input.style.textAlign = composingView && info.align ? info.align : '';
    return true;
  };

  const hideComposing = () => {
    if (input) {
      input.classList.remove(IME_INPUT_COMPOSING_CLASS);
      input.value = '';
      input.style.textAlign = '';
    }
  };

  // ── DOM イベント ──
  const handleRootFocus = (event: FocusEvent) => {
    if (args === null || !args.enabled || args.editing || suppressRedirect) {
      return;
    }
    if (event.target !== listenedRoot) {
      return;
    }
    focusInput();
  };

  const handleCompositionStart = () => {
    if (args === null || !args.enabled || args.editing || args.activeCell === null) {
      composing = null;
      return;
    }
    const cell = args.activeCell;
    const allowed = args.canStartEdit(cell);
    composing = { cell, allowed };
    pointerInterrupted = false;
    if (allowed) {
      positionAt(cell, true);
      positionedCell = cell;
      input?.classList.add(IME_INPUT_COMPOSING_CLASS);
    }
  };

  const handleCompositionEnd = (event: CompositionEvent) => {
    const current = composing;
    composing = null;
    const interrupted = pointerInterrupted;
    pointerInterrupted = false;
    if (!input || current === null || !current.allowed || interrupted) {
      hideComposing();
      return;
    }
    const text = input.value || event.data || '';
    // 確定の判断はフォーカスの移動が落ち着いてから行います(変換中にグリッド外をクリックした場合、IME が確定して
    //   compositionend が来ても、フォーカスは既に外へ移っている = 編集を始めてフォーカスを奪わない)。
    queueMicrotask(() => {
      const target = input;
      if (
        args === null ||
        !args.enabled ||
        !target ||
        text === '' ||
        target.ownerDocument.activeElement !== target ||
        !args.canStartEdit(current.cell)
      ) {
        hideComposing();
        return;
      }
      handoff = true;
      args.startEdit(current.cell, text);
      // 編集が始まらなかったとき(外部要因)の保険: 次のフレームでまだ編集していなければ表示を戻します。
      requestAnimationFrame(() => {
        if (handoff && args !== null && !args.editing) {
          handoff = false;
          hideComposing();
        }
      });
    });
  };

  const handleInput = () => {
    // 変換中 / 受け渡し中以外に入った文字(編集できないセルでの文字キー / 貼り付けの既定動作など)は捨てます。
    if (composing === null && !handoff && input) {
      input.value = '';
    }
  };

  // 端の列の Tab: グリッドが既定動作に任せた(preventDefault していない)ときだけ、既定動作の前にフォーカスを
  //   ルートへ戻します(既定動作は現在のフォーカス位置を起点に進むため、従来どおりルートからグリッド外へ出る)。
  //   React の委譲リスナー(アプリのルート要素)より後に走るよう、document の bubble で受けます。
  const handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.target !== input || event.key !== 'Tab' || event.defaultPrevented || event.isComposing) {
      return;
    }
    const rootEl = root();
    if (!rootEl) {
      return;
    }
    suppressRedirect = true;
    try {
      rootEl.focus({ preventScroll: true });
    } finally {
      suppressRedirect = false;
    }
  };

  // 変換中のポインタ押下を記録します(capture = グリッド内外どこを押しても、各要素の処理より先に受ける)。
  const handleDocumentPointerDown = () => {
    if (composing !== null) {
      pointerInterrupted = true;
    }
  };

  // ── リスナーの付け外し ──
  const syncRootListener = (target: HTMLElement | null) => {
    if (listenedRoot === target) {
      return;
    }
    listenedRoot?.removeEventListener('focus', handleRootFocus);
    listenedRoot = target;
    listenedRoot?.addEventListener('focus', handleRootFocus);
  };

  const syncDocumentListener = (on: boolean) => {
    if (typeof document === 'undefined' || documentListening === on) {
      return;
    }
    documentListening = on;
    if (on) {
      document.addEventListener('keydown', handleDocumentKeyDown);
      document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    } else {
      document.removeEventListener('keydown', handleDocumentKeyDown);
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    }
  };

  // input のリスナーは「有効 かつ input がある」あいだだけ付けます(dispose → 再 update = StrictMode の二重マウントでも
  //   付け直せるよう、input の参照とリスナーの有無を分けて持つ)。
  const syncInputListener = (target: HTMLInputElement | null) => {
    if (listenedInput === target) {
      return;
    }
    if (listenedInput) {
      listenedInput.removeEventListener('compositionstart', handleCompositionStart);
      listenedInput.removeEventListener('compositionend', handleCompositionEnd);
      listenedInput.removeEventListener('input', handleInput);
    }
    listenedInput = target;
    if (listenedInput) {
      listenedInput.addEventListener('compositionstart', handleCompositionStart);
      listenedInput.addEventListener('compositionend', handleCompositionEnd);
      listenedInput.addEventListener('input', handleInput);
    }
  };

  return {
    update: (next) => {
      args = next;
      const rootEl = next.gridRootRef.current;
      syncRootListener(next.enabled ? rootEl : null);
      syncInputListener(next.enabled ? input : null);
      syncDocumentListener(next.enabled);
      if (!next.enabled) {
        composing = null;
        handoff = false;
        hideComposing();
        // 無効化したときに入力受けがフォーカスを持っていればルートへ返します。
        if (input && rootEl && input.ownerDocument.activeElement === input) {
          rootEl.focus({ preventScroll: true });
        }
        return;
      }
      // 確定 → 編集開始の受け渡しが済んだら(エディタが表示されたら)入力受けの表示を戻します。
      if (handoff && next.editing) {
        handoff = false;
        hideComposing();
      }
      if (composing !== null || handoff) {
        return;
      }
      // 待機中は入力受けをアクティブセルの位置へ(IME の候補ウィンドウの初期位置)。アクティブセルが変わったときだけ。
      if (next.activeCell !== null && !sameCell(positionedCell, next.activeCell)) {
        if (positionAt(next.activeCell, false)) {
          positionedCell = next.activeCell;
        }
      }
      // ルートがフォーカスを持ったまま(有効化した直後 / 編集の終了直後など)なら入力受けへ回します。
      if (!next.editing && rootEl && rootEl.ownerDocument.activeElement === rootEl) {
        focusInput();
      }
    },
    attach: (next) => {
      if (input === next) {
        return;
      }
      input = next;
      syncInputListener(args?.enabled ? input : null);
      if (!input) {
        return;
      }
      // タッチが主のデバイス(スマホ / タブレット)では、セルのタップで仮想キーボードを開かないようにします
      //   (入力受けは常にフォーカスを持つため)。デスクトップ(マウス)では付けません(IME の動作に影響させない)。
      if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) {
        input.inputMode = 'none';
      }
      positionedCell = null;
    },
    dispose: () => {
      syncInputListener(null);
      syncRootListener(null);
      syncDocumentListener(false);
      composing = null;
      handoff = false;
      args = null;
    },
  };
};