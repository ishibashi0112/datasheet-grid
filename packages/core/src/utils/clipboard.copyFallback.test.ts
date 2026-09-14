// copy fallback(copyTextViaExecCommand / writeTextToClipboard)の単体テストです。
//   非セキュアコンテキスト(navigator.clipboard 不在)での execCommand フォールバックと、
//   フォーカス退避・復元、両方失敗時の console.warn を検証します。
//   document.execCommand は jsdom 未実装のためモック注入で検証します。
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyTextViaExecCommand, writeTextToClipboard } from './clipboard';

// execCommand を own property として注入します(afterEach で削除して原状復帰)。
const injectExecCommand = (impl: (commandId: string) => boolean) => {
  const mock = vi.fn(impl);
  Object.defineProperty(document, 'execCommand', {
    value: mock,
    configurable: true,
    writable: true,
  });
  return mock;
};

// navigator.clipboard を注入します(jsdom は Clipboard API 未実装のため既定は undefined)。
const injectClipboard = (clipboard: unknown) => {
  Object.defineProperty(navigator, 'clipboard', {
    value: clipboard,
    configurable: true,
    writable: true,
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'execCommand');
  Reflect.deleteProperty(navigator, 'clipboard');
  document.body.innerHTML = '';
});

describe('copyTextViaExecCommand', () => {
  it('一時 textarea を生成して execCommand("copy") を実行し、成功時 true を返す', () => {
    let observedTextarea: HTMLTextAreaElement | null = null;
    const execMock = injectExecCommand(() => {
      // 実行時点で textarea が DOM に存在し、値と readonly 属性(モバイル対策)を持つこと。
      observedTextarea = document.querySelector('textarea');
      return true;
    });

    expect(copyTextViaExecCommand('a\tb\nc\td')).toBe(true);

    expect(execMock).toHaveBeenCalledTimes(1);
    expect(execMock).toHaveBeenCalledWith('copy');
    expect(observedTextarea).not.toBeNull();
    expect(observedTextarea!.value).toBe('a\tb\nc\td');
    expect(observedTextarea!.hasAttribute('readonly')).toBe(true);
    // 終了後に textarea が除去されていること。
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('実行前のフォーカス要素を実行後に復元する', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    const focusSpy = vi.spyOn(button, 'focus');
    injectExecCommand(() => true);

    copyTextViaExecCommand('text');

    expect(focusSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });

  it('execCommand が false を返したら false を返す', () => {
    injectExecCommand(() => false);
    expect(copyTextViaExecCommand('text')).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('execCommand が throw しても false を返し、textarea 除去とフォーカス復元を行う', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    const focusSpy = vi.spyOn(button, 'focus');
    injectExecCommand(() => {
      throw new Error('not supported');
    });

    expect(copyTextViaExecCommand('text')).toBe(false);

    expect(document.querySelector('textarea')).toBeNull();
    expect(focusSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });
});

describe('writeTextToClipboard', () => {
  it('navigator.clipboard.writeText 成功時はフォールバックを使わず true を返す', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    injectClipboard({ writeText });
    const execMock = injectExecCommand(() => true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(writeTextToClipboard('secure text')).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('secure text');
    expect(execMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('navigator.clipboard 不在(非セキュアコンテキスト)では execCommand フォールバックで書き込む', async () => {
    injectClipboard(undefined);
    const execMock = injectExecCommand(() => true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(writeTextToClipboard('insecure text')).resolves.toBe(true);

    expect(execMock).toHaveBeenCalledTimes(1);
    expect(execMock).toHaveBeenCalledWith('copy');
    expect(warnSpy).not.toHaveBeenCalled();
    // フォールバックが対象テキストを textarea 経由で選択していたこと(値の受け渡し検証)。
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('writeText が reject したら execCommand フォールバックへ落ちる(unhandled rejection にしない)', async () => {
    const writeText = vi
      .fn()
      .mockRejectedValue(new Error('NotAllowedError: Document is not focused'));
    injectClipboard({ writeText });
    const execMock = injectExecCommand(() => true);

    await expect(writeTextToClipboard('rejected text')).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('rejected text');
    expect(execMock).toHaveBeenCalledTimes(1);
  });

  it('writeText 不可かつフォールバックも失敗したときのみ console.warn して false を返す', async () => {
    injectClipboard(undefined);
    injectExecCommand(() => false);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(writeTextToClipboard('doomed text')).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('クリップボード');
  });
});