// 追加(React 18 対応 2026-10-28): 命令的 API の ref を props で受け取るコンポーネントを、React 18 でも ref が届くようにします。
//   - React 19 は関数コンポーネントの ref を props として渡す(ref-as-prop)ので、そのまま返します(React 19 の利用者は従来と同じ部品)。
//   - React 18 は ref を props から外すため、forwardRef で受けて props の ref へ戻してから呼びます。React は forwardRef を
//     将来非推奨にすると案内しているので、19 以上では使いません。
//   - 版はモジュールの読み込み時に 1 回だけ見ます(同じアプリで React の版が途中で変わることはない)。
import { forwardRef, version, type ReactNode } from 'react';

export const withRefProp = <C extends (props: never) => ReactNode>(component: C): C =>
  (Number(version.split('.')[0]) >= 19
    ? component
    : forwardRef((props: object, ref) => (component as unknown as (props: object) => ReactNode)({ ...props, ref }))) as unknown as C;