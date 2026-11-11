import { NextResponse, type NextRequest } from 'next/server';

export interface ErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

/** An error with an HTTP status and a message that is safe to show the user. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Logs only an error's name and code: messages can echo request data such as password hashes. */
export function logSafely(context: string, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
  console.error(context, code ? { name, code } : { name });
}

export function errorResponse(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof HttpError) {
    const body: ErrorBody = { code: error.code, message: error.message };
    if (error.fields) body.fields = error.fields;
    return NextResponse.json(body, { status: error.status });
  }
  logSafely('Unexpected server error', error);
  return NextResponse.json({ code: 'server_error', message: 'Something went wrong. Please try again.' }, { status: 500 });
}

/** Sends the browser to the login page with an `?error=` code it can explain. */
export function redirectToLogin(request: NextRequest, errorCode: string): NextResponse {
  const url = new URL('/login', request.url);
  url.searchParams.set('error', errorCode);
  return NextResponse.redirect(url);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'invalid_input', 'Send the request body as JSON.');
  }
}
