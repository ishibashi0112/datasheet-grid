// 追加(段 3-1 Solid 版の /ai): 入口 `/ai` の既定の見た目です。グリッドの上(外)に置く入力欄 + 例 + 結果(反映した条件の
//   チップ・元に戻す・使えなかった部分・AI からのひとこと)。状態とふるまいは createGridAsk。React 版の GridAskBar
//   (packages/react/src/ai/GridAskBar.tsx)と同じ DOM・同じクラス・同じ操作です。
//   グリッドの外に置くため、色のトークンは style.css のトークン定義の対象(.ssg-ask)から読みます。
//   本体のモジュールは import しない(createGridAsk の先頭のコメント参照)。テーマの解決も core の store から直接行います。
import { For, Show, createEffect, createMemo, createSignal, isHydrating, omit, onSettled } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { systemColorSchemeStore } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/systemColorSchemeStore';
import { resolveGridThemeClassName } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/theme';
import { resolveGridAskLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/gridAskLocaleText';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFilters';
import type { GridTheme } from '../model/gridTypes';
import { createGridAsk, type CreateGridAskOptions } from './createGridAsk';

export type GridAskBarProps<T> = CreateGridAskOptions<T> & {
  /** 入力欄の下に出す例の文(押すとその文で聞く)。 */
  examples?: readonly string[] | undefined;
  /** 入力欄のプレースホルダー(既定は文言の `placeholder`)。 */
  placeholder?: string | undefined;
  /** 入力欄のラベル(読み上げ用。既定は文言の `label`)。 */
  label?: string | undefined;
  /** バーの root に足すクラス(グリッドの `className` と同じく、React 版と同じ名前)。 */
  className?: string | undefined;
  /** 配色(グリッドの `theme` と同じ値を渡す)。 */
  theme?: GridTheme | undefined;
};

const cx = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(' ');

// OS の配色(prefers-color-scheme: dark)の signal です(本体の primitives/externalStore と同じ作り。本体のモジュールを
//   import しないので、ここに小さく持つ)。ハイドレーションの間はサーバーと同じ値(ライト)から始め、描き終わったら読み直します。
const createSystemPrefersDark = (): (() => boolean) => {
  const initial = isHydrating() ? systemColorSchemeStore.getServerSnapshot() : systemColorSchemeStore.getSnapshot();
  const [value, setValue] = createSignal(initial, { name: 'gridAskSystemColorScheme' });
  onSettled(() => {
    setValue(systemColorSchemeStore.getSnapshot());
    return systemColorSchemeStore.subscribe(() => setValue(systemColorSchemeStore.getSnapshot()));
  });
  return value;
};

/**
 * ことばで絞り込み・並べ替えをする入力欄です(グリッドの上に置く)。AI は利用側の `ask` で呼びます。
 * `grid` にはグリッドのハンドルを返す関数(`() => grid`)か、ハンドルそのものを渡します。
 */
export function GridAskBar<T>(props: GridAskBarProps<T>): JSX.Element {
  const options = omit(props, 'examples', 'placeholder', 'label', 'className', 'theme');
  const ask = createGridAsk(options as CreateGridAskOptions<T>);
  // 文言(既定は日本語)。
  const texts = createMemo(() => resolveGridAskLocaleText(props.localeText));
  const [text, setText] = createSignal('', { name: 'gridAskText' });
  const systemPrefersDark = createSystemPrefersDark();
  // theme="class" は修飾子 ssg-theme-class(グリッドと同じ)。
  const themeClassName = () => resolveGridThemeClassName(props.theme ?? 'light', systemPrefersDark());
  const asking = createMemo(() => ask.status === 'asking');
  // 最後に送った文です(失敗したあとの「もう一度」はこの文を送り直す。入力欄を書き換えていても)。
  let sentText = '';
  const [hasSent, setHasSent] = createSignal(false, { name: 'gridAskHasSent' });
  let rootEl: HTMLDivElement | undefined;
  let inputEl: HTMLInputElement | undefined;
  let chipsEl: HTMLUListElement | undefined;
  // 押したボタンが消える操作(チップの × / 元に戻す / 閉じる / もう一度)のあとのフォーカスの行き先です。
  //   chip は外したチップの位置(残ったチップの同じ位置か最後へ)、null は入力欄。
  let focusAfter: { chip: number | null; at: number } | null = null;
  const [focusRequest, setFocusRequest] = createSignal(0, { name: 'gridAskFocusRequest' });

  // フォーカスが body に落ちたとき(押したボタンが消えたとき)だけ、直前の操作の行き先へ移します。React 版は描くたびの
  //   effect で見ますが、Solid では描き直しが部分ごとなので、操作の後(頼んだ操作で変わる値か、操作の印)の effect で見ます
  //   (effect はその反映で DOM を書き換えた後に走る)。
  createEffect(
    () => [focusRequest(), ask.session, ask.notice, ask.error, ask.status] as const,
    () => {
      const pending = focusAfter;
      focusAfter = null;
      if (pending === null || performance.now() - pending.at > 1000) {
        return;
      }
      const doc = rootEl?.ownerDocument ?? document;
      const active = doc.activeElement;
      if (active !== null && active !== doc.body) {
        return;
      }
      const chips = chipsEl?.isConnected ? chipsEl.querySelectorAll<HTMLButtonElement>('.ssg-ask-chip-remove') : undefined;
      const target =
        pending.chip !== null && chips && chips.length > 0 ? chips[Math.min(pending.chip, chips.length - 1)] : inputEl;
      target?.focus();
    },
    { name: 'gridAskFocusAfter' },
  );

  // 聞いている間は Esc で止めます。フォーカスがバーの中か、どこにも無い(body)ときだけ(表やほかの部品の Esc は取らない)。
  //   例のボタンを押したあとや、Safari でボタンを押したあとはフォーカスが body にあります。変換中の Esc(変換の取り消し)
  //   では止めません。バーの中かどうかは composedPath で見ます(shadow root の中に置いたときは document.activeElement が
  //   host になり、contains では見分けられないため)。
  createEffect(
    asking,
    (isAsking) => {
      if (!isAsking) {
        return undefined;
      }
      const root = rootEl;
      const doc = root?.ownerDocument ?? document;
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229) {
          return;
        }
        const inBar = root !== undefined && event.composedPath().includes(root);
        const active = doc.activeElement;
        if (!inBar && active !== null && active !== doc.body) {
          return;
        }
        event.preventDefault();
        ask.cancel();
      };
      doc.addEventListener('keydown', handleKeyDown);
      return () => doc.removeEventListener('keydown', handleKeyDown);
    },
    { name: 'gridAskEscape' },
  );

  const keepFocus = (chip: number | null = null) => {
    focusAfter = { chip, at: performance.now() };
    setFocusRequest((value) => value + 1);
  };

  // 答えを読めたら入力欄を空にします(送った後に続けて打つと前の文につながって送られないように)。聞いている間に
  //   書き換えていれば残します。失敗したときは残します(直して送れるように。「もう一度」は送った文を送り直す)。
  //   聞いているかは ask.status ではなく submit の戻り値で決まります(Solid の signal は次の反映まで前の値を返すため、
  //   同じ操作の中で 2 回押されても submit が 2 回目を受け付けない)。
  const send = (value: string) => {
    if (asking() || value.trim() === '') {
      return;
    }
    const sent = value.trim();
    sentText = sent;
    setHasSent(true);
    void ask.submit(value).then((answered) => {
      if (answered) {
        setText((current) => (current.trim() === sent ? '' : current));
      }
    });
  };

  // 変換を確定する Enter では送りません(Safari は確定の keydown が isComposing=false / keyCode 229 で届く)。
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) {
      event.preventDefault();
    }
  };

  // 「聞く」と「止める」は同じ位置のボタンで、押すと入れ替わります。ダブルクリックの 2 回目(detail が 2 以上)は、前の
  //   1 回目の続きとして何もしません(聞く → 止める、止める → 聞く のどちらにも当たらない)。キーボードで押したときの
  //   detail は 0 です(React 版と同じ)。
  const handleStop = (event: MouseEvent) => {
    event.preventDefault();
    if (event.detail > 1) {
      return;
    }
    ask.cancel();
  };
  const handleAsk = (event: MouseEvent) => {
    if (event.detail > 1) {
      event.preventDefault();
    }
  };

  const closeButton = () => (
    <button
      type="button"
      class="ssg-ask-link"
      onClick={() => {
        keepFocus();
        ask.dismiss();
      }}
    >
      {texts().close}
    </button>
  );

  return (
    <div ref={(node) => (rootEl = node)} class={cx('ssg-ask', themeClassName(), props.className)} data-ssg-ask="">
      <form
        class="ssg-ask-form"
        onSubmit={(event) => {
          event.preventDefault();
          send(text());
        }}
      >
        <svg class="ssg-ask-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M6 1.5l1.1 3.4L10.5 6 7.1 7.1 6 10.5 4.9 7.1 1.5 6l3.4-1.1L6 1.5zm6 7l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9z"
            fill="currentColor"
          />
        </svg>
        <input
          ref={(node) => (inputEl = node)}
          class="ssg-ask-input"
          type="text"
          value={text()}
          placeholder={props.placeholder ?? texts().placeholder}
          aria-label={props.label ?? texts().label}
          enterkeyhint="send"
          onInput={(event) => setText(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        <Show
          when={asking()}
          fallback={
            <button
              type="submit"
              class="ssg-ask-button ssg-ask-button--primary"
              disabled={text().trim() === ''}
              onClick={handleAsk}
            >
              {texts().submit}
            </button>
          }
        >
          <button type="button" class="ssg-ask-button" onClick={handleStop}>
            {texts().stop}
          </button>
        </Show>
      </form>
      <Show when={props.examples && props.examples.length > 0}>
        <div class="ssg-ask-examples">
          <span class="ssg-ask-examples-label">{texts().examples}</span>
          {/* 同じ例が 2 つあっても重ならないよう、位置で使い回します(React 版の key={index} と同じ)。 */}
          <For each={props.examples ?? []} keyed={false}>
            {(example) => (
              // 聞いている間は aria-disabled(disabled にすると押したボタンからフォーカスが外れ、Esc が届かない)。
              <button
                type="button"
                class="ssg-ask-example"
                aria-disabled={asking() ? 'true' : undefined}
                title={example()}
                onClick={() => {
                  if (asking()) {
                    return;
                  }
                  const value = example();
                  setText(value);
                  send(value);
                }}
              >
                {example()}
              </button>
            )}
          </For>
        </div>
      </Show>
      <div class="ssg-ask-output" aria-live="polite">
        <Show when={asking()}>
          <div class="ssg-ask-status">
            <span class="ssg-ask-spinner" aria-hidden="true" />
            {texts().thinking}
            <span class="ssg-ask-hint">{texts().escHint}</span>
          </div>
        </Show>
        {/* 読み上げは .ssg-ask-output の aria-live で届きます(role="alert" を重ねると二重に読まれる)。 */}
        <Show when={!asking() && ask.error !== null}>
          <div class="ssg-ask-note ssg-ask-note--error">
            <span>{ask.error}</span>
            <Show when={hasSent()}>
              <button
                type="button"
                class="ssg-ask-link"
                onClick={() => {
                  keepFocus();
                  send(sentText);
                }}
              >
                {texts().retry}
              </button>
            </Show>
          </div>
        </Show>
        <Show when={!asking() ? ask.session : null}>
          {(session) => (
            <>
              <Show when={session().phase === 'applied'}>
                <div class="ssg-ask-result">
                  <div class="ssg-ask-result-head">
                    <span class="ssg-ask-result-title">{texts().appliedTitle}</span>
                    <span class="ssg-ask-result-actions">
                      <button
                        type="button"
                        class="ssg-ask-link"
                        onClick={() => {
                          keepFocus();
                          ask.undo();
                        }}
                      >
                        {texts().undo}
                      </button>
                      {closeButton()}
                    </span>
                  </div>
                  <Show
                    when={session().items.length > 0}
                    fallback={<div class="ssg-ask-empty">{texts().allRemoved}</div>}
                  >
                    <ul ref={(node) => (chipsEl = node)} class="ssg-ask-chips">
                      <For each={session().items} keyed={(item) => item.id}>
                        {(item, index) => (
                          <li class="ssg-ask-chip" title={`${item().label}: ${item().text}`}>
                            <span class="ssg-ask-chip-label">{item().label}</span>
                            <span class="ssg-ask-chip-text">{item().text}</span>
                            <button
                              type="button"
                              class="ssg-ask-chip-remove"
                              aria-label={formatLocaleText(texts().removeItem, {
                                label: item().label,
                                text: item().text,
                              })}
                              onClick={() => {
                                keepFocus(index());
                                ask.remove(item().id);
                              }}
                            >
                              ×
                            </button>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </div>
              </Show>
              <Show when={session().phase === 'unchanged'}>
                <div class="ssg-ask-note">
                  <span>{texts().unchanged}</span>
                  {closeButton()}
                </div>
              </Show>
              <Show when={session().phase === 'undone'}>
                <div class="ssg-ask-note">
                  <span>{texts().undone}</span>
                  {closeButton()}
                </div>
              </Show>
              <Show
                when={session().phase !== 'undone' && session().phase !== 'changed' && session().dropped.length > 0}
              >
                <div class="ssg-ask-note ssg-ask-note--warn">
                  <span class="ssg-ask-note-title">{texts().droppedTitle}</span>
                  <ul class="ssg-ask-dropped">
                    <For each={session().dropped} keyed={false}>
                      {(reason) => <li>{reason()}</li>}
                    </For>
                  </ul>
                </div>
              </Show>
              <Show
                when={session().phase !== 'undone' && session().phase !== 'changed' && session().unsupported !== null}
              >
                <div class="ssg-ask-note">
                  <span>{formatLocaleText(texts().fromAi, { text: session().unsupported ?? '' })}</span>
                </div>
              </Show>
            </>
          )}
        </Show>
        <Show when={ask.notice !== null}>
          <div class="ssg-ask-note ssg-ask-note--warn">
            <span>{ask.notice}</span>
            {/* 表が手で変わって反映した条件のチップを下げたときは、ここで閉じる。 */}
            <Show when={ask.session?.phase === 'changed'}>{closeButton()}</Show>
          </div>
        </Show>
      </div>
    </div>
  );
}