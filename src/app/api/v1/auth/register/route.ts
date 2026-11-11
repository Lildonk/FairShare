import { Prisma } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { hashPassword } from '@/lib/auth/password';
import { toPublicUser } from '@/lib/auth/public-user';
import { setSessionCookie } from '@/lib/auth/session';
import { validateRegistration } from '@/lib/auth/validation';
import { prisma } from '@/lib/db/prisma';
import { HttpError, errorResponse, readJson } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/** POST /api/v1/auth/register: creates a MEMBER account and signs it in. */
export async function POST(request: NextRequest) {
  try {
    const input = validateRegistration(await readJson(request));
    if (!input.ok) throw new HttpError(400, 'invalid_input', 'Check the highlighted fields.', input.errors);

    const { name, email, password } = input.value;
    let user;
    try {
      // No role from the client: every new account is a MEMBER.
      user = await prisma.user.create({ data: { name, email, passwordHash: await hashPassword(password) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new HttpError(409, 'email_taken', 'An account with this email already exists.');
      }
      throw error;
    }

    const response = NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
    await setSessionCookie(response, user);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
