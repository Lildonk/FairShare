// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE, createSessionToken } from '@/lib/auth/session';
import { config, middleware } from './middleware';

function request(path: string, token?: string) {
  return new NextRequest(new URL(path, 'http://localhost:3000'), {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : undefined,
  });
}

function redirectTarget(response: Response): URL | null {
  const location = response.headers.get('location');
  return location ? new URL(location) : null;
}

describe('page protection middleware', () => {
  it('sends signed-out visitors to the login page and remembers where they were going', async () => {
    const response = await middleware(request('/groups/abc?tab=expenses'));

    expect(response.status).toBe(307);
    expect(redirectTarget(response)?.pathname).toBe('/login');
    expect(redirectTarget(response)?.searchParams.get('next')).toBe('/groups/abc?tab=expenses');
  });

  it('treats an invalid session token like no token', async () => {
    const response = await middleware(request('/groups', 'not-a-real-token'));

    expect(redirectTarget(response)?.pathname).toBe('/login');
  });

  it('lets a signed-in member open group pages', async () => {
    const token = await createSessionToken({ userId: 'user-1', role: 'MEMBER' });
    const response = await middleware(request('/groups', token));

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
  });

  it('keeps members out of admin pages', async () => {
    const token = await createSessionToken({ userId: 'user-1', role: 'MEMBER' });
    const response = await middleware(request('/admin', token));

    expect(redirectTarget(response)?.pathname).toBe('/');
  });

  it('lets admins open admin pages', async () => {
    const token = await createSessionToken({ userId: 'admin-1', role: 'ADMIN' });
    const response = await middleware(request('/admin/groups', token));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('only runs on group and admin pages', () => {
    expect(config.matcher).toEqual(['/groups/:path*', '/admin/:path*']);
  });
});
