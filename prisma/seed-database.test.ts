// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assertSeedingAllowed } from './seed-database';

describe('assertSeedingAllowed', () => {
  it('refuses to seed production, which would add demo accounts with a known password', () => {
    expect(() => assertSeedingAllowed({ NODE_ENV: 'production' })).toThrow(/production/);
  });

  it('allows development, test, and CI runs', () => {
    for (const NODE_ENV of [undefined, 'development', 'test']) {
      expect(() => assertSeedingAllowed({ NODE_ENV }), String(NODE_ENV)).not.toThrow();
    }
  });
});
