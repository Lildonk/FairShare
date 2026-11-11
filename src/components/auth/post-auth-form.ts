export interface AuthFormError {
  code?: string;
  message: string;
  fields: Record<string, string>;
}

const NETWORK_ERROR = "Couldn't reach FairShare. Check your connection and try again.";
const UNKNOWN_ERROR = 'Something went wrong. Please try again.';

function stringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

/** Posts a sign-in or sign-up form as JSON. Resolves to null on success, or to the error to show. */
export async function postAuthForm(url: string, body: unknown): Promise<AuthFormError | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { message: NETWORK_ERROR, fields: {} };
  }
  if (response.ok) return null;

  const data: unknown = await response.json().catch(() => null);
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    message: typeof record.message === 'string' ? record.message : UNKNOWN_ERROR,
    fields: stringRecord(record.fields),
  };
}
