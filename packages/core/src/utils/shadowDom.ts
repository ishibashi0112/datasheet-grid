// 追加(1.3.0 / Solid 版の品質の段 2 S11-01〜05): Shadow DOM の中のグリッドのための小道具です。
//   - window / document に付けたリスナーでは、Shadow root の中で起きたイベントの target が host に付け替わります
//     (event.target は host)。getEventTarget はイベントが起きた要素(composedPath の先頭)を返します。
//   - document.activeElement は、Shadow root の中にフォーカスがあるとき host です。getActiveElement は本当にフォーカスが
//     ある要素を返します(渡した要素と同じ Shadow root の activeElement を先に見て、無ければ document から open の
//     Shadow root をたどる)。
//   - getRootDocument / findInRoot は、Shadow root の中の要素を id で引くとき(document.getElementById は Shadow root の
//     中を見ない)に使います。
//   closed の Shadow root は外から中をたどれません(グリッドの要素から見る getActiveElement(context) だけが中を見られる)。

type ActiveElementRoot = { readonly activeElement: Element | null };

const hasActiveElement = (value: unknown): value is ActiveElementRoot =>
  typeof value === 'object' && value !== null && 'activeElement' in value;

const deepActiveElement = (active: Element | null): Element | null => {
  let current = active;
  while (current !== null && current.shadowRoot != null && current.shadowRoot.activeElement != null) {
    current = current.shadowRoot.activeElement;
  }
  return current;
};

// イベントが起きた要素です(Shadow root の中なら host ではなく中の要素)。
export function getEventTarget(event: Event): EventTarget | null {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  return path.length > 0 ? (path[0] ?? null) : event.target;
}

// フォーカスのある要素です。context(グリッドの要素など)を渡すと、その要素の Shadow root の中のフォーカスも見ます。
export function getActiveElement(context?: Node | null): Element | null {
  const doc =
    context?.nodeType === 9
      ? (context as Document)
      : (context?.ownerDocument ?? (typeof document === 'undefined' ? null : document));
  const root = context?.getRootNode?.();
  if (root != null && root !== doc && hasActiveElement(root) && root.activeElement !== null) {
    return deepActiveElement(root.activeElement);
  }
  return deepActiveElement(doc?.activeElement ?? null);
}

// 要素の id で引くときの場所(Shadow root の中なら Shadow root、それ以外は document)です。
export function findElementById(context: Node | null | undefined, id: string): HTMLElement | null {
  const root = context?.getRootNode?.() as (Node & { getElementById?: (id: string) => HTMLElement | null }) | undefined;
  if (root != null && typeof root.getElementById === 'function') {
    return root.getElementById(id);
  }
  const doc = context?.ownerDocument ?? (typeof document === 'undefined' ? null : document);
  return doc?.getElementById(id) ?? null;
}

// 要素が Shadow root の中にあるとき、その Shadow root です。
export function getShadowRoot(element: Node | null | undefined): ShadowRoot | null {
  const root = element?.getRootNode?.();
  return root != null && typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot ? root : null;
}