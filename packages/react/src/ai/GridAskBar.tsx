// 追加(ことばで絞り込み): 入口 `/ai` の既定の見た目です。グリッドの上(外)に置く入力欄 + 例 + 結果(反映した条件の
//   チップ・元に戻す・使えなかった部分・AI からのひとこと)。状態とふるまいは useGridAsk。
//   グリッドの外に置くため、色のトークンは style.css のトークン定義の対象(.ssg-ask)から読みます。
//   本体のモジュールは import しない(useGridAsk の先頭のコメント参照)。テーマの解決も core の store から直接行います。
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from 'react';
import { systemColorSchemeStore } from '@ishibashi0112/spreadsheet-grid-core/controllers/systemColorSchemeStore';
import { resolveGridTheme } from '@ishibashi0112/spreadsheet-grid-core/logic/theme';
import type { GridTheme } from '../model/gridTypes';
import { useGridAsk, type UseGridAskOptions } from './useGridAsk';

export type GridAskBarProps<T> = UseGridAskOptions<T> & {
  /** 入力欄の下に出す例の文(押すとその文で聞く)。 */
  examples?: readonly string[];
  /** 入力欄のプレースホルダー。 */
  placeholder?: string;
  /** 入力欄のラベル(読み上げ用)。 */
  label?: string;
  /** バーの root に足すクラス。 */
  className?: string;
  /** 配色(グリッドの `theme` と同じ値を渡す)。 */
  theme?: GridTheme;
};

const cx = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(' ');

/**
 * ことばで絞り込み・並べ替えをする入力欄です(グリッドの上に置く)。AI は利用側の `ask` で呼びます。
 */
export function GridAskBar<T>({
  examples,
  placeholder = 'ことばで絞り込み・並べ替え(例: 今月の分を金額の高い順に)',
  label = 'ことばで絞り込み',
  className,
  theme = 'light',
  ...options
}: GridAskBarProps<T>) {
  const ask = useGridAsk(options);
  const [text, setText] = useState('');
  const systemPrefersDark = useSyncExternalStore(
    systemColorSchemeStore.subscribe,
    systemColorSchemeStore.getSnapshot,
    systemColorSchemeStore.getServerSnapshot,
  );
  const dark = resolveGridTheme(theme, systemPrefersDark) === 'dark';
  const asking = ask.status === 'asking';
  const session = ask.session;
  const cancel = ask.cancel;
  // 最後に送った文です(失敗したあとの「もう一度」はこの文を送り直す。入力欄を書き換えていても)。
  const [sentText, setSentText] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLUListElement>(null);
  // 押したボタンが消える操作(チップの × / 元に戻す / 閉じる / もう一度)のあとのフォーカスの行き先です。
  //   chip は外したチップの位置(残ったチップの同じ位置か最後へ)、null は入力欄。
  const focusAfterRef = useRef<{ chip: number | null; at: number } | null>(null);

  // フォーカスが body に落ちたとき(押したボタンが消えたとき)だけ、直前の操作の行き先へ移します。
  useEffect(() => {
    const pending = focusAfterRef.current;
    focusAfterRef.current = null;
    if (pending === null || performance.now() - pending.at > 1000) {
      return;
    }
    const active = document.activeElement;
    if (active !== null && active !== document.body) {
      return;
    }
    const chips = chipsRef.current?.querySelectorAll<HTMLButtonElement>('.ssg-ask-chip-remove');
    const target =
      pending.chip !== null && chips && chips.length > 0
        ? chips[Math.min(pending.chip, chips.length - 1)]
        : inputRef.current;
    target?.focus();
  });

  // 聞いている間は Esc で止めます。フォーカスがバーの中か、どこにも無い(body)ときだけ(表やほかの部品の Esc は
  //   取らない)。例のボタンを押したあとや、Safari でボタンを押したあとはフォーカスが body にあります。
  //   変換中の Esc(変換の取り消し)では止めません。
  useEffect(() => {
    if (!asking) {
      return undefined;
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229) {
        return;
      }
      const active = document.activeElement;
      if (active !== null && active !== document.body && !rootRef.current?.contains(active)) {
        return;
      }
      event.preventDefault();
      cancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [asking, cancel]);

  const keepFocus = (chip: number | null = null) => {
    focusAfterRef.current = { chip, at: performance.now() };
  };

  const send = (value: string) => {
    if (asking || value.trim() === '') {
      return;
    }
    setSentText(value.trim());
    void ask.submit(value);
  };

  // 変換を確定する Enter では送りません(Safari は確定の keydown が isComposing=false / keyCode 229 で届く)。
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) {
      event.preventDefault();
    }
  };

  // 「聞く」と「止める」は同じ button 要素で、押すと type が submit ↔ button に変わります。クリックを処理している
  //   間に描画が変わるので、止めたあとの既定の動作(フォームの送信)を止めないと、同じ文をすぐ送り直します。
  //   ダブルクリックの 2 回目(detail が 2 以上)は、前の 1 回目の続きとして何もしません(聞く → 止める、
  //   止める → 聞く のどちらにも当たらない)。キーボードで押したときの detail は 0 です。
  const handleStop = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (event.detail > 1) {
      return;
    }
    cancel();
  };
  const handleAsk = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 1) {
      event.preventDefault();
    }
  };

  return (
    <div ref={rootRef} className={cx('ssg-ask', dark && 'ssg-theme-dark', className)} data-ssg-ask="">
      <form
        className="ssg-ask-form"
        onSubmit={(event) => {
          event.preventDefault();
          send(text);
        }}
      >
        <svg className="ssg-ask-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M6 1.5l1.1 3.4L10.5 6 7.1 7.1 6 10.5 4.9 7.1 1.5 6l3.4-1.1L6 1.5zm6 7l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9z"
            fill="currentColor"
          />
        </svg>
        <input
          ref={inputRef}
          className="ssg-ask-input"
          type="text"
          value={text}
          placeholder={placeholder}
          aria-label={label}
          enterKeyHint="send"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {asking ? (
          <button type="button" className="ssg-ask-button" onClick={handleStop}>
            止める
          </button>
        ) : (
          <button
            type="submit"
            className="ssg-ask-button ssg-ask-button--primary"
            disabled={text.trim() === ''}
            onClick={handleAsk}
          >
            聞く
          </button>
        )}
      </form>
      {examples && examples.length > 0 && (
        <div className="ssg-ask-examples">
          <span className="ssg-ask-examples-label">例:</span>
          {examples.map((example, index) => (
            // 聞いている間は aria-disabled(disabled にすると押したボタンからフォーカスが外れ、Esc が届かない)。
            <button
              key={index}
              type="button"
              className="ssg-ask-example"
              aria-disabled={asking || undefined}
              title={example}
              onClick={() => {
                if (asking) {
                  return;
                }
                setText(example);
                send(example);
              }}
            >
              {example}
            </button>
          ))}
        </div>
      )}
      <div className="ssg-ask-output" aria-live="polite">
        {asking && (
          <div className="ssg-ask-status">
            <span className="ssg-ask-spinner" aria-hidden="true" />
            考えています…<span className="ssg-ask-hint">Esc でも止まります</span>
          </div>
        )}
        {!asking && ask.error !== null && (
          // 読み上げは .ssg-ask-output の aria-live で届きます(role="alert" を重ねると二重に読まれる)。
          <div className="ssg-ask-note ssg-ask-note--error">
            <span>{ask.error}</span>
            {sentText !== '' && (
              <button
                type="button"
                className="ssg-ask-link"
                onClick={() => {
                  keepFocus();
                  send(sentText);
                }}
              >
                もう一度
              </button>
            )}
          </div>
        )}
        {!asking && session !== null && (
          <>
            {session.phase === 'applied' && (
              <div className="ssg-ask-result">
                <div className="ssg-ask-result-head">
                  <span className="ssg-ask-result-title">反映した条件</span>
                  <span className="ssg-ask-result-actions">
                    <button
                      type="button"
                      className="ssg-ask-link"
                      onClick={() => {
                        keepFocus();
                        ask.undo();
                      }}
                    >
                      元に戻す
                    </button>
                    <button
                      type="button"
                      className="ssg-ask-link"
                      onClick={() => {
                        keepFocus();
                        ask.dismiss();
                      }}
                    >
                      閉じる
                    </button>
                  </span>
                </div>
                {session.items.length > 0 ? (
                  <ul ref={chipsRef} className="ssg-ask-chips">
                    {session.items.map((item, index) => (
                      <li key={item.id} className="ssg-ask-chip" title={`${item.label}: ${item.text}`}>
                        <span className="ssg-ask-chip-label">{item.label}</span>
                        <span className="ssg-ask-chip-text">{item.text}</span>
                        <button
                          type="button"
                          className="ssg-ask-chip-remove"
                          aria-label={`${item.label} ${item.text} を外す`}
                          onClick={() => {
                            keepFocus(index);
                            ask.remove(item.id);
                          }}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="ssg-ask-empty">条件はすべて外れています。</div>
                )}
              </div>
            )}
            {session.phase === 'unchanged' && (
              <div className="ssg-ask-note">
                <span>変える条件はありませんでした。</span>
                <button
                  type="button"
                  className="ssg-ask-link"
                  onClick={() => {
                    keepFocus();
                    ask.dismiss();
                  }}
                >
                  閉じる
                </button>
              </div>
            )}
            {session.phase === 'undone' && (
              <div className="ssg-ask-note">
                <span>元に戻しました。</span>
                <button
                  type="button"
                  className="ssg-ask-link"
                  onClick={() => {
                    keepFocus();
                    ask.dismiss();
                  }}
                >
                  閉じる
                </button>
              </div>
            )}
            {session.phase !== 'undone' && session.dropped.length > 0 && (
              <div className="ssg-ask-note ssg-ask-note--warn">
                <span className="ssg-ask-note-title">使えなかった部分</span>
                <ul className="ssg-ask-dropped">
                  {session.dropped.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {session.phase !== 'undone' && session.unsupported !== null && (
              <div className="ssg-ask-note">
                <span>AI から: {session.unsupported}</span>
              </div>
            )}
          </>
        )}
        {ask.notice !== null && (
          <div className="ssg-ask-note ssg-ask-note--warn">
            <span>{ask.notice}</span>
          </div>
        )}
      </div>
    </div>
  );
}