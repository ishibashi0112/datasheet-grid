// 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-09): 「文字列 → セルの値」の組み込みのパーサ(列の parseClipboardValue に渡す)。
//
// 背景: number 列に Excel の通貨書式のセル(「¥12,000」「12,000円」「(1,200)」)を貼り付けると、組み込みのパーサが数値として
//   読めず、reject の列では黙って飛ばされ、mark の列では文字列のまま入っていました。自前の parseClipboardValue を書くと、組み込みの
//   全角対応(「１，２３４」「ー５」)が使えなくなり、そのパーサは公開されていませんでした。
//   numberParser() は number エディタの既定のパーサと同じ読み方(空白だけ → null / 数値 → number / 読めない → 文字のまま)で、
//   strip(先に外す文字)と negativeParentheses(「(1,200)」を -1200)を足せます。

import { parseNumberText } from './editorValues';

/** `numberParser` のオプション。 */
export type NumberParserOptions = {
  /** 読む前に外す文字(通貨記号や単位。例: `['¥', '￥', '円', '$']`)。外したあとが数値でなければ元の文字のまま。 */
  strip?: readonly string[] | undefined;
  /** `true` で、かっこで囲んだ数(`(1,200)` / `（1,200）`。会計の書式)を負の数として読む。既定 `false`。 */
  negativeParentheses?: boolean | undefined;
};

const PARENTHESES_PATTERN = /^\s*[(（]([^()（）]*)[)）]\s*$/;
// かっこの中の先頭の符号(半角 / 全角の + -、マイナス記号、IME の「ー」)。
const SIGN_PREFIX_PATTERN = /^[\s\u3000]*[-+\u2212\uFF0D\uFF0B\u30FC]/;

/**
 * 「文字列 → 数値」のパーサを作る(列の `parseClipboardValue` に渡す。貼り付け / Delete / エディタの確定で共通)。
 * 読み方は number エディタの既定のパーサと同じ: 空・空白だけは `null`、数値として読める文字は `number`(全角の数字・符号・
 * 小数点と 3 桁区切りも読む)、読めない文字は元の文字のまま(`validationMode` の `'mark'` なら印、`'reject'` なら書かない)。
 * `strip` で通貨記号や単位を先に外し、`negativeParentheses` で `(1,200)` を `-1200` と読む。
 */
export function numberParser(options: NumberParserOptions = {}): (raw: string) => unknown {
  const strip = (options.strip ?? []).filter((text) => text !== '');
  const negativeParentheses = options.negativeParentheses === true;
  return (raw) => {
    if (raw.trim() === '') {
      return null;
    }
    let text = raw;
    for (const part of strip) {
      text = text.split(part).join('');
    }
    let negative = false;
    if (negativeParentheses) {
      const match = PARENTHESES_PATTERN.exec(text);
      if (match) {
        text = match[1] ?? '';
        // 変更(1.1.0 / AP-09 の見直し): かっこの中に符号がある((-5) / (−1,200) / (+5))ときは、どちらの向きか決められないので
        //   読めない文字として元の文字列を返します(符号が打ち消し合って正の数になっていた)。
        if (SIGN_PREFIX_PATTERN.test(text)) {
          return raw;
        }
        negative = true;
      }
    }
    const parsed = parseNumberText(text);
    if (parsed === null) {
      return raw;
    }
    return negative && parsed !== 0 ? -parsed : parsed;
  };
}