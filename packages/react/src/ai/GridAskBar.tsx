// 追加(ことばで絞り込み): 入口 `/ai` の既定の見た目です。グリッドの上(外)に置く入力欄 + 例 + 結果(反映した条件の
//   チップ・元に戻す・使えなかった部分・AI からのひとこと)。状態とふるまいは useGridAsk。
//   グリッドの外に置くため、色のトークンは style.css のトークン定義の対象(.ssg-ask)から読みます。
//   本体のモジュールは import しない(useGridAsk の先頭のコメント参照)。テーマの解決も core の store から直接行います。
import { useState, useSyncExternalStore, type KeyboardEvent } from 'react';
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

  const send = (value: string) => {
    void ask.submit(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 変換を確定する Enter では送りません(Safari は確定の keydown が isComposing=false / keyCode 229 で届く)。
    if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && asking) {
      event.preventDefault();
      ask.cancel();
    }
  };

  return (
    <div className={cx('ssg-ask', dark && 'ssg-theme-dark', className)} data-ssg-ask="">
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
          <button type="button" className="ssg-ask-button" onClick={ask.cancel}>
            止める
          </button>
        ) : (
          <button type="submit" className="ssg-ask-button ssg-ask-button--primary" disabled={text.trim() === ''}>
            聞く
          </button>
        )}
      </form>
      {examples && examples.length > 0 && (
        <div className="ssg-ask-examples">
          <span className="ssg-ask-examples-label">例:</span>
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              className="ssg-ask-example"
              disabled={asking}
              onClick={() => {
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
          <div className="ssg-ask-note ssg-ask-note--error" role="alert">
            <span>{ask.error}</span>
            <button type="button" className="ssg-ask-link" onClick={() => send(text)} disabled={text.trim() === ''}>
              もう一度
            </button>
          </div>
        )}
        {!asking && session !== null && (
          <>
            {session.phase === 'applied' && (
              <div className="ssg-ask-result">
                <div className="ssg-ask-result-head">
                  <span className="ssg-ask-result-title">反映した条件</span>
                  <span className="ssg-ask-result-actions">
                    <button type="button" className="ssg-ask-link" onClick={ask.undo}>
                      元に戻す
                    </button>
                    <button type="button" className="ssg-ask-link" onClick={ask.dismiss}>
                      閉じる
                    </button>
                  </span>
                </div>
                {session.items.length > 0 ? (
                  <ul className="ssg-ask-chips">
                    {session.items.map((item) => (
                      <li key={item.id} className="ssg-ask-chip">
                        <span className="ssg-ask-chip-label">{item.label}</span>
                        <span className="ssg-ask-chip-text">{item.text}</span>
                        <button
                          type="button"
                          className="ssg-ask-chip-remove"
                          aria-label={`${item.label} ${item.text} を外す`}
                          onClick={() => ask.remove(item.id)}
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
                <button type="button" className="ssg-ask-link" onClick={ask.dismiss}>
                  閉じる
                </button>
              </div>
            )}
            {session.phase === 'undone' && (
              <div className="ssg-ask-note">
                <span>元に戻しました。</span>
                <button type="button" className="ssg-ask-link" onClick={ask.dismiss}>
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