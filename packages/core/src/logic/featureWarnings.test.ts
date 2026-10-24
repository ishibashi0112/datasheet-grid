// 追加(差し込み式 段階 2): 機能セットに無い機能の prop の開発時警告(1 つの prop につき 1 回 / 本番は出さない)。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetUnregisteredFeatureWarnings, warnUnregisteredFeatureProps } from './featureWarnings';

afterEach(() => {
  resetUnregisteredFeatureWarnings();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('warnUnregisteredFeatureProps', () => {
  it('prop ごとに 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnUnregisteredFeatureProps(['find']);
    warnUnregisteredFeatureProps(['find', 'fillHandle']);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain('`find`');
    expect(warn.mock.calls[1]?.[0]).toContain('`fillHandle`');
  });

  it('本番(NODE_ENV = production)では警告しない', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnUnregisteredFeatureProps(['find']);
    expect(warn).not.toHaveBeenCalled();
  });
});