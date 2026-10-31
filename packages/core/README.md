# @ishibashi0112/spreadsheet-grid-core

The framework-agnostic core of [`@ishibashi0112/spreadsheet-grid`](https://www.npmjs.com/package/@ishibashi0112/spreadsheet-grid): state store, derived-value computation, commands and DOM controllers. It does not depend on React.

**You normally do not install or import this package directly.** It is a regular dependency of the React package, which re-exports the public types. Use `@ishibashi0112/spreadsheet-grid` in React apps.

Docs and live demos: [datasheet-grid.vercel.app](https://datasheet-grid.vercel.app) · Changelog: [CHANGELOG.md](https://github.com/ishibashi0112/datasheet-grid/blob/main/CHANGELOG.md)

## What is in here

- Public type definitions with JSDoc. The field docs of `SpreadsheetGridProps`, `GridColumn`, `SpreadsheetGridHandle` and the other option types are in `dist/model/gridTypes.core.d.ts`; they match the tables in `API_REFERENCE.md` of the React package.
- Framework-agnostic modules under `@ishibashi0112/spreadsheet-grid-core/internal/<dir>/<module>` (`model` / `logic` / `controllers` / `engine` / `utils`). They are internal building blocks for the framework adapters (the React package uses them, and depends on the core of exactly the same version), are not covered by `API_REFERENCE.md` or semver, and may change in any release. The old subpaths without `internal/` (`@ishibashi0112/spreadsheet-grid-core/<dir>/<module>`) are deprecated since 0.60.0 and will be removed in 0.61.0; import from the entry point `@ishibashi0112/spreadsheet-grid-core` instead. If you use the core directly alongside the React package, install the same version of both (a different version installs a second copy of the core). The public entry points are `@ishibashi0112/spreadsheet-grid-core` and `/testing` ([Versioning](https://datasheet-grid.vercel.app/docs/versioning), Japanese).

## License

MIT

---

## 日本語

[`@ishibashi0112/spreadsheet-grid`](https://www.npmjs.com/package/@ishibashi0112/spreadsheet-grid) のフレームワーク非依存コア(状態 store / 派生値計算 / コマンド / DOM コントローラ)です。React に依存しません。

**通常は直接インストール / import しません。** React 版パッケージの通常依存として自動で入り、公開型も React 版から再エクスポートされます。React アプリでは `@ishibashi0112/spreadsheet-grid` を使ってください。

ドキュメントとライブデモ: [datasheet-grid.vercel.app](https://datasheet-grid.vercel.app) · 変更履歴: [CHANGELOG.md](https://github.com/ishibashi0112/datasheet-grid/blob/main/CHANGELOG.md)

- 公開型の定義(JSDoc 付き)。`SpreadsheetGridProps` / `GridColumn` / `SpreadsheetGridHandle` などのフィールドの説明は `dist/model/gridTypes.core.d.ts` にあり、React 版パッケージ同梱の `API_REFERENCE.md` の表と同じ内容です。
- `@ishibashi0112/spreadsheet-grid-core/internal/<dir>/<module>`(`model` / `logic` / `controllers` / `engine` / `utils`)のモジュールは、各フレームワーク版(アダプタ)が使う内部の部品です(React 版が使っていて、同じ版の core に固定で依存します)。`API_REFERENCE.md` と semver の対象外で、どの版でも変わることがあります。`internal/` の無い旧サブパス(`@ishibashi0112/spreadsheet-grid-core/<dir>/<module>`)は 0.60.0 から非推奨で、0.61.0 で消します。代わりに入口 `@ishibashi0112/spreadsheet-grid-core` から import してください。React 版と一緒に core も直接使うときは、両方を同じ版にそろえてください(違う版だと core が 2 つ入ります)。公開の入口は `@ishibashi0112/spreadsheet-grid-core` と `/testing` です([バージョンと互換性](https://datasheet-grid.vercel.app/docs/versioning))。