// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('hashes with bcrypt at cost 12 and a random salt', async () => {
    const first = await hashPassword('correct horse');
    const second = await hashPassword('correct horse');

    expect(first).toMatch(/^\$2[aby]\$12\$/);
    expect(first).not.toBe(second);
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse');

    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
  });

  it('rejects every password for an account that has no password hash', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
  });
});
