import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { POST as simplify } from '@/app/api/v1/simplify/route';
import { MAX_DEBTS, MAX_MEMBER_ID_LENGTH } from '@/lib/api/calculator-input';
import { MAX_BODY_BYTES } from '@/lib/http/responses';

const URL = 'http://localhost:3000/api/v1/simplify';

function post(body: string, headers: Record<string, string> = {}) {
  return simplify(new NextRequest(URL, { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } }));
}

async function expectTooLarge(response: Response) {
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ code: 'payload_too_large', message: expect.any(String) });
}

// The #41 review: request.json() reads a body of any size before validation can refuse it.
describe('request body limit (readJson)', () => {
  it('is 512 KiB', () => {
    expect(MAX_BODY_BYTES).toBe(512 * 1024);
  });

  it('answers 413 for a larger body, counting bytes as it reads when there is no Content-Length', async () => {
    const body = JSON.stringify({ debts: [], padding: 'x'.repeat(MAX_BODY_BYTES) });
    const request = new NextRequest(URL, { method: 'POST', body });
    expect(request.headers.get('content-length')).toBeNull();

    await expectTooLarge(await post(body));
  });

  it('counts bytes, not characters', async () => {
    // "é" is two bytes in UTF-8, so this is under the limit in characters but over it in bytes.
    const body = JSON.stringify({ debts: [], padding: 'é'.repeat(MAX_BODY_BYTES / 2 + 1) });
    expect(body.length).toBeLessThan(MAX_BODY_BYTES);

    await expectTooLarge(await post(body));
  });

  it('answers 413 when the declared Content-Length is over the limit', async () => {
    await expectTooLarge(await post('{"debts":[]}', { 'content-length': String(MAX_BODY_BYTES + 1) }));
  });

  it('still accepts the largest valid calculator body', async () => {
    const id = (n: number) => String(n).padStart(MAX_MEMBER_ID_LENGTH, 'm');
    const debts = Array.from({ length: MAX_DEBTS }, (_, i) => ({ fromMemberId: id(i), toMemberId: id(i + 1), amountCents: 1 }));
    const body = JSON.stringify({ debts });
    expect(new TextEncoder().encode(body).length).toBeLessThan(MAX_BODY_BYTES);

    const response = await post(body);

    expect(response.status).toBe(200);
  });

  it('still answers 400 for a body that is not JSON', async () => {
    const response = await post('{not json');

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('invalid_input');
  });
});
