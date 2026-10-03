# @ishibashi0112/spreadsheet-grid-core

The framework-agnostic core of [`@ishibashi0112/spreadsheet-grid`](https://www.npmjs.com/package/@ishibashi0112/spreadsheet-grid): state store, derived-value computation, commands and DOM controllers. It does not depend on React.

**You normally do not install or import this package directly.** It is a regular dependency of the React package, which re-exports the public types. Use `@ishibashi0112/spreadsheet-grid` in React apps.

## What is in here

- Public type definitions with JSDoc. The field docs of `SpreadsheetGridProps`, `GridColumn`, `SpreadsheetGridHandle` and the other option types are in `dist/model/gridTypes.core.d.ts`; they match the tables in `API_REFERENCE.md` of the React package.
- Framework-agnostic modules under subpaths: `@ishibashi0112/spreadsheet-grid-core/<dir>/<module>` (`model` / `logic` / `controllers` / `engine` / `utils` / `testing`). They are building blocks for the framework adapters and are not covered by `API_REFERENCE.md`.

## License

MIT

---

## 日本語

[`@ishibashi0112/spreadsheet-grid`](https://www.npmjs.com/package/@ishibashi0112/spreadsheet-grid) のフレームワーク非依存コア(状態 store / 派生値計算 / コマンド / DOM コントローラ)です。React に依存しません。

**通常は直接インストール / import しません。** React 版パッケージの通常依存として自動で入り、公開型も React 版から再エクスポートされます。React アプリでは `@ishibashi0112/spreadsheet-grid` を使ってください。

- 公開型の定義(JSDoc 付き)。`SpreadsheetGridProps` / `GridColumn` / `SpreadsheetGridHandle` などのフィールドの説明は `dist/model/gridTypes.core.d.ts` にあり、React 版パッケージ同梱の `API_REFERENCE.md` の表と同じ内容です。
- サブパス `@ishibashi0112/spreadsheet-grid-core/<dir>/<module>`(`model` / `logic` / `controllers` / `engine` / `utils` / `testing`)のモジュールは各フレームワーク版(アダプタ)向けの部品で、`API_REFERENCE.md` の対象外です。