// useGridAsk で作った自前の UI(ドキュメントの「自分の UI を作るときは…自分で書く」に沿う)
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useGridAsk, type UseGridAskOptions } from '@ishibashi0112/spreadsheet-grid/ai';
import { gridAskLocaleTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en';
import type { Lang, Sale } from './data';

type Props = Omit<UseGridAskOptions<Sale>, 'localeText'> & { lang: Lang };

export function CustomAsk({ lang, ...options }: Props) {
  const { status, error, notice, session, submit, cancel, undo, remove, dismiss } = useGridAsk({
    ...options,
    localeText: lang === 'en' ? gridAskLocaleTextEn : undefined,
  });
  const [text, setText] = useState('');
  const lastSent = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const asking = status === 'asking';

  const send = async (value: string) => {
    const t = value.trim();
    if (!t) return;
    lastSent.current = t;
    const ok = await submit(t);
    // 答えを読めたら、送った文と今の入力欄が同じときだけ空にする
    if (ok) setText((now) => (now.trim() === t ? '' : now));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      void send(text);
    }
  };

  // 聞いている間の Esc で止める(変換中は除く)
  useEffect(() => {
    if (!asking) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asking, cancel]);

  const onButton = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail > 1) return; // ダブルクリックの 2 回目は無視
    if (asking) cancel();
    else void send(text);
  };

  return (
    <section className="custom-ask" data-testid="custom-ask">
      <div className="custom-ask__row">
        <input
          ref={inputRef}
          data-testid="custom-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={lang === 'ja' ? '例: 関東の 10 万円以上' : 'e.g. Kanto, 100,000 yen or more'}
          aria-label={lang === 'ja' ? 'AI に頼む' : 'Ask the AI'}
        />
        <button type="button" data-testid="custom-button" onClick={onButton}>
          {asking ? (lang === 'ja' ? '止める' : 'Stop') : lang === 'ja' ? '頼む' : 'Ask'}
        </button>
        {asking && <span data-testid="custom-status">{lang === 'ja' ? '問い合わせ中…' : 'Asking…'}</span>}
      </div>
      {error && (
        <div className="custom-ask__error" role="alert" data-testid="custom-error">
          {error}{' '}
          <button type="button" onClick={() => void send(lastSent.current)} data-testid="custom-retry">
            {lang === 'ja' ? '再送' : 'Retry'}
          </button>
        </div>
      )}
      {notice && (
        <div className="custom-ask__notice" data-testid="custom-notice">
          {notice}
        </div>
      )}
      {session && (
        <div className="custom-ask__session" data-testid="custom-session" data-phase={session.phase}>
          <span>[{session.phase}]</span>
          <ul>
            {session.items.map((item) => (
              <li key={item.id}>
                <b>{item.label}</b> {item.text}{' '}
                {session.phase === 'applied' && (
                  <button type="button" aria-label={`remove ${item.label}`} onClick={() => remove(item.id)}>
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
          {session.dropped.length > 0 && (
            <ul className="custom-ask__dropped" data-testid="custom-dropped">
              {session.dropped.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
          {session.unsupported && <p data-testid="custom-unsupported">{session.unsupported}</p>}
          {session.phase === 'applied' && (
            <button type="button" onClick={undo} data-testid="custom-undo">
              {lang === 'ja' ? '元に戻す' : 'Undo'}
            </button>
          )}
          <button type="button" onClick={dismiss} data-testid="custom-dismiss">
            {lang === 'ja' ? '閉じる' : 'Close'}
          </button>
        </div>
      )}
    </section>
  );
}
