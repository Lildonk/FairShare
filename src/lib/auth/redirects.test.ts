// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { authErrorMessage, safeNextPath } from './redirects';

describe('safeNextPath', () => {
  it('keeps a same-site path, including its query string and fragment', () => {
    expect(safeNextPath('/groups/123?tab=expenses')).toBe('/groups/123?tab=expenses');
    expect(safeNextPath('/groups/123#balances')).toBe('/groups/123#balances');
  });

  it('falls back to the home page for anything that could leave the site', () => {
    for (const next of [undefined, null, '', 'groups', 'https://evil.example', '//evil.example', '/\\evil.example']) {
      expect(safeNextPath(next), String(next)).toBe('/');
    }
  });

  // URL parsing removes tabs and newlines, so each of these really starts with "//" or "/\".
  it.each(['/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '/\t\\evil.example'])(
    'falls back to the home page when a tab or newline hides a second slash: %j',
    (next) => {
      expect(safeNextPath(next)).toBe('/');
    },
  );

  // These look like same-site paths, but resolving "." and ".." leaves "//evil.example",
  // which a browser reads as another site.
  it.each(['/.//evil.example', '/..//evil.example', '/%2e%2e//evil.example'])(
    'falls back to the home page when resolving the path would leave two leading slashes: %j',
    (next) => {
      expect(safeNextPath(next)).toBe('/');
    },
  );

  it.each(['//[', '/\t/[', '/\n/evil.example:99999'])(
    'falls back to the home page instead of throwing when next is not a valid URL: %j',
    (next) => {
      expect(safeNextPath(next)).toBe('/');
    },
  );
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
