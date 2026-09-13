// 追加(slot-props / StyleX 併用): className 系スロットの値を解決する純関数群です(React 非依存)。
//   スロット値は `string | { className?, style? }` の 2 形を受けます。後者は StyleX の
//   stylex.props(...) の戻り値と同形で、そのまま渡せます。StyleX の動的スタイル(関数スタイル)は
//   「class + style 側の CSS 変数」の組で出力されるため、className だけの受け口では欠落します
//   ── これが本形式を採る理由です。style の型は S(React では CSSProperties)でジェネリックにし、
//   logic/ を React 非依存に保ちます(将来の別フレームワーク版でも同じ解決規則を共用します)。

export type SlotPropsLike<S> = string | { className?: string; style?: S };
export type ResolvedSlotProps<S> = { className?: string; style?: S };

// 空スロットの共有インスタンス(参照が安定するため memo 済み子コンポーネントの props が揺れません)。
const EMPTY_SLOT: ResolvedSlotProps<never> = Object.freeze({});

// スロット値を { className?, style? } へ正規化します。falsy(undefined / null / false / '')は空、
//   空文字の className は undefined 扱い、style は参照をそのまま保持します。
export function resolveSlotProps<S>(
  slot: SlotPropsLike<S> | null | undefined | false,
): ResolvedSlotProps<S> {
  if (!slot) {
    return EMPTY_SLOT as ResolvedSlotProps<S>;
  }
  if (typeof slot === 'string') {
    return { className: slot };
  }
  const className = slot.className || undefined;
  const style = slot.style ?? undefined;
  if (className === undefined && style === undefined) {
    return EMPTY_SLOT as ResolvedSlotProps<S>;
  }
  return { className, style };
}

export function slotClassName<S>(
  slot: SlotPropsLike<S> | null | undefined | false,
): string | undefined {
  return resolveSlotProps(slot).className;
}

export function slotStyle<S>(
  slot: SlotPropsLike<S> | null | undefined | false,
): S | undefined {
  return resolveSlotProps(slot).style;
}

// 複数の style を左→右の順で浅くマージします(右が勝つ)。全て空なら undefined を返し、
//   要素へ空の style 属性を付けません。
export function mergeStyles<S extends object>(
  ...styles: Array<S | undefined | null | false>
): S | undefined {
  let merged: S | undefined;
  for (const style of styles) {
    if (!style) {
      continue;
    }
    merged = merged === undefined ? { ...style } : Object.assign(merged, style);
  }
  return merged;
}

// style オブジェクトの浅い等価判定です(memo の比較関数用)。
export function shallowEqualStyle<S extends object>(
  a: S | undefined,
  b: S | undefined,
): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  const recordA = a as Record<string, unknown>;
  const recordB = b as Record<string, unknown>;
  for (const key of keysA) {
    if (!Object.is(recordA[key], recordB[key])) {
      return false;
    }
  }
  return true;
}

// props の浅い比較です。styleKeys に含まれるキーだけ shallowEqualStyle で内容比較し、それ以外は
//   Object.is で比較します。行コンポーネントの memo(getRowClassName が毎レンダー新しい style
//   オブジェクトを返しても内容が同じなら再レンダーしない)に使います。
export function arePropsEqualWithStyleKeys<P extends object>(
  prev: P,
  next: P,
  styleKeys: ReadonlySet<keyof P>,
): boolean {
  const prevKeys = Object.keys(prev) as Array<keyof P>;
  const nextKeys = Object.keys(next) as Array<keyof P>;
  if (prevKeys.length !== nextKeys.length) {
    return false;
  }
  for (const key of nextKeys) {
    if (!Object.prototype.hasOwnProperty.call(prev, key)) {
      return false;
    }
    const a = prev[key];
    const b = next[key];
    if (styleKeys.has(key)) {
      if (
        !shallowEqualStyle(
          a as object | undefined,
          b as object | undefined,
        )
      ) {
        return false;
      }
    } else if (!Object.is(a, b)) {
      return false;
    }
  }
  return true;
}

// スロット表(classNames prop)を解決済みの表へ変換します。空スロットのキーは落とします。
export function resolveSlotMap<K extends string, S>(
  map: Partial<Record<K, SlotPropsLike<S> | undefined>> | null | undefined,
): Partial<Record<K, ResolvedSlotProps<S>>> {
  const resolved: Partial<Record<K, ResolvedSlotProps<S>>> = {};
  if (!map) {
    return resolved;
  }
  for (const key of Object.keys(map) as K[]) {
    const slot = resolveSlotProps<S>(map[key]);
    if (slot.className !== undefined || slot.style !== undefined) {
      resolved[key] = slot;
    }
  }
  return resolved;
}

// スロット値 / スロット表の署名文字列です。内容が同じなら同じ文字列になるため、useMemo の deps に
//   使うと「利用側がレンダー毎に新しいオブジェクト(例: stylex.props() の戻り値をインラインで
//   渡す)を渡しても解決結果の参照が安定」します。スロットは文字列 / プレーンオブジェクトのみ
//   (関数を含まない)ため JSON で往復できます。
export function serializeSlotValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

// serializeSlotValue で作った署名からスロット表を復元して解決します。
export function resolveSlotMapFromSignature<K extends string, S>(
  signature: string,
): Partial<Record<K, ResolvedSlotProps<S>>> {
  return resolveSlotMap<K, S>(
    JSON.parse(signature) as Partial<Record<K, SlotPropsLike<S>>> | null,
  );
}

// serializeSlotValue で作った署名から単一スロットを復元して解決します。
export function resolveSlotFromSignature<S>(
  signature: string,
): ResolvedSlotProps<S> {
  return resolveSlotProps<S>(JSON.parse(signature) as SlotPropsLike<S> | null);
}