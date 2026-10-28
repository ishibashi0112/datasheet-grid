// WebDriver(W3C)で監査ハーネスを動かすための、Playwright の Page / Locator / Mouse / Keyboard の「ハーネスが使う分だけ」の実装。
//   Linux では Playwright の WebKit / Firefox を入れられない環境がある(配布元へ届かない)ため、OS のパッケージの
//   WebKitGTK(WebKitWebDriver + MiniBrowser)や、別途入れた Firefox + geckodriver を W3C WebDriver で動かす。
//   pw.mjs の open() が SSG_AUDIT_BROWSER=webkitgtk / geckodriver のときにここを使う。
//   - 対応: goto / evaluate / waitForFunction / waitForSelector / waitForTimeout / locator / getByText / click / fill /
//     screenshot(clip は無視して画面全体)/ setViewportSize / mouse(move / down / up / click / dblclick / wheel)/
//     keyboard(press / type / down / up)/ on('console' | 'pageerror')。
//   - 非対応(呼ぶと例外): route / clock / emulateMedia / CDP / on('request')。テスト側は pw.mjs の SUPPORTS で飛ばす。
//   - Playwright との違い: ページのスクリプトより先には差し込めない(addInitScript とエラーの記録は goto の後から)。
//     操作の前の待ちは「要素がある + 見える」だけで、手前の要素に隠れていないか(hit target)は確かめない。
//     複数の要素に当たったとき(strict mode violation)は例外にせず先頭を使って警告を出す。
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';

const KEYS = {
  Enter: '', Tab: '', Escape: '', Backspace: '', Delete: '', Insert: '',
  ArrowLeft: '', ArrowUp: '', ArrowRight: '', ArrowDown: '',
  Home: '', End: '', PageUp: '', PageDown: '',
  Shift: '', Control: '', Alt: '', Meta: '', ControlOrMeta: '', Space: ' ',
  F1: '', F2: '', F3: '', F4: '', F5: '', F6: '',
  F7: '', F8: '', F9: '', F10: '', F11: '', F12: '',
};
const keyValue = (name) => KEYS[name] ?? (name.length === 1 ? name : (() => { throw new Error(`wd: unknown key ${name}`); })());
const BUTTONS = { left: 0, middle: 1, right: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const freePort = () => new Promise((resolve, reject) => {
  const srv = createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  srv.on('error', reject);
});

// ---------- ドライバ(プロセスごとに 1 つ起動し、open() ごとにセッションを作る)----------
const DRIVERS = {
  webkitgtk: {
    bin: process.env.SSG_AUDIT_WEBDRIVER ?? 'WebKitWebDriver',
    args: (port) => [`--port=${port}`],
    capabilities: () => ({
      'webkitgtk:browserOptions': {
        binary: process.env.SSG_AUDIT_MINIBROWSER ?? '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser',
        args: ['--automation'],
      },
    }),
  },
  geckodriver: {
    bin: process.env.SSG_AUDIT_WEBDRIVER ?? 'geckodriver',
    args: (port) => [`--port=${port}`],
    capabilities: () => ({
      browserName: 'firefox',
      'moz:firefoxOptions': {
        ...(process.env.SSG_AUDIT_FIREFOX ? { binary: process.env.SSG_AUDIT_FIREFOX } : {}),
        args: ['-headless'],
      },
    }),
  },
};
const running = new Map();
async function startDriver(kind) {
  if (running.has(kind)) return running.get(kind);
  const def = DRIVERS[kind];
  if (!def) throw new Error(`wd: unknown driver ${kind}`);
  if (kind === 'webkitgtk' && !process.env.DISPLAY) {
    throw new Error('wd: WebKitGTK には X のディスプレイが要ります。xvfb-run -a で包んで実行してください(例: xvfb-run -a env SSG_AUDIT_BROWSER=webkitgtk node audit/harness/t-basic.mjs)');
  }
  const port = await freePort();
  const proc = spawn(def.bin, def.args(port), { stdio: 'ignore' });
  proc.unref();
  process.on('exit', () => { try { proc.kill(); } catch { /* 終了済み */ } });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${url}/status`);
      if (r.ok) break;
    } catch { /* 起動待ち */ }
    await sleep(100);
  }
  const driver = { url, def, proc };
  running.set(kind, driver);
  return driver;
}

async function request(base, method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const json = text ? JSON.parse(text) : {};
  if (json.value && json.value.error) throw new Error(`wd ${method} ${path}: ${json.value.error}: ${json.value.message}`);
  return json.value;
}

// ---------- ページ内で使う部品(毎回スクリプトの先頭に入れる。遷移で消えるため)----------
const PAGE_PRELUDE = String.raw`
if (!window.__wdHooked) {
  window.__wdHooked = true;
  window.__wdLog = [];
  const fmt = (a) => { try { return typeof a === 'string' ? a : a instanceof Error ? a.message : JSON.stringify(a); } catch { return String(a); } };
  for (const k of ['error', 'warn']) {
    const orig = console[k];
    console[k] = function (...args) { try { window.__wdLog.push([k === 'warn' ? 'warning' : 'error', args.map(fmt).join(' ')]); } catch {} return orig.apply(this, args); };
  }
  window.addEventListener('error', (e) => window.__wdLog.push(['pageerror', String(e.message)]));
  window.addEventListener('unhandledrejection', (e) => window.__wdLog.push(['pageerror', String((e.reason && e.reason.message) || e.reason)]));
  // クリップボードの読み取りは WebDriver では許可できない(WebKit は拒み、Firefox は「貼り付け」の確認を出して待ち続ける)
  //   ため、グリッドが書いた文字列を覚えておき、読み取りはそれを返す(グリッドのコピーは必ず writeText か
  //   execCommand('copy') を通る)。書く側はそのまま動かす。
  const clip = navigator.clipboard;
  if (clip) {
    const write = clip.writeText?.bind(clip);
    const read = clip.readText?.bind(clip);
    // テストが page.evaluate から書き込む(ユーザー操作の中でない)ときは WebKit が拒むので、覚えるだけにして成功させる。
    //   キー操作の中(グリッドのコピー)で拒まれたときはそのまま投げ、グリッドの代替経路(execCommand)を動かす。
    if (write) clip.writeText = async (t) => {
      window.__wdClipboard = String(t);
      try { return await write(t); } catch (e) { if (navigator.userActivation && !navigator.userActivation.isActive) return; throw e; }
    };
    clip.readText = async () => {
      if (window.__wdClipboard !== undefined) return window.__wdClipboard;
      // まだ何も書いていないときだけ本物を読む(確認を出して待つブラウザのために 1 秒で諦める)。
      try { if (read) return await Promise.race([read(), new Promise((r) => setTimeout(() => r(''), 1000))]); } catch {}
      return '';
    };
  }
  const exec = document.execCommand.bind(document);
  document.execCommand = (cmd, ...rest) => {
    if (String(cmd).toLowerCase() === 'copy') {
      const el = document.activeElement;
      window.__wdClipboard = el && 'value' in el && typeof el.value === 'string' ? el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? el.value.length) : String(getSelection());
    }
    return exec(cmd, ...rest);
  };
}
const __wdNorm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const __wdTextMatch = (text, m) => {
  const t = __wdNorm(text);
  if (m.re) return new RegExp(m.re.source, m.re.flags).test(t);
  return m.exact ? t === __wdNorm(m.text) : t.toLowerCase().includes(__wdNorm(m.text).toLowerCase());
};
const __wdResolve = (chain) => {
  let els = null;
  for (const step of chain) {
    if (step.t === 'css') {
      const out = [];
      for (const root of els ?? [document]) for (const e of root.querySelectorAll(step.s)) if (!out.includes(e)) out.push(e);
      els = out;
    } else if (step.t === 'text') {
      const out = [];
      for (const root of els ?? [document.body]) {
        for (const e of root.querySelectorAll('*')) {
          if (/^(SCRIPT|STYLE|HEAD|NOSCRIPT|TEMPLATE)$/.test(e.tagName)) continue;
          if (!__wdTextMatch(e.textContent, step)) continue;
          if ([...e.children].some((c) => __wdTextMatch(c.textContent, step))) continue;
          if (!out.includes(e)) out.push(e);
        }
      }
      els = out;
    } else if (step.t === 'hasText') {
      els = (els ?? []).filter((e) => __wdTextMatch(e.textContent, { ...step, exact: false }));
    } else if (step.t === 'nth') {
      const list = els ?? [];
      const i = step.n < 0 ? list.length + step.n : step.n;
      els = list[i] ? [list[i]] : [];
    }
  }
  return els ?? [];
};
const __wdVisible = (e) => {
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
};
const __wdEncode = (v) => JSON.stringify({ v }, function (k, x) {
  const raw = this[k];
  if (raw === undefined) return { __wd: 'undef' };
  if (typeof raw === 'number' && !Number.isFinite(raw)) return { __wd: Number.isNaN(raw) ? 'nan' : raw > 0 ? 'inf' : '-inf' };
  if (raw instanceof Date) return { __wd: 'date', v: raw.getTime() };
  if (typeof raw === 'bigint') return String(raw);
  return x;
});
const __wdDrain = () => { const l = window.__wdLog || []; window.__wdLog = []; return l; };
`;
const decode = (s) => JSON.parse(s, (k, x) => {
  if (x && typeof x === 'object' && typeof x.__wd === 'string') {
    if (x.__wd === 'undef') return undefined;
    if (x.__wd === 'nan') return NaN;
    if (x.__wd === 'inf') return Infinity;
    if (x.__wd === '-inf') return -Infinity;
    if (x.__wd === 'date') return new Date(x.v);
  }
  return x;
}).v;
const fnSource = (fn) => (typeof fn === 'function' ? `(${fn.toString()})` : `(() => (${fn}))`);
const argSource = (arg) => (arg === undefined ? 'undefined' : JSON.stringify(arg));
const serializeMatcher = (text) => (text instanceof RegExp ? { re: { source: text.source, flags: text.flags } } : { text: String(text) });

class TimeoutError extends Error {}

// ---------- Locator ----------
class Locator {
  constructor(page, chain) {
    this._page = page;
    this._chain = chain;
  }
  locator(selector, options = {}) {
    const chain = [...this._chain, { t: 'css', s: selector }];
    if (options.hasText !== undefined) chain.push({ t: 'hasText', ...serializeMatcher(options.hasText) });
    return new Locator(this._page, chain);
  }
  first() { return new Locator(this._page, [...this._chain, { t: 'nth', n: 0 }]); }
  last() { return new Locator(this._page, [...this._chain, { t: 'nth', n: -1 }]); }
  nth(n) { return new Locator(this._page, [...this._chain, { t: 'nth', n }]); }
  filter({ hasText } = {}) {
    return hasText === undefined ? this : new Locator(this._page, [...this._chain, { t: 'hasText', ...serializeMatcher(hasText) }]);
  }
  getByText(text, options = {}) {
    return new Locator(this._page, [...this._chain, { t: 'text', ...serializeMatcher(text), exact: !!options.exact }]);
  }
  // 要素を 1 つに決めて fn(el, arg) をページ内で呼ぶ。visible = true なら見えるまで待つ。
  async _withElement(body, arg, { visible = false, timeout = 10000, wait = true } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const res = await this._page._run(
        `const els = __wdResolve(${JSON.stringify(this._chain)});
         if (els.length === 0) return { __wdMissing: 'none' };
         const el = els[0];
         if (${visible} && !__wdVisible(el)) return { __wdMissing: 'hidden' };
         const fn = ${body};
         return { count: els.length, value: await fn(el, ${argSource(arg)}) };`,
      );
      if (!res.__wdMissing) {
        if (res.count > 1) this._page._warnStrict(this._chain, res.count);
        return res.value;
      }
      if (!wait || Date.now() > deadline) throw new TimeoutError(`wd: locator ${JSON.stringify(this._chain)} not found (${res.__wdMissing}) within ${timeout}ms`);
      await sleep(50);
    }
  }
  // 操作する座標(要素の中央か position)を返す。Playwright と同じく、動きが止まるのを待ち、スクロール領域の中で
  //   全部見えていなければ中央へスクロールし、その点で別の要素が上にあれば(固定ヘッダーやスクロールバーの帯など)
  //   end / center / start の順にスクロールし直す。force なら何も確かめない。
  async _point({ position, force } = {}) {
    const p = await this._withElement(`async (el, a) => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
      const pick = () => {
        const r = el.getBoundingClientRect();
        return a.position ? { x: r.left + a.position.x, y: r.top + a.position.y } : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      if (!a.force) {
        for (let i = 0; i < 30; i++) {
          const r1 = el.getBoundingClientRect();
          await frame();
          const r2 = el.getBoundingClientRect();
          if (r1.top === r2.top && r1.left === r2.left && r1.width === r2.width && r1.height === r2.height) break;
        }
      }
      if (a.force) return pick();
      const fullyVisible = () => {
        const r = el.getBoundingClientRect();
        for (let n = el.parentElement; n; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (!/(auto|scroll|hidden|clip)/.test(cs.overflowX + ' ' + cs.overflowY)) continue;
          const c = n.getBoundingClientRect();
          if (r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5 || r.left < c.left - 0.5 || r.right > c.right + 0.5) return false;
        }
        return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
      };
      const hits = (p) => {
        const t = document.elementFromPoint(p.x, p.y);
        return !!t && (t === el || el.contains(t));
      };
      if (!fullyVisible()) { el.scrollIntoView({ block: 'center', inline: 'center' }); await frame(); }
      let p = pick();
      if (hits(p)) return p;
      for (const opt of [{ block: 'end', inline: 'end' }, { block: 'center', inline: 'center' }, { block: 'start', inline: 'start' }]) {
        el.scrollIntoView(opt);
        await frame();
        p = pick();
        if (hits(p)) return p;
      }
      const t = document.elementFromPoint(p.x, p.y);
      return { ...p, intercepted: t ? t.tagName + '.' + t.className : 'none' };
    }`, { position: position ?? null, force: !!force }, { visible: !force });
    if (p.intercepted) console.log(`WARN(wd) 操作する点が別の要素に隠れています(${p.intercepted}): ${JSON.stringify(this._chain)}`);
    return p;
  }
  async click(options = {}) {
    const { x, y } = await this._point(options);
    await this._page.mouse.click(x, y, options);
  }
  async dblclick(options = {}) {
    const { x, y } = await this._point(options);
    await this._page.mouse.click(x, y, { ...options, clickCount: 2 });
  }
  async hover(options = {}) {
    const { x, y } = await this._point(options);
    await this._page.mouse.move(x, y);
  }
  async focus() { await this._withElement('(el) => { el.focus(); }'); }
  async fill(value) {
    // Playwright と同じく、日付などキーで打てない入力欄は value を直接入れて input / change を送る。それ以外は全選択して打つ。
    const direct = await this._withElement(`(el, value) => {
      el.focus();
      const kinds = ['date', 'time', 'datetime-local', 'month', 'week', 'color', 'range'];
      if (el instanceof HTMLInputElement && kinds.includes(el.type)) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        if (el.value !== value) throw new Error('Malformed value: ' + value);
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      if (typeof el.select === 'function') el.select();
      return false;
    }`, value, { visible: true });
    if (direct) return;
    await this._page.keyboard.press('Control+a');
    await this._page.keyboard.press('Backspace');
    if (value) await this._page.keyboard.type(value);
  }
  async count() { return this._page._run(`return __wdResolve(${JSON.stringify(this._chain)}).length;`); }
  async textContent() { return this._withElement('(el) => el.textContent'); }
  async innerText() { return this._withElement('(el) => el.innerText'); }
  async inputValue() { return this._withElement('(el) => el.value'); }
  async getAttribute(name) { return this._withElement('(el, name) => el.getAttribute(name)', name); }
  async allTextContents() { return this._page._run(`return __wdResolve(${JSON.stringify(this._chain)}).map((e) => e.textContent);`); }
  async isVisible() {
    return this._page._run(`const els = __wdResolve(${JSON.stringify(this._chain)}); return els.length > 0 && __wdVisible(els[0]);`);
  }
  async boundingBox() {
    return this._withElement(`(el) => {
      const r = el.getBoundingClientRect();
      return r.width === 0 && r.height === 0 ? null : { x: r.left, y: r.top, width: r.width, height: r.height };
    }`);
  }
  async evaluate(fn, arg) { return this._withElement(fnSource(fn), arg); }
  async dispatchEvent(type, init = {}) {
    await this._withElement(`(el, a) => {
      const init = { bubbles: true, cancelable: true, composed: true, ...a.init };
      const Ctor = /^(click|dblclick|mouse|contextmenu)/.test(a.type) ? MouseEvent : /^pointer/.test(a.type) ? PointerEvent : /^key/.test(a.type) ? KeyboardEvent : /^focus|^blur/.test(a.type) ? FocusEvent : Event;
      el.dispatchEvent(new Ctor(a.type, init));
    }`, { type, init });
  }
  async waitFor({ state = 'visible', timeout = 10000 } = {}) { await this._page._waitForState(this._chain, state, timeout); }
  // 要素だけの画像は作らず、画面全体を保存する(見た目の記録用で、判定には使っていないため)。
  async screenshot(options = {}) { return this._page.screenshot(options); }
}

// ---------- 入力 ----------
class Mouse {
  constructor(page) { this._page = page; this._x = 0; this._y = 0; }
  _pointer(actions) { return { type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions }; }
  _move(x, y) { return { type: 'pointerMove', x: Math.round(x), y: Math.round(y), origin: 'viewport', duration: 0 }; }
  async move(x, y, { steps = 1 } = {}) {
    const fromX = this._x;
    const fromY = this._y;
    const actions = [];
    for (let i = 1; i <= steps; i++) actions.push(this._move(fromX + ((x - fromX) * i) / steps, fromY + ((y - fromY) * i) / steps));
    this._x = x;
    this._y = y;
    await this._page._actions([this._pointer(actions)]);
  }
  async down({ button = 'left' } = {}) { await this._page._actions([this._pointer([{ type: 'pointerDown', button: BUTTONS[button] }])]); }
  async up({ button = 'left' } = {}) { await this._page._actions([this._pointer([{ type: 'pointerUp', button: BUTTONS[button] }])]); }
  async click(x, y, { button = 'left', clickCount = 1, modifiers = [], delay = 0 } = {}) {
    if (button === 'right' && this._page._kind === 'webkitgtk') {
      await this._syntheticRightClick(x, y, modifiers);
      return;
    }
    const b = BUTTONS[button];
    const pointer = [this._move(x, y)];
    for (let i = 0; i < clickCount; i++) {
      pointer.push({ type: 'pointerDown', button: b });
      if (delay) pointer.push({ type: 'pause', duration: delay });
      pointer.push({ type: 'pointerUp', button: b });
    }
    this._x = x;
    this._y = y;
    const mods = modifiers.map((m) => keyValue(m));
    if (mods.length === 0) {
      await this._page._actions([this._pointer(pointer)]);
      return;
    }
    // 修飾キーを押したまま(キーとポインタを同じ tick で並べる)。
    const key = [...mods.map((value) => ({ type: 'keyDown', value })), ...pointer.map(() => ({ type: 'pause', duration: 0 })), ...mods.reverse().map((value) => ({ type: 'keyUp', value }))];
    const ptr = [...mods.map(() => ({ type: 'pause', duration: 0 })), ...pointer, ...mods.map(() => ({ type: 'pause', duration: 0 }))];
    await this._page._actions([{ type: 'key', id: 'keyboard', actions: key }, this._pointer(ptr)]);
  }
  async dblclick(x, y, options = {}) { await this.click(x, y, { ...options, clickCount: 2 }); }
  // WebKitGTK(2.52)の WebDriver で右ボタンを押して離すと、離したことが伝わらず(mouseup の button が 0 になり buttons に
  //   右ボタンが残る)、以降の左クリックが pointerdown にならない(押したままの別ボタン扱い)。素のページでも起きる
  //   自動操作側の不具合なので、右クリックはポインタだけ実際に動かし、イベントはページ内で合成する。
  async _syntheticRightClick(x, y, modifiers) {
    await this.move(x, y);
    await this._page._run(`
      const x = ${Math.round(x)}, y = ${Math.round(y)};
      const mods = ${JSON.stringify(modifiers)};
      const el = document.elementFromPoint(x, y);
      if (!el) return;
      const base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 2,
        shiftKey: mods.includes('Shift'), ctrlKey: mods.includes('Control'), altKey: mods.includes('Alt'), metaKey: mods.includes('Meta') };
      const pointer = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true };
      const pd = el.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, buttons: 2 }));
      if (pd) el.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 2 }));
      el.dispatchEvent(new MouseEvent('contextmenu', { ...base, buttons: 2 }));
      el.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0 }));
      if (pd) el.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));`);
  }
  async wheel(deltaX, deltaY) {
    await this._page._actions([{
      type: 'wheel',
      id: 'wheel',
      actions: [{ type: 'scroll', x: Math.round(this._x), y: Math.round(this._y), deltaX: Math.round(deltaX), deltaY: Math.round(deltaY), origin: 'viewport', duration: 0 }],
    }]);
  }
}
class Keyboard {
  constructor(page) { this._page = page; }
  _key(actions) { return { type: 'key', id: 'keyboard', actions }; }
  async press(combo, { delay = 0 } = {}) {
    const parts = combo === '+' ? ['+'] : combo.split('+').map((p) => p || '+');
    const values = parts.map(keyValue);
    const main = values.pop();
    const actions = [
      ...values.map((value) => ({ type: 'keyDown', value })),
      { type: 'keyDown', value: main },
      ...(delay ? [{ type: 'pause', duration: delay }] : []),
      { type: 'keyUp', value: main },
      ...values.reverse().map((value) => ({ type: 'keyUp', value })),
    ];
    await this._page._actions([this._key(actions)]);
  }
  async type(text, { delay = 0 } = {}) {
    const actions = [];
    for (const ch of text) {
      actions.push({ type: 'keyDown', value: ch }, { type: 'keyUp', value: ch });
      if (delay) actions.push({ type: 'pause', duration: delay });
    }
    await this._page._actions([this._key(actions)]);
  }
  async insertText(text) { await this.type(text); }
  async down(name) { await this._page._actions([this._key([{ type: 'keyDown', value: keyValue(name) }])]); }
  async up(name) { await this._page._actions([this._key([{ type: 'keyUp', value: keyValue(name) }])]); }
}

// ---------- Page ----------
class Page {
  constructor(base, sessionId, browserName, kind) {
    this._kind = kind;
    this._base = base;
    this._sid = sessionId;
    this._browserName = browserName;
    this._listeners = { console: [], pageerror: [] };
    this._initScripts = [];
    this._viewport = null;
    this._strictWarned = new Set();
    this.mouse = new Mouse(this);
    this.keyboard = new Keyboard(this);
  }
  _cmd(method, path, body) { return request(this._base, method, `/session/${this._sid}${path}`, body); }
  // ページ内で async な本体を実行し、値を返す(エラーの記録もここで回収する)。
  async _run(body) {
    const script = `const __done = arguments[arguments.length - 1];
${PAGE_PRELUDE}
(async () => { ${body} })().then(
  (v) => __done({ ok: true, v: __wdEncode(v), log: __wdDrain() }),
  (e) => __done({ ok: false, e: String((e && (e.stack || e.message)) || e), log: __wdDrain() }),
);`;
    const res = await this._cmd('POST', '/execute/async', { script, args: [] });
    this._dispatchLog(res?.log ?? []);
    if (!res?.ok) throw new Error(`wd evaluate: ${res?.e}`);
    return decode(res.v);
  }
  _dispatchLog(entries) {
    for (const [type, text] of entries) {
      if (type === 'pageerror') for (const cb of this._listeners.pageerror) cb(new Error(text));
      else for (const cb of this._listeners.console) cb({ type: () => type, text: () => text });
    }
  }
  _warnStrict(chain, count) {
    const key = JSON.stringify(chain);
    if (this._strictWarned.has(key)) return;
    this._strictWarned.add(key);
    console.log(`WARN(wd) ${count} 個の要素に当たったため先頭を使いました(Playwright なら strict mode violation): ${key}`);
  }
  async _actions(actions) {
    await this._cmd('POST', '/actions', { actions });
    // 操作のあと 1 フレーム待ってから、エラーの記録を回収する。CDP の入力(Playwright)は描画側の処理を待って返るが、
    //   WebDriver の actions はイベントを送った時点で返ることがあり、直後のキーが React の再描画より先に届くため。
    const log = await this._cmd('POST', '/execute/async', {
      script: 'const done = arguments[arguments.length - 1]; requestAnimationFrame(() => setTimeout(() => { const l = window.__wdLog || []; window.__wdLog = []; done(l); }, 0));',
      args: [],
    });
    this._dispatchLog(Array.isArray(log) ? log : []);
  }
  on(event, cb) {
    if (event === 'console' || event === 'pageerror') this._listeners[event].push(cb);
    else throw new Error(`wd: page.on('${event}') is not supported`);
  }
  async goto(url) {
    await this._cmd('POST', '/url', { url });
    await this._run('return true;'); // フックを入れる
    for (const src of this._initScripts) await this._run(`(${src})();`);
  }
  async addInitScript(fn) {
    this._initScripts.push(typeof fn === 'function' ? fn.toString() : `() => { ${fn} }`);
  }
  async evaluate(fn, arg) {
    // 先に 1 フレーム譲る: WebKit では WebDriver のスクリプトが React の予約した再描画(MessageChannel)より先に
    //   走ることがあり、直前の __setProps 等がまだ反映されていない状態を読んでしまうため(Chromium の CDP では起きない)。
    return this._run(`await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); const fn = ${fnSource(fn)}; return await fn(${argSource(arg)});`);
  }
  async waitForFunction(fn, arg, { timeout = 30000, polling = 50 } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const v = await this.evaluate(fn, arg);
      if (v) return v;
      if (Date.now() > deadline) throw new TimeoutError(`wd: waitForFunction timed out after ${timeout}ms`);
      await sleep(typeof polling === 'number' ? polling : 16);
    }
  }
  async _waitForState(chain, state, timeout) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const ok = await this._run(`const els = __wdResolve(${JSON.stringify(chain)});
        const s = ${JSON.stringify(state)};
        if (s === 'attached') return els.length > 0;
        if (s === 'detached') return els.length === 0;
        if (s === 'hidden') return els.length === 0 || !__wdVisible(els[0]);
        return els.length > 0 && __wdVisible(els[0]);`);
      if (ok) return;
      if (Date.now() > deadline) throw new TimeoutError(`wd: waitForSelector ${JSON.stringify(chain)} (${state}) timed out after ${timeout}ms`);
      await sleep(50);
    }
  }
  async waitForSelector(selector, { state = 'visible', timeout = 30000 } = {}) {
    await this._waitForState([{ t: 'css', s: selector }], state, timeout);
    return state === 'visible' || state === 'attached' ? this.locator(selector).first() : null;
  }
  async waitForTimeout(ms) { await sleep(ms); }
  locator(selector, options = {}) { return new Locator(this, []).locator(selector, options); }
  getByText(text, options = {}) { return new Locator(this, []).getByText(text, options); }
  async click(selector, options) { await this.locator(selector).click(options); }
  async dblclick(selector, options) { await this.locator(selector).dblclick(options); }
  async hover(selector, options) { await this.locator(selector).hover(options); }
  async fill(selector, value) { await this.locator(selector).fill(value); }
  async focus(selector) { await this.locator(selector).focus(); }
  async textContent(selector) { return this.locator(selector).textContent(); }
  async screenshot({ path } = {}) {
    const png = Buffer.from(await this._cmd('GET', '/screenshot'), 'base64');
    if (path) writeFileSync(path, png);
    return png;
  }
  viewportSize() { return this._viewport; }
  async setViewportSize({ width, height }) {
    // ウィンドウの外枠の分を差し引いて、innerWidth / innerHeight を合わせる。
    for (let i = 0; i < 3; i++) {
      const inner = await this._run('return { w: innerWidth, h: innerHeight };');
      if (inner.w === width && inner.h === height) break;
      const rect = await this._cmd('GET', '/window/rect');
      await this._cmd('POST', '/window/rect', { width: rect.width + (width - inner.w), height: rect.height + (height - inner.h) });
      await sleep(100);
    }
    this._viewport = { width, height };
  }
  async bringToFront() { /* ウィンドウは 1 つだけ */ }
  async emulateMedia() { throw new Error('wd: emulateMedia is not supported'); }
  async route() { throw new Error('wd: route is not supported'); }
  get clock() { throw new Error('wd: clock is not supported'); }
  context() { return { newCDPSession: async () => { throw new Error('wd: CDP is not supported'); } }; }
  async close() {
    try { await this._cmd('DELETE', ''); } catch { /* 閉じ済み */ }
  }
}

// open() から呼ぶ: セッションを作ってページを返す。
export async function launchWebDriver(kind, { viewport }) {
  const driver = await startDriver(kind);
  const session = await request(driver.url, 'POST', '/session', {
    capabilities: { alwaysMatch: { ...driver.def.capabilities(), pageLoadStrategy: 'normal', timeouts: { script: 60000, pageLoad: 60000, implicit: 0 } } },
  });
  const caps = session.capabilities ?? {};
  const page = new Page(driver.url, session.sessionId, `${caps.browserName} ${caps.browserVersion}`, kind);
  await page._cmd('POST', '/url', { url: 'about:blank' });
  await page.setViewportSize(viewport);
  return { page, version: page._browserName, close: () => page.close() };
}