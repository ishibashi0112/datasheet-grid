// サイドバーのページの木を React 用と Solid 用に分ける(サーバーで作る)。
// content/docs/react と content/docs/solid のフォルダ(「はじめる」のページ)のうち、選んだほうを
// 「はじめる(React)」の区切りの下に平らに並べ、もう片方は外す。ガイドと API リファレンスは両方に同じものが入る。
import type * as PageTree from 'fumadocs-core/page-tree';
import { FRAMEWORK_LABEL, type Framework } from './framework-names';

function frameworkOfFolder(folder: PageTree.Folder): Framework | null {
  for (const framework of ['react', 'solid'] as const) {
    const prefix = `/docs/${framework}/`;
    const first = folder.index ?? folder.children.find((node) => node.type === 'page');
    if (first?.type === 'page' && first.url.startsWith(prefix)) return framework;
  }
  return null;
}

export function frameworkTree(tree: PageTree.Root, framework: Framework): PageTree.Root {
  const children: PageTree.Node[] = [];
  for (const node of tree.children) {
    if (node.type !== 'folder') {
      children.push(node);
      continue;
    }
    const owner = frameworkOfFolder(node);
    if (owner === null) {
      children.push(node);
    } else if (owner === framework) {
      children.push({ type: 'separator', $id: `framework-${framework}`, name: `はじめる(${FRAMEWORK_LABEL[framework]})` });
      if (node.index) children.push(node.index);
      children.push(...node.children);
    }
  }
  return { ...tree, $id: `${tree.$id ?? 'root'}-${framework}`, children };
}