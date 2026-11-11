// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, errorResponse, readJson } from './responses';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('errorResponse', () => {
  it('turns an HttpError into its status, code, message, and field errors', async () => {
    const response = errorResponse(new HttpError(400, 'invalid_input', 'Check the fields.', { email: 'Enter your email.' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: 'invalid_input',
      message: 'Check the fields.',
      fields: { email: 'Enter your email.' },
    });
  });

  it('hides unexpected errors behind a generic 500 and logs only the error name and code', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const leaky = Object.assign(new Error('Invalid data: { passwordHash: "$2b$12$abcdefghijklmnopqrstuv" }'), {
      code: 'P2000',
    });

    const response = errorResponse(leaky);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: 'server_error', message: 'Something went wrong. Please try again.' });
    expect(logged).toHaveBeenCalledWith('Unexpected server error', { name: 'Error', code: 'P2000' });
    expect(JSON.stringify(logged.mock.calls)).not.toContain('passwordHash');
  });
});

describe('readJson', () => {
  it('rejects a body that is not JSON with a 400', async () => {
    const request = new Request('http://localhost/api', { method: 'POST', body: '{not json' });

    await expect(readJson(request)).rejects.toMatchObject({ status: 400, code: 'invalid_input' });
  });
});
