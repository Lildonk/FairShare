import { NextResponse, type NextRequest } from 'next/server';
import { verifyPassword } from '@/lib/auth/password';
import { toPublicUser } from '@/lib/auth/public-user';
import { setSessionCookie } from '@/lib/auth/session';
import { validateLogin } from '@/lib/auth/validation';
import { prisma } from '@/lib/db/prisma';
import { HttpError, errorResponse, readJson } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/** POST /api/v1/auth/login: checks the email and password and starts a session. */
export async function POST(request: NextRequest) {
  try {
    const input = validateLogin(await readJson(request));
    if (!input.ok) throw new HttpError(400, 'invalid_input', 'Enter your email and password.', input.errors);

    const user = await prisma.user.findUnique({ where: { email: input.value.email } });
    // Always compare, so an unknown email takes as long as a wrong password.
    const passwordMatches = await verifyPassword(input.value.password, user?.passwordHash ?? null);
    if (!user || !passwordMatches) {
      throw new HttpError(401, 'invalid_credentials', 'Incorrect email or password.');
    }

    const response = NextResponse.json({ user: toPublicUser(user) });
    await setSessionCookie(response, user);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
