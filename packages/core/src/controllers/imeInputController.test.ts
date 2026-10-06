// 追加(G-2): IME オンのままの直接入力の入力受けコントローラの単体テストです。DOM(jsdom)上の input / ルートに対して、
//   ①ルートへのフォーカスを入力受けへ回す(無効時 / 編集中は回さない)
//   ②変換中は入力受けをセルの上に表示し、確定で startEdit(確定文字列)→ 編集が始まったら表示を戻す
//   ③入力できないセル / 空の確定 / ポインタ押下で確定した変換は捨てる
//   ④変換中 / 受け渡し中以外に入った文字は捨てる
//   ⑤端の列の Tab(既定動作に任せたもの)は既定動作の前にルートへフォーカスを戻す
//   ⑥dispose 後の update でリスナーを付け直せる(StrictMode の二重マウント)
//   を検証します(CDP での実ブラウザ確認は audit/harness の t-features)。
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createImeInputController,
  IME_INPUT_COMPOSING_CLASS,
  type ImeInputControllerArgs,
} from './imeInputController';

type Setup = {
  root: HTMLDivElement;
  input: HTMLInputElement;
  outside: HTMLInputElement;
  startEdit: ReturnType<typeof vi.fn>;
  args: (patch?: Partial<ImeInputControllerArgs>) => ImeInputControllerArgs;
};

const setup = (): Setup => {
  const root = document.createElement('div');
  root.tabIndex = 0;
  root.className = 'ssg-shell';
  root.innerHTML =
    '<div class="ssg-body-row" data-row-index="0"><div class="ssg-body-cell" data-ssg-col-key="name"></div></div>';
  const input = document.createElement('input');
  root.appendChild(input);
  const outside = document.createElement('input');
  document.body.append(root, outside);
  const startEdit = vi.fn();
  const args = (patch: Partial<ImeInputControllerArgs> = {}): ImeInputControllerArgs => ({
    enabled: true,
    gridRootRef: { current: root },
    editing: false,
    activeCell: { row: 0, col: 0 },
    resolveCell: () => ({ colKey: 'name', align: 'right' }),
    canStartEdit: () => true,
    startEdit,
    ...patch,
  });
  return { root, input, outside, startEdit, args };
};

const composition = (input: HTMLInputElement, type: 'compositionstart' | 'compositionend', data = '') =>
  input.dispatchEvent(new CompositionEvent(type, { data, bubbles: true }));

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('imeInputController', () => {
  it('ルートへのフォーカスを入力受けへ回す(無効時 / 編集中は回さない)', () => {
    const { root, input, outside, args } = setup();
    const controller = createImeInputController();
    controller.attach(input);
    controller.update(args());
    root.focus();
    expect(document.activeElement).toBe(input);

    outside.focus();
    controller.update(args({ editing: true }));
    root.focus();
    expect(document.activeElement).toBe(root);
    // 編集が終わった次の update で、ルートが持っていたフォーカスを入力受けへ回す。
    controller.update(args({ editing: false }));
    expect(document.activeElement).toBe(input);

    // 無効化するとルートへ返し、以後は回さない。
    controller.update(args({ enabled: false }));
    expect(document.activeElement).toBe(root);
    outside.focus();
    root.focus();
    expect(document.activeElement).toBe(root);
    controller.dispose();
  });

  it('変換中は入力受けを表示し、確定で startEdit → 編集が始まったら表示を戻す', async () => {
    const { root, input, startEdit, args } = setup();
    const controller = createImeInputController();
    controller.attach(input);
    controller.update(args());
    root.focus();

    composition(input, 'compositionstart');
    expect(input.classList.contains(IME_INPUT_COMPOSING_CLASS)).toBe(true);
    expect(input.style.textAlign).toBe('right');
    input.value = '漢字';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('漢字');
    composition(input, 'compositionend', '漢字');
    await flushMicrotasks();
    expect(startEdit).toHaveBeenCalledWith({ row: 0, col: 0 }, '漢字');
    // エディタが表示されるまでは入力受けの表示を保つ。
    expect(input.classList.contains(IME_INPUT_COMPOSING_CLASS)).toBe(true);
    controller.update(args({ editing: true }));
    expect(input.classList.contains(IME_INPUT_COMPOSING_CLASS)).toBe(false);
    expect(input.value).toBe('');
    controller.dispose();
  });

  it('入力できないセル / 空の確定 / ポインタ押下で確定した変換は捨てる', async () => {
    const { root, input, startEdit, args } = setup();
    const controller = createImeInputController();
    controller.attach(input);

    // 入力できないセル: 表示しない・確定しても編集しない。
    controller.update(args({ canStartEdit: () => false }));
    root.focus();
    composition(input, 'compositionstart');
    expect(input.classList.contains(IME_INPUT_COMPOSING_CLASS)).toBe(false);
    input.value = '１２';
    composition(input, 'compositionend', '１２');
    await flushMicrotasks();
    expect(startEdit).not.toHaveBeenCalled();
    expect(input.value).toBe('');

    // 空の確定(変換の取り消し)。
    controller.update(args());
    composition(input, 'compositionstart');
    composition(input, 'compositionend', '');
    await flushMicrotasks();
    expect(startEdit).not.toHaveBeenCalled();
    expect(input.classList.contains(IME_INPUT_COMPOSING_CLASS)).toBe(false);

    // 変換中にポインタを押した(別のセル / グリッド外のクリック)ことによる確定。
    composition(input, 'compositionstart');
    input.value = 'て';
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    composition(input, 'compositionend', 'て');
    await flushMicrotasks();
    expect(startEdit).not.toHaveBeenCalled();
    expect(input.value).toBe('');
    controller.dispose();
  });

  it('確定時にフォーカスが既に外へ移っていたら編集を始めない', async () => {
    const { root, input, outside, startEdit, args } = setup();
    const controller = createImeInputController();
    controller.attach(input);
    controller.update(args());
    root.focus();
    composition(input, 'compositionstart');
    input.value = 'あ';
    composition(input, 'compositionend', 'あ');
    outside.focus();
    await flushMicrotasks();
    expect(startEdit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(outside);
    controller.dispose();
  });

  it('変換中 / 受け渡し中以外に入った文字は捨てる', () => {
    const { input, args } = setup();
    const controller = createImeInputController();
    controller.attach(input);
    controller.update(args());
    input.value = 'x';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('');
    controller.dispose();
  });

  it('既定動作に任せた Tab は、既定動作の前にルートへフォーカスを戻す(preventDefault 済みなら何もしない)', () => {
    const { root, input, args } = setup();
    const controller = createImeInputController();
    controller.attach(input);
    controller.update(args());
    root.focus();
    expect(document.activeElement).toBe(input);

    const handled = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    handled.preventDefault();
    input.dispatchEvent(handled);
    expect(document.activeElement).toBe(input);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    // 戻したルートのフォーカスは入力受けへ回さない(既定の Tab がルートを起点に進むため)。
    expect(document.activeElement).toBe(root);
    controller.dispose();
  });

  it('dispose 後の update でリスナーを付け直せる(StrictMode の二重マウント)', async () => {
    const { root, input, startEdit, args } = setup();
    const controller = createImeInputController();
    controller.attach(input);
    controller.update(args());
    controller.dispose();
    controller.update(args());
    root.focus();
    expect(document.activeElement).toBe(input);
    composition(input, 'compositionstart');
    input.value = '再';
    composition(input, 'compositionend', '再');
    await flushMicrotasks();
    expect(startEdit).toHaveBeenCalledWith({ row: 0, col: 0 }, '再');
    controller.dispose();
  });
});