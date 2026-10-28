# サンプル

ブラウザだけで動かせる SpreadsheetGrid のサンプルです。リンクを開くと StackBlitz の中で `npm install` → `npm run dev` が走り、そのまま編集して試せます(インストール不要)。

| サンプル | 内容 | 開く |
| --- | --- | --- |
| [basic](./basic) | 編集できる在庫表(10,000 行)。固定列 / エディタ(数値・選択・日付)/ バリデーション / ソート・フィルター / 条件付き書式 / 合計行 / フィルハンドル / セル内検索 / CSV | [StackBlitz で開く](https://stackblitz.com/fork/github/ishibashi0112/datasheet-grid/tree/main/examples/basic?file=src/App.tsx&terminal=dev) |
| [server-side](./server-side) | サーバーサイド行モデル。100,000 件を見えている分だけ取得し、ソート / フィルター / 検索はサーバー側で処理、編集は保存(失敗すると元の値へ戻る) | [StackBlitz で開く](https://stackblitz.com/fork/github/ishibashi0112/datasheet-grid/tree/main/examples/server-side?file=src/App.tsx&terminal=dev) |
| [astryx](./astryx) | Astryx(Meta のデザインシステム)の中に置いたグリッド。`themes/astryx.css` で配色を揃え、セルに Astryx の部品を描く | [StackBlitz で開く](https://stackblitz.com/fork/github/ishibashi0112/datasheet-grid/tree/main/examples/astryx?file=src/App.tsx&terminal=dev) |

どれも Vite + React + TypeScript の単体のプロジェクトで、npm に公開されている `@ishibashi0112/spreadsheet-grid` を使います。

Vite は 7 にしています。Vite 8(Rolldown)は、2026-10-25 から StackBlitz の中で起動できなくなっているためです(Rolldown の WebAssembly 版の部品が読み込めない上流の不具合。手元では Vite 8 でも動きます)。

## 手元で動かす

```sh
cd examples/basic
npm install
npm run dev
```

このリポジトリは pnpm の workspace ですが、サンプルは workspace に入っていません。pnpm で入れるときは `pnpm install --ignore-workspace` にしてください。

## サンプルを直すとき

- サンプルは公開版に依存するので、依存の版(`^X.Y.Z`)は版上げのときに `scripts/bump-version.mjs` が今の版へ書き換えます。
- `pnpm run build:lib` の後に `pnpm run examples:check` を実行すると、各サンプルを今のコード(pack した tarball)で型チェック + ビルドします(CI でも実行)。

ドキュメント: https://datasheet-grid.vercel.app