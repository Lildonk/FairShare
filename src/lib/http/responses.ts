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

/** The largest request body any endpoint accepts: about twice the largest valid calculator body. */
export const MAX_BODY_BYTES = 512 * 1024;

const tooLarge = () => new HttpError(413, 'payload_too_large', 'The request body is too large.');

/** Reads the body as text, but stops at `limit` bytes, so an oversized request is never buffered whole. */
async function readBodyText(request: Request, limit: number): Promise<string> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Parses a JSON body of at most MAX_BODY_BYTES: 413 if it is larger, 400 if it isn't JSON. */
export async function readJson(request: Request): Promise<unknown> {
  // Content-Length can be missing or wrong, so it is only a shortcut; counting the bytes decides.
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw tooLarge();
  const text = await readBodyText(request, MAX_BODY_BYTES);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_input', 'Send the request body as JSON.');
  }
}
