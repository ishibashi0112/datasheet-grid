// ツールパネルの枠の光り(開いたまま開き直したとき = ハンドルの openFilterManager / 列メニューの管理の項目 / 上部バーの
//   絞り込みのチップ)。0.46.1 から、後ろにあるポップアップの出現のアニメ(.ssg-popover の ssg-pop-in)が同じ詳細度で
//   上書きして光らず、クラス ssg-toolpanel--flash も外れずに残っていた(2026-11-20 に Solid 版の確認で見つけた)。
//   光ること・終われば外れること・出現のアニメをやり直さない(パネルが一瞬消えない)こと・続けて開き直しても光ること・
//   モーションを止めているときは光らないことを確かめる。
import { open, check, summary, unexpectedPageErrors, waitIdle } from './pw.mjs';

const panelState = (page) =>
  page.evaluate(() => {
    const panel = document.querySelector('.ssg-toolpanel');
    if (!panel) {
      return null;
    }
    const style = getComputedStyle(panel);
    return {
      flash: panel.classList.contains('ssg-toolpanel--flash'),
      opacity: style.opacity,
      transform: style.transform,
      // 走っているアニメの名前(getAnimations が無いブラウザでは null)。
      running:
        typeof panel.getAnimations === 'function'
          ? panel
              .getAnimations()
              .filter((animation) => animation.playState === 'running')
              .map((animation) => animation.animationName ?? '?')
          : null,
      // 光っている間は枠の外側にアクセント色の輪が足される(影が 3 つになる)。
      ring: style.boxShadow.split(/,(?![^(]*\))/).length >= 3,
    };
  });

// 開き直した直後から終わるまで、出現のアニメのやり直し(opacity が 1 未満)が無いかを毎フレーム見る。
const watchReopen = (page, durationMs) =>
  page.evaluate(async (ms) => {
    const panel = document.querySelector('.ssg-toolpanel');
    let minOpacity = 1;
    let sawRing = false;
    const ends = [];
    const onEnd = (event) => ends.push(event.animationName);
    panel?.addEventListener('animationend', onEnd);
    const started = performance.now();
    window.__grid.openFilterManager();
    await new Promise((resolve) => {
      const tick = () => {
        if (panel) {
          const style = getComputedStyle(panel);
          minOpacity = Math.min(minOpacity, Number(style.opacity));
          sawRing ||= style.boxShadow.split(/,(?![^(]*\))/).length >= 3;
        }
        if (performance.now() - started >= ms) {
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
    panel?.removeEventListener('animationend', onEnd);
    return { minOpacity, sawRing, ends, flashAfter: panel?.classList.contains('ssg-toolpanel--flash') ?? null };
  }, durationMs);

{
  const { page, pageErrors, close } = await open('basic');
  await waitIdle(page, 300);
  await page.evaluate(() => window.__grid.openFilterManager());
  await page.waitForSelector('.ssg-toolpanel', { timeout: 5000 });
  await waitIdle(page, 500);
  const opened = await panelState(page);
  check('toolpanel-flash: 開いた直後は光らない', opened !== null && !opened.flash && !opened.ring && opened.opacity === '1', opened);

  // 開いたまま開き直す: 光り、終われば外れ、出現のアニメはやり直さない。
  const first = await watchReopen(page, 900);
  check('toolpanel-flash: 開いたまま開き直すと枠が光る', first.sawRing, first);
  check('toolpanel-flash: 光り終えたらクラスが外れる(animationend)', first.ends.includes('ssg-toolpanel-flash') && first.flashAfter === false, first);
  check('toolpanel-flash: 出現のアニメをやり直さない(パネルが薄くならない)', first.minOpacity === 1 && !first.ends.includes('ssg-pop-in'), first);
  const settled = await panelState(page);
  check('toolpanel-flash: 終わった後は元の見た目(輪なし・不透明・アニメなし)', settled !== null && !settled.ring && settled.opacity === '1' && (settled.running === null || settled.running.length === 0), settled);

  // 続けてもう一度。
  const second = await watchReopen(page, 900);
  check('toolpanel-flash: 続けて開き直しても光る', second.sawRing && second.ends.includes('ssg-toolpanel-flash') && second.flashAfter === false && second.minOpacity === 1, second);

  // モーションを止めると光らない(出現のアニメも 0ms のまま)。
  await page.evaluate(() => window.__setProps({ motion: 'off' }));
  await waitIdle(page, 300);
  const off = await watchReopen(page, 600);
  check('toolpanel-flash: motion="off" では光らない', !off.sawRing && off.minOpacity === 1, off);

  check('toolpanel-flash: 想定外のエラーなし', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

summary();