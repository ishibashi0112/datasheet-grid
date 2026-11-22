// React 版と Solid 版のハーネスのページへ、同じでたらめな操作を流して比べる(Solid 版の測り直し 段階 4 1-2)。
//   2 つの dev サーバー(`pnpm run audit:dev` = 5177 と `pnpm run audit:dev:solid` = 5179)を先に立てておく。
//   種(seed)ごとに同じ操作の列を作り、1 手ごとに両方の「見えるもの」(描いたセルの文字と状態・エディタ・バーの文字・
//   ポップアップ)と「通知」(window.__events)と「状態」(ハンドルの getState / getActiveCell / getSelection / 行のデータ)を
//   比べる。最初に食い違った手で、その種の操作の列と差を出して次の種へ進む。
//
//   node audit/harness/t-diff.mjs                         # 既定: 5 つのシナリオ × 種 8 個 × 120 手
//   SSG_DIFF_SCENARIOS=basic SSG_DIFF_SEEDS=20 SSG_DIFF_STEPS=300 node audit/harness/t-diff.mjs
//   SSG_DIFF_SEED=7 SSG_DIFF_SCENARIOS=grouping SSG_DIFF_SEEDS=1 SSG_DIFF_VERBOSE=1 node audit/harness/t-diff.mjs  # 1 つを詳しく
//
//   比べないもの: 時刻(t)、スクロールとホバーの通知(onScroll / onHoveredRowChange。フレームの区切りで回数が変わる)と
//   行 / 列のホバーの印のクラス(SSG_DIFF_KEEP_HOVER=1 で両方とも比べる)、
//   動きのためのクラスと style(motion="off" にしてから始める)、要素の並びの順(セルの番地で並べ替えて比べる)。
import playwright from 'playwright-core';
import { CHROME, OUT } from './pw.mjs';
import { writeFileSync } from 'node:fs';

const REACT_BASE = process.env.SSG_DIFF_REACT ?? 'http://127.0.0.1:5177/';
const SOLID_BASE = process.env.SSG_DIFF_SOLID ?? 'http://127.0.0.1:5179/';
const SCENARIOS = (process.env.SSG_DIFF_SCENARIOS ?? 'basic,grouping,label,detail,rowdrag').split(',');
const SEEDS = Number(process.env.SSG_DIFF_SEEDS ?? 8);
const FIRST_SEED = Number(process.env.SSG_DIFF_SEED ?? 1);
const STEPS = Number(process.env.SSG_DIFF_STEPS ?? 120);
const VERBOSE = process.env.SSG_DIFF_VERBOSE === '1';
const ROWS = Number(process.env.SSG_DIFF_ROWS ?? 60);

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 押す列(非表示の secret と、ドラッグの的になりやすい列の境目を避ける)。
const COLS = ['id', 'name', 'qty', 'price', 'category', 'date', 'active', 'note', 'score', 'custom', 'status'];
const KEYS = [
  'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Shift+ArrowDown', 'Shift+ArrowRight', 'Shift+ArrowUp', 'Tab', 'Shift+Tab',
  'Enter', 'Shift+Enter', 'Escape', 'Delete', 'Backspace', 'F2', 'Home', 'End', 'Control+Home', 'Control+End', 'PageDown',
  'PageUp', 'Control+ArrowDown', 'Control+ArrowRight', 'Control+z', 'Control+y', 'Control+a', ' ', 'Alt+ArrowDown',
];
const TEXTS = ['a', 'x1', '12', '-5', '3.5', '', 'あ', 'C', '2026-01-02'];
const PASTES = ['p', '1\t2', '7\n8', 'q\tr\ns\tt'];

// 種から操作の列を作る(両方のページへ同じ列を流す)。
function makeOps(seed, steps) {
  const rnd = mulberry32(seed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const row = () => Math.floor(rnd() * 12);
  const ops = [];
  for (let i = 0; i < steps; i += 1) {
    const r = rnd();
    if (r < 0.22) ops.push({ op: 'click', row: row(), col: pick(COLS) });
    else if (r < 0.27) ops.push({ op: 'click', row: row(), col: pick(COLS), modifiers: ['Shift'] });
    else if (r < 0.3) ops.push({ op: 'click', row: row(), col: pick(COLS), modifiers: ['Control'] });
    else if (r < 0.62) ops.push({ op: 'key', key: pick(KEYS) });
    else if (r < 0.72) ops.push({ op: 'type', text: pick(TEXTS), then: pick(['Enter', 'Tab', 'Escape', 'Enter']) });
    else if (r < 0.76) ops.push({ op: 'dblclick', row: row(), col: pick(COLS) });
    else if (r < 0.8) ops.push({ op: 'paste', text: pick(PASTES) });
    else if (r < 0.84) ops.push({ op: 'header', col: pick(COLS) });
    else if (r < 0.87) ops.push({ op: 'scroll', top: Math.floor(rnd() * 600), left: Math.floor(rnd() * 400) });
    else if (r < 0.9) ops.push({ op: 'rowCheck', row: row() });
    else if (r < 0.93) ops.push({ op: 'toggle', row: row() });
    else if (r < 0.96) ops.push({ op: 'blur' });
    else ops.push({ op: 'menuKey' });
  }
  return ops;
}

const cellSelector = (row, col) => `.ssg-body-row[data-row-index="${row}"] .ssg-body-cell[data-ssg-col-key="${col}"]`;

// 1 手を流す。的が無いときは何もしない(両方で無いはずなので、比べる側で差になる)。
async function runOp(page, op) {
  switch (op.op) {
    case 'click':
    case 'dblclick': {
      const target = page.locator(cellSelector(op.row, op.col)).first();
      if ((await target.count()) === 0) return 'missing';
      const box = await target.boundingBox();
      if (!box) return 'hidden';
      const x = box.x + Math.min(box.width - 4, Math.max(4, box.width / 2));
      const y = box.y + box.height / 2;
      for (const m of op.modifiers ?? []) await page.keyboard.down(m);
      if (op.op === 'click') await page.mouse.click(x, y);
      else await page.mouse.dblclick(x, y);
      for (const m of op.modifiers ?? []) await page.keyboard.up(m);
      return 'ok';
    }
    case 'key':
      await page.keyboard.press(op.key);
      return 'ok';
    case 'type':
      if (op.text) await page.keyboard.type(op.text);
      await page.keyboard.press(op.then);
      return 'ok';
    case 'paste':
      await page.evaluate((text) => {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        const target = document.activeElement ?? document.querySelector('.ssg-shell');
        target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      }, op.text);
      return 'ok';
    case 'header': {
      const label = page.locator(`.ssg-header-cell[data-ssg-col-key="${op.col}"] .ssg-header-label`).first();
      if ((await label.count()) === 0) return 'missing';
      const box = await label.boundingBox();
      if (!box) return 'hidden';
      await page.mouse.click(box.x + 6, box.y + box.height / 2);
      return 'ok';
    }
    case 'scroll':
      await page.evaluate(({ top, left }) => {
        const sc = document.querySelector('.ssg-scroll-container');
        if (sc) {
          sc.scrollTop = top;
          sc.scrollLeft = left;
        }
      }, op);
      return 'ok';
    case 'rowCheck': {
      const box = page.locator(`.ssg-body-row[data-row-index="${op.row}"] input[type="checkbox"]`).first();
      if ((await box.count()) === 0) return 'missing';
      await box.click();
      return 'ok';
    }
    case 'toggle': {
      // グループの開閉 / 展開行のトグル(シナリオに無ければ何もしない)。
      const toggle = page
        .locator(`.ssg-body-row[data-row-index="${op.row}"] :is(.ssg-group-toggle, .ssg-detail-toggle, [data-ssg-detail-toggle])`)
        .first();
      if ((await toggle.count()) === 0) return 'missing';
      await toggle.click();
      return 'ok';
    }
    case 'blur':
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      return 'ok';
    case 'menuKey':
      await page.keyboard.press('Shift+F10');
      return 'ok';
    default:
      throw new Error(`知らない操作: ${op.op}`);
  }
}

// 両方のページで同じ形に読める「見えるもの」と「状態」と「通知」。
async function snapshot(page) {
  return page.evaluate(() => {
    const MOTION = /^(ssg-row-enter|ssg-motion|ssg-flash|ssg-col-drag|ssg-.*--(animating|enter|leaving|flash|settling))/;
    // 行ホバーの印も通知と同じく既定では比べない。動かないポインタの下で表がスクロールしたとき(Enter で下へ移って追従した等)、
    //   React 版は合成イベントの pointerover が外れた要素を起点にして enter を出さず、印が前の行に残る(マウスを動かせば直る)。
    //   Solid 版はセルの pointerenter をそのまま受けて今の行へ移す(2026-11-22 rowdrag seed=6 手 67)。
    const keepHoverClass = window.__diffKeepHover === true;
    const classes = (el) =>
      [...el.classList]
        .filter((c) => !MOTION.test(c) && (keepHoverClass || !/--([a-z]+-)?hovered$/.test(c)))
        .sort()
        .join('.');
    const cells = [];
    document.querySelectorAll('.ssg-body-row[data-row-index]').forEach((row) => {
      const index = row.getAttribute('data-row-index');
      const pane = row.closest('[data-pane]')?.getAttribute('data-pane') ?? row.getAttribute('data-pane') ?? '';
      row.querySelectorAll(':scope [role="gridcell"], :scope [role="rowheader"]').forEach((cell) => {
        cells.push(
          [
            pane,
            index,
            cell.getAttribute('data-ssg-col-key') ?? cell.getAttribute('role'),
            (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
            cell.getAttribute('aria-selected') ?? '',
            classes(cell),
          ].join('|'),
        );
      });
    });
    cells.sort();
    const editor = document.querySelector('.ssg-cell-editor');
    const editorInput = editor?.querySelector('input, textarea, select');
    const popups = [...document.querySelectorAll('.ssg-menu-panel, .ssg-filter-popover, .ssg-toolpanel, .ssg-find-bar, .ssg-fill-menu')]
      .map((el) => `${classes(el)}:${(el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)}`)
      .sort();
    const bars = [...document.querySelectorAll('.ssg-bar--top, .ssg-bar--bottom')].map((el) =>
      (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    const grid = window.__grid;
    // 1 回の操作で別々の通知が呼ばれるときの順番は React 版と違うことがある(docs/solid/README.md「残した違い(通知の順番)」)
    //   ので、通知の名前で並べ替えて比べる(同じ名前の中の順番・中身・回数は比べる。sort は安定)。
    const keepHover = window.__diffKeepHover === true;
    const events = window.__events
      .splice(0)
      .filter((e) => e.type !== 'onScroll' && (keepHover || e.type !== 'onHoveredRowChange'))
      .map((e) => `${e.type}:${JSON.stringify(e.payload ?? null)}`)
      .sort((a, b) => {
        const left = a.slice(0, a.indexOf(':'));
        const right = b.slice(0, b.indexOf(':'));
        return left < right ? -1 : left > right ? 1 : 0;
      });
    const active = document.activeElement;
    return {
      cells,
      editor: editor ? `${classes(editor)}=${editorInput && 'value' in editorInput ? editorInput.value : ''}` : null,
      popups,
      bars,
      focus: active === document.body ? 'body' : `${active?.tagName}.${active ? classes(active) : ''}`,
      state: grid ? JSON.stringify(grid.getState()) : null,
      activeCell: grid ? JSON.stringify(grid.getActiveCell()) : null,
      selection: grid ? JSON.stringify(grid.getSelection()) : null,
      rowSelection: grid ? JSON.stringify(grid.getRowSelection()) : null,
      undo: grid ? `${grid.canUndo()}/${grid.canRedo()}` : null,
      rows: JSON.stringify(window.__rows()),
      events,
      errors: window.__errors.splice(0),
    };
  });
}

// 描き終わるまで待つ(スクロールの位置が 3 フレーム続けて変わらなくなるまで(最大 1.5 秒)+ 少し。Solid 版と React 版で
//   同じ待ち方。なめらかなスクロールの途中で比べると、ポインタの下の行(ホバー)がフレームの区切りで違って見える)。
async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const started = performance.now();
        let last = '';
        let still = 0;
        const tick = () => {
          const sc = document.querySelector('.ssg-scroll-container');
          const now = sc ? `${sc.scrollTop},${sc.scrollLeft}` : '';
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= 3 || performance.now() - started > 1500) setTimeout(resolve, 40);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

function diffSnapshots(a, b) {
  const out = {};
  for (const key of Object.keys(a)) {
    const left = a[key];
    const right = b[key];
    if (JSON.stringify(left) === JSON.stringify(right)) continue;
    if (Array.isArray(left) && Array.isArray(right)) {
      const onlyLeft = left.filter((x) => !right.includes(x));
      const onlyRight = right.filter((x) => !left.includes(x));
      out[key] =
        onlyLeft.length + onlyRight.length > 0
          ? { react: onlyLeft.slice(0, 8), solid: onlyRight.slice(0, 8) }
          : { react: left.slice(0, 8), solid: right.slice(0, 8), note: '順番だけ違う' };
    } else {
      out[key] = { react: typeof left === 'string' ? left.slice(0, 400) : left, solid: typeof right === 'string' ? right.slice(0, 400) : right };
    }
  }
  return out;
}

async function openPage(browser, base, scenario) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(`[pageerror] ${e.message}`));
  await page.goto(`${base}?s=${scenario}&n=${ROWS}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForSelector('.ssg-root', { timeout: 30000 });
  // 動きを止め、行ラベルのシナリオではラベル行を混ぜる(main.tsx のデータには無いので、両方で同じ形に足す)。
  await page.evaluate((scenarioName) => {
    window.__setProps({ motion: 'off' });
    // 行のキー(id)を書き換えると React が同じキーの子の警告を出す(利用側の誤り)ので、id の列は編集させない。
    window.__setColumns(window.__columns().map((column) => (column.key === 'id' ? { ...column, editable: false } : column)));
    // 貼り付けで足す行のキーを決まった値にする(ハーネスの createRow は時刻と乱数でキーを作る)。
    let nextId = 900000;
    window.__setProps({ createRow: () => ({ ...window.__makeRows(1, 999)[0], id: (nextId += 1), name: '' }) });
    if (scenarioName === 'label') {
      const rows = window.__rows();
      const withLabels = [];
      rows.forEach((row, i) => {
        if (i % 10 === 0) withLabels.push({ ...row, id: 100000 + i, isLabel: true, label: `見出し ${i / 10 + 1}` });
        withLabels.push(row);
      });
      window.__setRows(withLabels);
    }
  }, scenario);
  await settle(page);
  await page.locator('.ssg-shell').first().focus();
  await page.evaluate((keepHover) => {
    window.__events.length = 0;
    window.__errors.length = 0;
    window.__diffKeepHover = keepHover;
  }, process.env.SSG_DIFF_KEEP_HOVER === '1');
  return { page, pageErrors, close: () => context.close() };
}

const browser = await playwright.chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), headless: true });
console.log(`BROWSER chromium ${browser.version()} / React ${REACT_BASE} と Solid ${SOLID_BASE} を比べる`);
const failures = [];
let compared = 0;
for (const scenario of SCENARIOS) {
  for (let seed = FIRST_SEED; seed < FIRST_SEED + SEEDS; seed += 1) {
    const ops = makeOps(seed * 1009 + scenario.length, STEPS);
    const react = await openPage(browser, REACT_BASE, scenario);
    const solid = await openPage(browser, SOLID_BASE, scenario);
    let failedAt = -1;
    let difference = null;
    const first = diffSnapshots(await snapshot(react.page), await snapshot(solid.page));
    if (Object.keys(first).length > 0) {
      failedAt = 0;
      difference = first;
    }
    for (let i = 0; failedAt < 0 && i < ops.length; i += 1) {
      const op = ops[i];
      const [ra, sa] = await Promise.all([runOp(react.page, op), runOp(solid.page, op)]);
      await Promise.all([settle(react.page), settle(solid.page)]);
      const [rs, ss] = await Promise.all([snapshot(react.page), snapshot(solid.page)]);
      compared += 1;
      const diff = diffSnapshots(rs, ss);
      if (ra !== sa) diff.target = { react: ra, solid: sa };
      if (react.pageErrors.length + solid.pageErrors.length > 0) {
        diff.pageErrors = { react: react.pageErrors.splice(0), solid: solid.pageErrors.splice(0) };
      }
      if (VERBOSE) {
        console.log(`  ${i + 1} ${JSON.stringify(op)} ${ra}${Object.keys(diff).length ? ' 差あり' : ''}`);
        if (rs.events.length + ss.events.length > 0) {
          console.log(`      React: ${rs.events.join(' / ').slice(0, 600)}`);
          console.log(`      Solid: ${ss.events.join(' / ').slice(0, 600)}`);
        }
      }
      if (Object.keys(diff).length > 0) {
        failedAt = i + 1;
        difference = diff;
      }
    }
    await react.close();
    await solid.close();
    if (failedAt < 0) {
      console.log(`PASS ${scenario} seed=${seed}(${ops.length} 手)`);
    } else {
      const record = { scenario, seed, step: failedAt, ops: ops.slice(0, failedAt), difference };
      failures.push(record);
      console.log(`FAIL ${scenario} seed=${seed} 手 ${failedAt} ${failedAt > 0 ? JSON.stringify(ops[failedAt - 1]) : '(始める前)'}`);
      console.log(`  差: ${JSON.stringify(difference).slice(0, 1500)}`);
    }
  }
}
await browser.close();
writeFileSync(`${OUT}t-diff.json`, JSON.stringify(failures, null, 2));
console.log(`\n== ${SCENARIOS.length * SEEDS - failures.length}/${SCENARIOS.length * SEEDS} の列で差なし(比べた手 ${compared})。差の記録は ${OUT}t-diff.json ==`);
process.exitCode = failures.length > 0 ? 1 : 0;