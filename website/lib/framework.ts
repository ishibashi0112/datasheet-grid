'use client';

// 選んだフレームワーク(React / Solid)。サイト中のコードのタブ・切り替えのボタンが同じ値を見る。
// 値はこのブラウザの localStorage に残し、次に来たときも同じフレームワークで開く。
// サーバーの描画と最初のハイドレーションは React(getServerSnapshot)で、その直後に保存した値へ切り替わる。
import { useSyncExternalStore } from 'react';

import type { Framework } from './framework-names';

const STORAGE_KEY = 'ssg-framework';

let current: Framework | null = null;
const listeners = new Set<() => void>();

function parse(value: string | null): Framework {
  return value === 'solid' ? 'solid' : 'react';
}

function read(): Framework {
  if (current === null) {
    try {
      current = parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      current = 'react';
    }
  }
  return current;
}

function notify() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  current = parse(event.newValue);
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

export function setFramework(framework: Framework) {
  if (read() === framework) return;
  current = framework;
  try {
    localStorage.setItem(STORAGE_KEY, framework);
  } catch {
    // 保存できない(プライベートモードなど)ときはこのページの中だけで切り替える
  }
  notify();
}

export function useFramework(): Framework {
  return useSyncExternalStore(subscribe, read, () => 'react');
}
