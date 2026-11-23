'use client';

// MDX の ```tsx tab="React"``` / ```tsx tab="Solid"``` から作るコードのタブ。
// 選んだフレームワーク(lib/framework)で開き、タブを押すとサイト中のタブと切り替えのボタンが同じほうになる。
// React / Solid 以外のタブ(npm / pnpm / yarn など)は fumadocs のまま。
import type { ComponentProps } from 'react';
import { CodeBlockTabs } from 'fumadocs-ui/components/codeblock';
import { FRAMEWORK_LABEL, frameworkOfTab, setFramework, useFramework } from '@/lib/framework';

type Props = ComponentProps<typeof CodeBlockTabs>;

export function FrameworkCodeBlockTabs(props: Props) {
  if (frameworkOfTab(props.defaultValue) === null) return <CodeBlockTabs {...props} />;
  return <FrameworkTabs {...props} />;
}

function FrameworkTabs({ defaultValue: _defaultValue, groupId: _groupId, persist: _persist, ...props }: Props) {
  const framework = useFramework();
  return (
    <CodeBlockTabs
      {...props}
      value={FRAMEWORK_LABEL[framework]}
      onValueChange={(value: unknown) => {
        const next = frameworkOfTab(value);
        if (next) setFramework(next);
      }}
    />
  );
}
