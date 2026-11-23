// SSR の確かめの共通の部品(server.test.ts と hydrate.tsx。テストの前後の処理を持たない)。
// サーバーの HTML の、ハイドレーションする骨組み(隠してある)と、行を入れた写し(段 3-5。ハイドレーションしない)。
//   骨組みは 1.4.1 から .ssg-root を持たない(サーバーの HTML の .ssg-root は写しの 1 つだけ)ので、印の属性で探す。
export function splitServerHtml(html: string): { frame: HTMLElement | null; snapshot: HTMLElement | null } {
  const element = document.createElement('div');
  element.innerHTML = html;
  return {
    frame: element.querySelector<HTMLElement>('[data-ssg-ssr]'),
    snapshot: element.querySelector<HTMLElement>('.ssg-root[data-ssg-ssr-snapshot]'),
  };
}