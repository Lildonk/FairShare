// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { authErrorMessage, safeNextPath } from './redirects';

describe('safeNextPath', () => {
  it('keeps a same-site path, including its query string', () => {
    expect(safeNextPath('/groups/123?tab=expenses')).toBe('/groups/123?tab=expenses');
  });

  it('falls back to the home page for anything that could leave the site', () => {
    for (const next of [undefined, null, '', 'groups', 'https://evil.example', '//evil.example', '/\\evil.example']) {
      expect(safeNextPath(next), String(next)).toBe('/');
    }
  });
});

describe('authErrorMessage', () => {
  it('explains each sign-in failure in plain words', () => {
    for (const code of [
      'account_exists',
      'email_unverified',
      'google_linked_elsewhere',
      'already_linked_other',
      'google_failed',
      'google_unavailable',
    ]) {
      expect(authErrorMessage(code), code).toMatch(/\w+/);
    }
    expect(authErrorMessage('account_exists')).toMatch(/sign in with your password/i);
  });

  it('ignores unknown or missing codes', () => {
    expect(authErrorMessage('<script>')).toBeNull();
    expect(authErrorMessage(undefined)).toBeNull();
  });
});
