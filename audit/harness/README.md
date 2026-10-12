# 監査ハーネス(audit/harness)

2026-10-04 の全体監査(`docs/audits/2026-10-04/`)で使った、ライブラリを実ブラウザ(Chromium)で叩く自動検証です。
ルートのゲート(tsc / eslint / vitest / build)の**対象外**で、定期的な「壊れていないか」確認に手動で回します。

## 使い方

```bash
# 1. 依存(ルートの devDependencies に playwright-core を含む)
vp install

# 2. ハーネスの dev サーバー(port 5177。ライブラリのソースを直接 import)
pnpm run audit:dev

# 3. 別ターミナルでシナリオを実行(PASS / FAIL を標準出力に出す)
pnpm run audit:test            # 基本 + 1M 行 + SSRM + ライフサイクル + 機能群 + 所見追試 + 集計 + 合計行 + フィルハンドル
node audit/harness/t-basic.mjs # 個別に 1 本だけ
node audit/harness/perf-big.mjs            # 1M 行の計測(dev ビルド)
HARNESS_BASE=http://127.0.0.1:5178/ node audit/harness/perf-big.mjs  # 本番ビルド(vp build → vp preview --port 5178)に対して
```

- Chromium は `SSG_AUDIT_CHROME`(実行ファイルパス)で指定できる。未指定なら Claude Code クラウド環境の既知パス、無ければ playwright-core の既定解決(`npx playwright install chromium` 済みが前提)。
- シナリオは `main.tsx` の `?s=<scenario>` で切り替わる: `basic` / `big` / `autoheight` / `grouping` / `detail` / `label` / `rowdrag` / `ssrm` / `empty` / `height` / `two`。`&strict=1` で StrictMode、`&n=<rows>` で行数、SSRM は `&noinit=1` で `initialRowCount` 未指定、autoheight は `&detail=1` で展開行を併用。
- `window.__grid`(ハンドル)/ `window.__rows()` / `window.__setRows` / `window.__setProps` / `window.__setColumns` / `window.__events`(コールバック記録)/ `window.__errors`(console.error / warn)/ `window.__listeners`(window / document リスナー数)/ `window.__ssrm`(SSRM モック制御)を公開しているので、ブラウザの DevTools から手で叩いて追試できる。
- `t-aggregates.mjs` は選択範囲の集計(下部バー)の値・表示・100 万行の時間分割・SSRM の部分集計。
- `t-total.mjs` は合計行(`totalRow`)の値・下端固定・最終行が合計行に隠れないこと(スクロール / 矢印キー / `scrollToRow` / `scrollToBottom`)・横スクロールと固定列の揃い・列ドラッグ(live)・行が少ないとき・ダークテーマ・100 万行・auto-height / グルーピング / ラベル行 / SSRM との併用。
- `t-fill.mjs` はフィルハンドル(`fillHandle`)のハンドルの位置・ドラッグ(点線 / 値のツールチップ / 自動スクロール)・連続データ / コピー・`Ctrl` で入れ替え・`Escape`・上 / 左へ・固定ペインをまたぐ・`validate` の reject / 編集不可を飛ばす・埋めたあとのボタンとメニュー(マウス / キーボード)・元に戻す / やり直し・ダブルクリック・出さないとき・ダークテーマ・グルーピング / ラベル行 / SSRM / 100 万行。
- `t-verify.mjs` は監査所見(RD-1 / RD-2 / C-1 / L-01 / C-3 / B-01 / B-02 / B-03 / V-02 …)の再現スクリプト。修正後は FAIL → PASS に変わることを確認する回帰テストとして使う。

## 出力の読み方

- `PASS` / `FAIL`: 期待どおり / 不具合または回帰。`FAIL` が 0 件であることが基準。
- `PENDING(判断待ち・未解消 / 解消済み)`: 監査所見のうち**挙動変更を伴うため未修正**のもの(`docs/audits/2026-10-04/README.md` §9)の追試。FAIL には数えない。修正したら「解消済み」に変わるので、そのとき `check` に格上げする。

## 注意

- テストは `waitIdle` の固定待ち時間を含むため、極端に遅いマシンではタイミング起因の FAIL が出ることがある(再実行で安定するものは所見ではない)。
- 1M 行シナリオの dev ビルド計測は React の開発ビルド固有の遅さ(所見 M-04)を含む。性能判断は本番ビルド(`HARNESS_BASE` で preview を指す)で行うこと。