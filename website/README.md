# website — ドキュメントサイト

SpreadsheetGrid のドキュメントサイト(Next.js 16 + Fumadocs 16 + Tailwind v4)。pnpm workspace のメンバーで、ライブラリ本体は `link:..` で参照している(デモは常にローカルの `dist` に対して動く)。

## コマンド(この Mac では vp 経由)

```sh
# 依存インストール(リポジトリルートで)
vp install

# lib のビルド(デモは dist を参照するため、lib 変更後に必要)
vp run build:lib

# 開発サーバ(website/ で)
cd website && vp exec next dev

# 本番ビルド + 起動(website/ で)
cd website && vp exec next build
cd website && vp exec next start
```

## 構成

- `content/docs/` — MDX コンテンツ(`meta.json` がサイドバー順)
- `components/demo/` — ライブデモ(`'use client'`。`components/mdx.tsx` に登録すると MDX から `<XxxDemo />` で埋め込める)
- `app/api/ssrm/` — SSRM デモ用 Route Handler(シード固定 50,000 行・ステートレス。遅延 / 失敗は body パラメータでシミュレート)
- `lib/shared.ts` — サイト名 / GitHub リポジトリ設定

## 注意

- ルートの eslint / tsc -b / vitest の対象外(website 内は `next build` が型チェックを兼ねる)。
- コンテンツページ追加後に該当ページだけ 404 になる場合はビルドキャッシュ起因。`rm -rf .next` してから `next build` する(2026-07-18 に grouping ページで発生)。
- API リファレンス(`content/docs/api/`)は `src/components/spreadsheet-grid/API_REFERENCE.md` からの複製。**型を変えたら両方を同期すること**(将来は自動生成へ移行したい)。
- Vercel デプロイ: Root Directory を `website` に設定。install はリポジトリルートの pnpm(overrides 込み)で走り、build 前に `pnpm run build:lib` が必要(Build Command: `cd .. && pnpm run build:lib && cd website && next build`)。