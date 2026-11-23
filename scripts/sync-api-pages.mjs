// 追加(ドキュメントの整備 2026-11-15): ドキュメントサイトの API リファレンス(website/content/docs/api/*.mdx)を
//   packages/react/API_REFERENCE.md から生成します。
//   目的: サイトの API リファレンスは API_REFERENCE.md の複製ですが、手で写していたため、正本だけ直して
//   サイトが古いまま(またはその逆)の行が 10 か所以上たまっていました。正本は API_REFERENCE.md で、
//   サイトのページはその ## 節(と一部の ### 節)を下の PAGES の割り当てどおりに並べたものです。
//   サイトのページは手で編集しません(API_REFERENCE.md を直して再生成)。
//   - 正本のドキュメントサイトへの絶対 URL(https://datasheet-grid.vercel.app/docs/…)は、サイトでは
//     相対パス(/docs/…)に置き換えます。npm 同梱の API_REFERENCE.md からもガイドへ飛べるように、
//     正本では絶対 URL で書きます。
//   - 正本に ## 節を足したら、PAGES のどれかのページへ割り当てます(割り当てが無いと止まる)。
//   使い方(リポジトリ直下で):
//     node scripts/sync-api-pages.mjs           … サイトのページを再生成して書き込む(pnpm run docs:api)
//     node scripts/sync-api-pages.mjs --check   … ずれがあれば exit 1(書き込まない)
//   同期は packages/react/src/apiReferencePages.test.ts(vp test)でも検査します。
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REFERENCE_PATH = 'packages/react/API_REFERENCE.md';
export const PAGES_DIR = 'website/content/docs/api';
export const SITE_DOCS_URL = 'https://datasheet-grid.vercel.app/docs/';
// 各ページの先頭に置く React / Solid の注記(website/components/mdx.tsx に登録した部品)
export const FRAMEWORK_NOTE = '<ApiFrameworkNote />';

// サイトのページの割り当てです。sections は正本の ## 見出しの先頭の文字列(並べる順)。
//   moveIn: 別の ## 節の ### 節を、このページの ### 節(after)の後ろへ移します(正本では列定義の節の
//   後ろに置いている、グリッドの prop の機能の節をサイトでは props のページに置くため)。
export const PAGES = [
  {
    file: 'props.mdx',
    title: 'SpreadsheetGrid props',
    description: 'SpreadsheetGridProps<T> の全 prop と既定値',
    sections: [
      'SpreadsheetGrid props',
      'パーツ別スロット',
      'スタイリング用の状態クラス',
      'CSS トークン',
      '補助型',
    ],
    moveIn: {
      from: 'GridColumn props',
      after: 'スクロール位置インジケーター',
      blocks: ['展開行', 'ラベル行', '合計行', '固定行', '行ドラッグ並び替え'],
    },
  },
  {
    file: 'column.mdx',
    title: 'GridColumn props',
    description: '列定義(GridColumn<T>)・フィルター・エディタ・バリデーション・列幅・グルーピング',
    sections: ['GridColumn props'],
  },
  {
    file: 'handle.mdx',
    title: '命令的 API(ref ハンドル)',
    description: 'SpreadsheetGridHandle<T> のメソッド一覧',
    sections: ['命令的 API'],
  },
  {
    file: 'server-side.mdx',
    title: 'serverSide モード(SSRM)',
    description: 'dataSource / クエリ配線 / リフレッシュ / エラー処理 / 書き戻し',
    sections: ['serverSide モード'],
  },
  {
    file: 'lite.mdx',
    title: '/lite(機能を選んで組み込む)',
    description: 'createSpreadsheetGrid と 20 の機能の部品、プリセット standardFeatures、サイズ',
    sections: ['機能を選んで組み込む'],
  },
  {
    file: 'ai.mdx',
    title: '/ai(ことばで絞り込み)',
    description:
      'GridAskBar / useGridAsk と、頼みの組み立て・答えの検査(createGridAskRequest / readGridAskAnswer)',
    sections: ['ことばで絞り込み'],
  },
  {
    file: 'utilities.mdx',
    title: 'preloadGridPopups と /testing',
    description: 'ポップオーバー部品の先読みと、jsdom でグリッドを描くためのテスト支援',
    sections: ['ポップオーバー部品の遅延読み込み', 'テスト支援'],
  },
];

// 見出しで区切ります(コードブロックの中の # は見出しにしない)。
//   返り値: [{ heading, intro: string[], blocks: [{ heading, lines: string[] }] }](## 節ごと)
function parseSections(reference) {
  const sections = [];
  let section = null;
  let block = null;
  let inFence = false;
  for (const line of reference.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && line.startsWith('## ')) {
      section = { heading: line.slice(3), intro: [line], blocks: [] };
      block = null;
      sections.push(section);
      continue;
    }
    if (section === null) continue; // # の題と前書きはサイトに出さない
    if (!inFence && line.startsWith('### ')) {
      block = { heading: line.slice(4), lines: [line] };
      section.blocks.push(block);
      continue;
    }
    (block === null ? section.intro : block.lines).push(line);
  }
  return sections;
}

function trimTrailingBlank(lines) {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
  return out;
}

export function buildApiPages(reference) {
  const errors = [];
  const sections = parseSections(reference);
  const used = new Set();
  const findSection = (prefix) => {
    const hits = sections.filter((s) => s.heading.startsWith(prefix));
    if (hits.length !== 1) {
      errors.push(`${REFERENCE_PATH}: 「## ${prefix}」で始まる節が ${hits.length} 個あります(1 個のはず)`);
      return null;
    }
    used.add(hits[0]);
    return hits[0];
  };
  const pages = {};
  // 先に移す ### 節を決める(移す元のページから外すため)
  const moved = new Set();
  for (const page of PAGES) {
    if (!page.moveIn) continue;
    const from = sections.find((s) => s.heading.startsWith(page.moveIn.from));
    if (!from) continue;
    for (const prefix of page.moveIn.blocks) {
      const hits = from.blocks.filter((b) => b.heading.startsWith(prefix));
      if (hits.length !== 1) {
        errors.push(
          `${REFERENCE_PATH}: 「## ${page.moveIn.from}」の中に「### ${prefix}」で始まる節が ${hits.length} 個あります(1 個のはず)`,
        );
        continue;
      }
      moved.add(hits[0]);
    }
  }
  for (const page of PAGES) {
    const parts = [];
    for (const prefix of page.sections) {
      const section = findSection(prefix);
      if (!section) continue;
      parts.push(trimTrailingBlank(section.intro));
      for (const block of section.blocks) {
        if (moved.has(block)) continue;
        parts.push(trimTrailingBlank(block.lines));
        if (page.moveIn && section.heading.startsWith(page.sections[0]) && block.heading.startsWith(page.moveIn.after)) {
          const from = sections.find((s) => s.heading.startsWith(page.moveIn.from));
          for (const prefix of page.moveIn.blocks) {
            const hit = from?.blocks.find((b) => b.heading.startsWith(prefix));
            if (hit) parts.push(trimTrailingBlank(hit.lines));
          }
        }
      }
    }
    const body = parts.map((lines) => lines.join('\n')).join('\n\n');
    const frontmatter = `---\ntitle: ${page.title}\ndescription: ${page.description}\n---`;
    // 変更(Solid を対等に 2026-11-23): リファレンスは React 版と Solid 版で共通なので、各ページの先頭に注記を置く
    //   (website/components/api-framework-note.tsx。サイドバーで Solid を選んでいると Solid 版での読み替えを出す)。
    pages[page.file] = `${frontmatter}\n\n${FRAMEWORK_NOTE}\n\n${body.split(SITE_DOCS_URL).join('/docs/')}`;
  }
  for (const section of sections) {
    if (!used.has(section)) {
      errors.push(`${REFERENCE_PATH}: 「## ${section.heading}」をサイトのどのページにも割り当てていません(scripts/sync-api-pages.mjs の PAGES に足す)`);
    }
  }
  return { pages, errors };
}

// ── CLI ──────────────────────────────────────────────────────

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const check = process.argv.includes('--check');
  const { pages, errors } = buildApiPages(readFileSync(REFERENCE_PATH, 'utf8'));
  if (errors.length > 0) {
    console.error(`sync-api-pages: 正本の節とサイトのページが対応していません(${errors.length} 件)\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  const changed = [];
  for (const [file, content] of Object.entries(pages)) {
    const path = `${PAGES_DIR}/${file}`;
    let current = null;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      current = null;
    }
    if (current !== content) {
      changed.push(path);
      if (!check) writeFileSync(path, content);
    }
  }
  if (changed.length === 0) {
    console.log('sync-api-pages: サイトの API リファレンスは API_REFERENCE.md と同期済みです');
  } else if (check) {
    console.error(
      `sync-api-pages: サイトの API リファレンスが API_REFERENCE.md とずれています(${changed.length} ページ)。` +
        `pnpm run docs:api で再生成してください\n- ${changed.join('\n- ')}`,
    );
    process.exit(1);
  } else {
    console.log(`sync-api-pages: ${changed.length} ページを更新しました\n- ${changed.join('\n- ')}`);
  }
}