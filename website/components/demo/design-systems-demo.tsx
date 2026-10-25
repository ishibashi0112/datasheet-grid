'use client';

// デザインシステムのデモ: Astryx / Mantine / HeroUI / shadcn/ui を切り替えて、それぞれの中に置いたグリッドを見せる。
// 中身は iframe の別ページ(app/ds-frame/*)。デザインシステムの CSS がこのページへ漏れず、テーマ同士も混ざらない。
// 切り替えは WAI-ARIA のタブ(矢印 / Home / End で移動して選ぶ。タブの並びへ入る Tab は選んでいるタブだけ)。
import { useId, useRef, useState, type KeyboardEvent } from 'react';

const SYSTEMS = [
  { key: 'astryx', label: 'Astryx' },
  { key: 'mantine', label: 'Mantine' },
  { key: 'heroui', label: 'HeroUI' },
  { key: 'shadcn', label: 'shadcn/ui' },
] as const;

type SystemKey = (typeof SYSTEMS)[number]['key'];

export function DesignSystemsDemo() {
  const id = useId();
  const [system, setSystem] = useState<SystemKey>('astryx');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = SYSTEMS.find((item) => item.key === system) ?? SYSTEMS[0];
  const tabId = (key: SystemKey) => `${id}-tab-${key}`;
  const panelId = `${id}-panel`;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = SYSTEMS.findIndex((item) => item.key === system);
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % SYSTEMS.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + SYSTEMS.length) % SYSTEMS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? SYSTEMS.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setSystem(SYSTEMS[next].key);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="デザインシステム" className="flex flex-wrap gap-1 text-sm" onKeyDown={onKeyDown}>
        {SYSTEMS.map((item, index) => {
          const selected = item.key === system;
          return (
            <button
              key={item.key}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={tabId(item.key)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              className={`rounded-md border px-3 py-1 ${
                selected ? 'bg-fd-primary text-fd-primary-foreground' : 'bg-transparent hover:bg-fd-accent'
              }`}
              onClick={() => setSystem(item.key)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(current.key)}>
        <iframe
          key={current.key}
          src={`/ds-frame/${current.key}`}
          title={`${current.label} の中に置いたグリッド`}
          loading="lazy"
          className="h-[600px] w-full rounded-lg border sm:h-[520px]"
        />
      </div>
    </div>
  );
}