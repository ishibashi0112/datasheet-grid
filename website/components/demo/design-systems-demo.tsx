'use client';

// デザインシステムのデモ: Astryx / Mantine / HeroUI / shadcn/ui を切り替えて、それぞれの中に置いたグリッドを見せる。
// 中身は iframe の別ページ(app/ds-frame/*)。デザインシステムの CSS がこのページへ漏れず、テーマ同士も混ざらない。
import { useState } from 'react';

const SYSTEMS = [
  { key: 'astryx', label: 'Astryx' },
  { key: 'mantine', label: 'Mantine' },
  { key: 'heroui', label: 'HeroUI' },
  { key: 'shadcn', label: 'shadcn/ui' },
] as const;

type SystemKey = (typeof SYSTEMS)[number]['key'];

export function DesignSystemsDemo() {
  const [system, setSystem] = useState<SystemKey>('astryx');
  const current = SYSTEMS.find((item) => item.key === system) ?? SYSTEMS[0];

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="デザインシステム" className="flex flex-wrap gap-1 text-sm">
        {SYSTEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={item.key === system}
            className={`rounded-md border px-3 py-1 ${
              item.key === system ? 'bg-fd-primary text-fd-primary-foreground' : 'bg-transparent hover:bg-fd-accent'
            }`}
            onClick={() => setSystem(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <iframe
        key={current.key}
        src={`/ds-frame/${current.key}`}
        title={`${current.label} の中に置いたグリッド`}
        className="h-[600px] w-full rounded-lg border sm:h-[520px]"
      />
    </div>
  );
}