// React 版と Solid 版の DOM を比べるための書き出し(並びの差だけを消した、要素 1 つを 1 行にした文字列)。
//   - 属性は名前の順、class は語の順、style はプロパティの順(どちらも CSSOM を通した値で比べる)。
//   - id(React の useId と Solid の createUniqueId で形が違う)は出てきた順の番号へ置き換え、id を指す属性
//     (aria-activedescendant など)も同じ番号へ。
//   - コメントと空の文字は捨て、隣り合う文字はつなぐ(フレームワークが文字を分けて置く差を消す)。
//   - 入力欄は今の値(プロパティ)を比べ、input の value 属性と textarea の中の文字は見ない(React は制御された入力欄の
//     defaultValue = value 属性 / textarea の中の文字も書き、Solid はプロパティだけを書く。画面と読み上げに出るのはプロパティ)。
//   違いが出たら、行の差分でどの要素のどの属性かが分かる。

const ID_REFERENCE_ATTRIBUTES = new Set([
  'aria-activedescendant',
  'aria-controls',
  'aria-describedby',
  'aria-labelledby',
  'aria-owns',
  'for',
  'list',
]);

type IdMap = Map<string, string>;

const mapId = (ids: IdMap, value: string): string => {
  let mapped = ids.get(value);
  if (mapped === undefined) {
    mapped = `id${ids.size}`;
    ids.set(value, mapped);
  }
  return mapped;
};

const normalizeStyle = (element: Element): string => {
  const style = (element as HTMLElement).style;
  if (!style) {
    return element.getAttribute('style') ?? '';
  }
  const entries: string[] = [];
  for (let index = 0; index < style.length; index += 1) {
    const name = style.item(index);
    entries.push(`${name}:${style.getPropertyValue(name)}${style.getPropertyPriority(name) ? '!important' : ''}`);
  }
  return entries.sort().join(';');
};

const normalizeAttributes = (element: Element, ids: IdMap): string => {
  const parts: string[] = [];
  const names = element.getAttributeNames().sort();
  for (const name of names) {
    // 入力欄の value と、チェックボックスの checked は属性ではなくプロパティで比べる(下)。React は制御された checked を
    //   最初に描いたときだけ属性にも書く(後の変化は属性に出ない)ので、属性は比べても意味が無い。
    if ((name === 'value' || name === 'checked') && element.tagName === 'INPUT') {
      continue;
    }
    const raw = element.getAttribute(name) ?? '';
    let value: string;
    if (name === 'class') {
      value = raw.split(/\s+/).filter(Boolean).sort().join(' ');
      if (value === '') {
        continue;
      }
    } else if (name === 'style') {
      value = normalizeStyle(element);
      if (value === '') {
        continue;
      }
    } else if (name === 'id') {
      value = mapId(ids, raw);
    } else if (ID_REFERENCE_ATTRIBUTES.has(name)) {
      value = raw
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => mapId(ids, token))
        .join(' ');
    } else {
      value = raw;
    }
    parts.push(`${name}="${value}"`);
  }
  return parts.join(' ');
};

const serialize = (node: Node, depth: number, ids: IdMap, lines: string[]): void => {
  const indent = '  '.repeat(depth);
  let pendingText = '';
  const flushText = () => {
    if (pendingText !== '') {
      lines.push(`${indent}"${pendingText}"`);
      pendingText = '';
    }
  };
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      pendingText += child.textContent ?? '';
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }
    flushText();
    const element = child as Element;
    const tag = element.tagName.toLowerCase();
    const attributes = normalizeAttributes(element, ids);
    lines.push(`${indent}<${tag}${attributes ? ` ${attributes}` : ''}>`);
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      // 入力欄の今の値(属性ではなくプロパティ)も比べる。
      lines.push(`${indent}  value=${JSON.stringify((element as HTMLInputElement).value)}`);
      const input = element as HTMLInputElement;
      if (tag === 'input' && (input.type === 'checkbox' || input.type === 'radio')) {
        lines.push(`${indent}  checked=${input.checked}${input.indeterminate ? ' indeterminate' : ''}`);
      }
    }
    if (tag !== 'textarea') {
      serialize(element, depth + 1, ids, lines);
    }
  }
  flushText();
};

// 要素(とその子孫)を比べられる文字列へ。複数の要素(本体とポータル)を同じ id の対応で書き出すときは配列で渡す。
export function normalizeDom(roots: Element | readonly Element[]): string {
  const ids: IdMap = new Map();
  const lines: string[] = [];
  for (const root of Array.isArray(roots) ? roots : [roots]) {
    const holder = { childNodes: [root] } as unknown as Node;
    serialize(holder, 0, ids, lines);
  }
  return lines.join('\n');
}