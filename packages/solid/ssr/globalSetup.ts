// サーバーの HTML を 1 回だけ作り、各テストのファイルへ渡す(render.mjs を子のプロセスで走らせる。サーバーのタイムゾーンは
//   表ごとに fixtures の SERVER_TIME_ZONE_OF、無ければ SERVER_TZ)。
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';

export type ServerOutput = { script: string; pages: Record<string, string>; currentTimeReads: Record<string, string[]> };

declare module 'vitest' {
  export interface ProvidedContext {
    ssrServerOutput: ServerOutput;
  }
}

export default function setup(project: TestProject): void {
  const out = execFileSync(process.execPath, [join(import.meta.dirname, 'render.mjs')], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  project.provide('ssrServerOutput', JSON.parse(out) as ServerOutput);
}