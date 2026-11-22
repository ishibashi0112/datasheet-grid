// 追加(1.3.0 / Solid 版の品質の段 2 S11-01〜05): Shadow DOM の中のグリッドのための小道具です。
//   - window / document に付けたリスナーでは、Shadow root の中で起きたイベントの target が host に付け替わります
//     (event.target は host)。getEventTarget(event, context) は、イベントが起きた要素を context と同じ木(グリッドのある
//     document か Shadow root)へ付け替えて返します。
//   - document.activeElement は、Shadow root の中にフォーカスがあるとき host です。getActiveElement(context) は、フォーカスの
//     ある要素を context と同じ木へ付け替えて返します(context の Shadow root の activeElement、無ければ document の)。
//   - getRootDocument / findInRoot は、Shadow root の中の要素を id で引くとき(document.getElementById は Shadow root の
//     中を見ない)に使います。
//   closed の Shadow root は外から中をたどれません(グリッドの要素から見る getActiveElement(context) だけが中を見られる)。
// 変更(1.3.0 の別視点のレビュー): グリッドの木より奥(グリッドの中に置いた Web Component の Shadow root の中)までは降りません。
//   セル・custom エディタ・展開行のカード・メニューの custom 項目の中の部品(Shoelace / Material Web / Lit など)が、
//   いちばん奥の要素を返すと `root.contains(x)` / `x.closest(...)`(Shadow の境界を越えない)で「グリッドの外」になり、
//   1.2.1 で効いていたツールチップ・Escape の印・カードのフォーカスなどが効かなくなっていた。ふつうの DOM のグリッドでは
//   1.2.1 と同じ(event.target / document.activeElement)。

type ActiveElementRoot = { readonly activeElement: Element | null };

const hasActiveElement = (value: unknown): value is ActiveElementRoot =>
  typeof value === 'object' && value !== null && 'activeElement' in value;

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && typeof (value as Node).getRootNode === 'function';

// context の木(document か Shadow root)。Window ならその document、省略は document。
const treeOf = (context: Node | Window | null | undefined): Node | null => {
  if (context == null) {
    return typeof document === 'undefined' ? null : document;
  }
  if (isNode(context)) {
    return context.getRootNode();
  }
  return (context as Window).document ?? null;
};

// イベントが起きた要素を context の木へ付け替えたものです(composedPath の中で、その木に属する最初の要素)。その木を
//   通らないイベント(Shadow root の中のグリッドで、body に出したポップアップを押した など)は document の木の最初の要素。
//   context を省くと document の木(= window / document で受けたときの event.target)。
export function getEventTarget(event: Event, context?: Node | Window | null): EventTarget | null {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  if (path.length === 0) {
    return event.target;
  }
  const tree = treeOf(context);
  let inDocument: EventTarget | null = null;
  for (const node of path) {
    if (!isNode(node)) {
      continue;
    }
    const root = node.getRootNode();
    if (root === tree) {
      return node;
    }
    if (inDocument === null && root.nodeType === 9) {
      inDocument = node;
    }
  }
  return inDocument ?? path[0] ?? event.target;
}

// フォーカスのある要素を context の木へ付け替えたものです。context が Shadow root の中にあり、その中にフォーカスがあれば
//   Shadow root の activeElement、それ以外は document.activeElement。
export function getActiveElement(context?: Node | null): Element | null {
  const doc =
    context?.nodeType === 9
      ? (context as Document)
      : (context?.ownerDocument ?? (typeof document === 'undefined' ? null : document));
  const root = context?.getRootNode?.();
  if (root != null && root !== doc && hasActiveElement(root) && root.activeElement !== null) {
    return root.activeElement;
  }
  return doc?.activeElement ?? null;
}

// いちばん奥の(open な Shadow root をたどった)フォーカスのある要素です。フォーカスを後で戻すとき(一時的に別の要素へ
//   移す間に控える)だけに使います。グリッドの中か外かの判定には getActiveElement(context) を使います。
export function getDeepActiveElement(): Element | null {
  let current = typeof document === 'undefined' ? null : document.activeElement;
  while (current !== null && current.shadowRoot != null && current.shadowRoot.activeElement != null) {
    current = current.shadowRoot.activeElement;
  }
  return current;
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