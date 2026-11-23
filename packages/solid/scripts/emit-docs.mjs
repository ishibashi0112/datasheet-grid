// 追加(1.3.0 の段 2-10 / R4-5): npm に同梱する API_REFERENCE.md を作ります(build:lib の最後)。中身は React 版の
//   packages/react/API_REFERENCE.md(props・列の定義・ハンドルのメソッド・通知・CSS は同じ)で、先頭に Solid 版での読み替えを
//   足します。写して作るので、片方だけ直してずれることはありません(生成物なので git には入れない = .gitignore)。
//   同梱の Skill(skills/spreadsheet-grid-solid/SKILL.md)はこのファイルを読ませます。
// 実行: cwd はパッケージ直下(packages/solid)。
import { readFileSync, writeFileSync } from 'node:fs';

const reference = readFileSync('../react/API_REFERENCE.md', 'utf8');
const preface = `<!-- このファイルは React 版の API_REFERENCE.md を Solid 版のパッケージへ写したものです(packages/solid/scripts/emit-docs.mjs)。 -->

> **Solid 版(\`@ishibashi0112/spreadsheet-grid-solid\`)で読むとき**
>
> この API リファレンスは React 版(\`@ishibashi0112/spreadsheet-grid\`)と同じ文書です。props・列の定義・ハンドルのメソッド・通知・CSS のクラスとトークンは Solid 版も同じなので、次のように読み替えてください。
>
> - import は \`@ishibashi0112/spreadsheet-grid-solid\` から。\`/lite\` の \`createSpreadsheetGrid\` と機能の部品も本体の入口にあります(\`/lite\` はありません)。\`/ai\` / \`/locales/en\` / \`/testing\` は同じ名前です。\`/ai\` の \`useGridAsk\` は \`createGridAsk\`(型の \`UseGridAskOptions\` / \`UseGridAskResult\` は \`CreateGridAskOptions\` / \`CreateGridAskResult\`)で、\`grid\` はハンドルを返す関数(\`grid={() => grid}\`)か signal です。
> - 例の \`useState\` は \`createSignal\`(\`rows={rows}\` は \`rows={rows()}\`)、\`useMemo\` は \`createMemo\`、\`useRef\` + \`ref={gridRef}\` は \`let grid!: SpreadsheetGridHandle<Row>\` + \`ref={grid}\`(\`gridRef.current\` は \`grid\`)、\`flushSync\` / テストの \`act()\` は \`solid-js\` の \`flush()\` です。
> - 型の \`ReactNode\` は \`JSX.Element\`、\`useEffect\` は \`createEffect\` / \`onSettled\`、\`Suspense\` は \`<Loading>\`、\`createPortal\` は \`<Portal>\`(\`@solidjs/web\`)です。
> - 「X.Y.Z から」の版は React 版とコア(\`@ishibashi0112/spreadsheet-grid-core\`)の版です。Solid 版では、そのコアの版に依存する版から使えます(Solid 版の変更履歴を見てください)。
> - Solid 版だけのこと(描く関数を呼び直す時機・書き込みの反映・テスト・SSR)は同梱の README.md の「Differences from the React version」「Solid-specific notes」(日本語は「React 版との違い」「Solid で気をつけること」)にあります。

`;
writeFileSync('API_REFERENCE.md', preface + reference);
console.log(`emit-docs: API_REFERENCE.md を書きました(${reference.split('\n').length} 行 + 読み替え)`);