// React 版と Solid 版の速さとメモリを同じ操作で比べます(段 3-4 / S5-22・S12-03・S12-04。本番ビルドで測る)。
//   1. 100 万行で Ctrl+End / Ctrl+Home(押してから描くまで。中央値)
//   2. 列の多い表(?wide=190 = 約 200 列 × 2 万行)で縦に 3000px ずつ 120 回飛ぶ(CDP の ScriptDuration = JS の時間)
//   3. 同じ表のヒープと DOM のノード(GC の後。開いた直後 / スクロールした後)
//   準備: 2 つのハーネスを本番ビルドして配る(README の「速さを比べる」)。
//   REACT_BASE=http://127.0.0.1:5181/ SOLID_BASE=http://127.0.0.1:5182/ node audit/harness/perf-compare.mjs [回数]
import playwright from 'playwright-core';
import { CHROME } from './pw.mjs';

const { chromium } = playwright;

const BASES = { react: process.env.REACT_BASE ?? 'http://127.0.0.1:5181/', solid: process.env.SOLID_BASE ?? 'http://127.0.0.1:5182/' };
const RUNS = Number(process.argv[2] ?? 2);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function open(app, query) {
  const browser = await chromium.launch({
    ...(CHROME ? { executablePath: CHROME } : {}),
    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${BASES[app]}?${query}`);
  await page.waitForSelector('.ssg-body-cell', { timeout: 120000 });
  await page.waitForTimeout(1500);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  return { browser, page, metrics };
}

// 条件が真になった次のフレームまでの時間(押す前に待ち始める)。
const paintAfter = (page, predicate) =>
  page.evaluate(
    (source) =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const test = new Function(`return (${source})`)();
        const tick = () => (test() ? requestAnimationFrame(() => resolve(Math.round(performance.now() - t0))) : requestAnimationFrame(tick));
        tick();
      }),
    predicate.toString(),
  );

async function ctrlEnd(app) {
  const { browser, page } = await open(app, 's=big');
  await page.locator('.ssg-body-row[data-pane=center] .ssg-body-cell').first().click();
  const end = [];
  const home = [];
  for (let i = 0; i < 8; i++) {
    let waiting = paintAfter(page, () => document.querySelector('.ssg-body-row[data-row-index="999999"]') !== null);
    await page.keyboard.press('Control+End');
    end.push(await waiting);
    await page.waitForTimeout(300);
    waiting = paintAfter(page, () => document.querySelector('.ssg-body-row[data-row-index="999999"]') === null);
    await page.keyboard.press('Control+Home');
    home.push(await waiting);
    await page.waitForTimeout(300);
  }
  await browser.close();
  return { end: median(end), home: median(home) };
}

async function jumps(app) {
  const { browser, page, metrics } = await open(app, 's=basic&n=20000&wide=190');
  const before = await metrics();
  await page.evaluate(async () => {
    const element = document.querySelector('.ssg-scroll-container');
    for (let i = 1; i <= 120; i++) {
      element.scrollTop = (i % 2 ? 1 : 2) * 3000 * ((i % 7) + 1);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
  });
  const after = await metrics();
  await browser.close();
  return { scriptMs: Math.round((after.ScriptDuration - before.ScriptDuration) * 1000) };
}

async function memory(app) {
  const { browser, page, metrics } = await open(app, 's=basic&n=20000&wide=190');
  const sample = async () => {
    await page.evaluate(() => {
      window.gc();
      window.gc();
    });
    const m = await metrics();
    return { heapMB: Math.round((await page.evaluate(() => performance.memory.usedJSHeapSize)) / 1e5) / 10, nodes: m.Nodes };
  };
  const load = await sample();
  await page.mouse.move(700, 300);
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(50);
    }
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(300, 0);
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(400);
  }
  const scrolled = await sample();
  await browser.close();
  return { load, scrolled };
}

for (const [name, fn] of [['Ctrl+End / Ctrl+Home(100 万行、ms)', ctrlEnd], ['縦に飛ぶ 120 回の JS(約 200 列、ms)', jumps], ['メモリ(約 200 列)', memory]]) {
  console.log(`== ${name}`);
  for (let run = 0; run < RUNS; run++) {
    for (const app of run % 2 ? ['react', 'solid'] : ['solid', 'react']) {
      console.log(app.padEnd(6), JSON.stringify(await fn(app)));
    }
  }
}