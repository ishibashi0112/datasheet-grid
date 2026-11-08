// 追加(ことばで絞り込み): 入口 `/ai` の既定の見た目です。グリッドの上(外)に置く入力欄 + 例 + 結果(反映した条件の
//   チップ・元に戻す・使えなかった部分・AI からのひとこと)。状態とふるまいは useGridAsk。
//   グリッドの外に置くため、色のトークンは style.css のトークン定義の対象(.ssg-ask)から読みます。
//   本体のモジュールは import しない(useGridAsk の先頭のコメント参照)。テーマの解決も core の store から直接行います。
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from 'react';
import { systemColorSchemeStore } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/systemColorSchemeStore';
import { resolveGridThemeClassName } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/theme';
import type { GridTheme } from '../model/gridTypes';
import { resolveGridAskLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/gridAskLocaleText';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFilters';
import { useGridAsk, type UseGridAskOptions } from './useGridAsk';

export type GridAskBarProps<T> = UseGridAskOptions<T> & {
  /** 入力欄の下に出す例の文(押すとその文で聞く)。 */
  examples?: readonly string[];
  /** 入力欄のプレースホルダー(既定は文言の `placeholder`)。 */
  placeholder?: string;
  /** 入力欄のラベル(読み上げ用。既定は文言の `label`)。 */
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
  placeholder,
  label,
  className,
  theme = 'light',
  ...options
}: GridAskBarProps<T>) {
  const ask = useGridAsk(options);
  // 追加(英語対応): 文言(既定は日本語)。
  const texts = resolveGridAskLocaleText(options.localeText);
  const [text, setText] = useState('');
  const systemPrefersDark = useSyncExternalStore(
    systemColorSchemeStore.subscribe,
    systemColorSchemeStore.getSnapshot,
    systemColorSchemeStore.getServerSnapshot,
  );
  // 変更(段階 2 DU-13): theme="class" は修飾子 ssg-theme-class(グリッドと同じ)。
  const themeClassName = resolveGridThemeClassName(theme, systemPrefersDark);
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
  //   変換中の Esc(変換の取り消し)では止めません。バーの中かどうかは composedPath で見ます(shadow root の中に
  //   置いたときは document.activeElement が host になり、contains では見分けられないため)。
  useEffect(() => {
    if (!asking) {
      return undefined;
    }
    const root = rootRef.current;
    const doc = root?.ownerDocument ?? document;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229) {
        return;
      }
      const inBar = root !== null && event.composedPath().includes(root);
      const active = doc.activeElement;
      if (!inBar && active !== null && active !== doc.body) {
        return;
      }
      event.preventDefault();
      cancel();
    };
    doc.addEventListener('keydown', handleKeyDown);
    return () => doc.removeEventListener('keydown', handleKeyDown);
  }, [asking, cancel]);

  const keepFocus = (chip: number | null = null) => {
    focusAfterRef.current = { chip, at: performance.now() };
  };

  // 変更(dogfood DU-19): 答えを読めたら入力欄を空にします(送った後に続けて打つと前の文につながって送られ、最後の
  //   チップの × で入力欄へ戻った後の Enter で前の文を送り直していた)。聞いている間に書き換えていれば残します。
  //   失敗したときは残します(直して送れるように。「もう一度」は送った文を送り直す)。
  const send = (value: string) => {
    if (asking || value.trim() === '') {
      return;
    }
    const sent = value.trim();
    setSentText(sent);
    void ask.submit(value).then((answered) => {
      if (answered) {
        setText((current) => (current.trim() === sent ? '' : current));
      }
    });
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
    <div ref={rootRef} className={cx('ssg-ask', themeClassName, className)} data-ssg-ask="">
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
          placeholder={placeholder ?? texts.placeholder}
          aria-label={label ?? texts.label}
          enterKeyHint="send"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {asking ? (
          <button type="button" className="ssg-ask-button" onClick={handleStop}>
            {texts.stop}
          </button>
        ) : (
          <button
            type="submit"
            className="ssg-ask-button ssg-ask-button--primary"
            disabled={text.trim() === ''}
            onClick={handleAsk}
          >
            {texts.submit}
          </button>
        )}
      </form>
      {examples && examples.length > 0 && (
        <div className="ssg-ask-examples">
          <span className="ssg-ask-examples-label">{texts.examples}</span>
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
            {texts.thinking}
            <span className="ssg-ask-hint">{texts.escHint}</span>
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
                {texts.retry}
              </button>
            )}
          </div>
        )}
        {!asking && session !== null && (
          <>
            {session.phase === 'applied' && (
              <div className="ssg-ask-result">
                <div className="ssg-ask-result-head">
                  <span className="ssg-ask-result-title">{texts.appliedTitle}</span>
                  <span className="ssg-ask-result-actions">
                    <button
                      type="button"
                      className="ssg-ask-link"
                      onClick={() => {
                        keepFocus();
                        ask.undo();
                      }}
                    >
                      {texts.undo}
                    </button>
                    <button
                      type="button"
                      className="ssg-ask-link"
                      onClick={() => {
                        keepFocus();
                        ask.dismiss();
                      }}
                    >
                      {texts.close}
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
                          aria-label={formatLocaleText(texts.removeItem, { label: item.label, text: item.text })}
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
                  <div className="ssg-ask-empty">{texts.allRemoved}</div>
                )}
              </div>
            )}
            {session.phase === 'unchanged' && (
              <div className="ssg-ask-note">
                <span>{texts.unchanged}</span>
                <button
                  type="button"
                  className="ssg-ask-link"
                  onClick={() => {
                    keepFocus();
                    ask.dismiss();
                  }}
                >
                  {texts.close}
                </button>
              </div>
            )}
            {session.phase === 'undone' && (
              <div className="ssg-ask-note">
                <span>{texts.undone}</span>
                <button
                  type="button"
                  className="ssg-ask-link"
                  onClick={() => {
                    keepFocus();
                    ask.dismiss();
                  }}
                >
                  {texts.close}
                </button>
              </div>
            )}
            {session.phase !== 'undone' && session.phase !== 'changed' && session.dropped.length > 0 && (
              <div className="ssg-ask-note ssg-ask-note--warn">
                <span className="ssg-ask-note-title">{texts.droppedTitle}</span>
                <ul className="ssg-ask-dropped">
                  {session.dropped.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {session.phase !== 'undone' && session.phase !== 'changed' && session.unsupported !== null && (
              <div className="ssg-ask-note">
                <span>{formatLocaleText(texts.fromAi, { text: session.unsupported })}</span>
              </div>
            )}
          </>
        )}
        {ask.notice !== null && (
          <div className="ssg-ask-note ssg-ask-note--warn">
            <span>{ask.notice}</span>
            {/* 追加(dogfood DU-08): 表が手で変わって反映した条件のチップを下げたときは、ここで閉じる。 */}
            {session?.phase === 'changed' && (
              <button
                type="button"
                className="ssg-ask-link"
                onClick={() => {
                  keepFocus();
                  ask.dismiss();
                }}
              >
                {texts.close}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}