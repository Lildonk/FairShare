/**
 * Input validation for sign-up and sign-in. Shared by the API routes and the forms, so the
 * browser and the server apply the same rules. Pure: no I/O.
 */

export interface RegistrationInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt only uses the first 72 bytes; longer passwords are rejected rather than silently truncated.
const MAX_PASSWORD_BYTES = 72;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function emailError(email: string): string | null {
  if (email === '') return 'Enter your email.';
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
  return null;
}

export function validateRegistration(body: unknown): ValidationResult<RegistrationInput> {
  const fields = asRecord(body);
  const name = asString(fields.name).trim();
  const email = normalizeEmail(asString(fields.email));
  const password = asString(fields.password);
  const errors: Record<string, string> = {};

  if (name === '') errors.name = 'Enter your name.';
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Use at most ${MAX_NAME_LENGTH} characters.`;

  const invalidEmail = emailError(email);
  if (invalidEmail) errors.email = invalidEmail;

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    errors.password = `Use a shorter password (at most ${MAX_PASSWORD_BYTES} bytes).`;
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: { name, email, password } };
}

export function validateLogin(body: unknown): ValidationResult<LoginInput> {
  const fields = asRecord(body);
  const email = normalizeEmail(asString(fields.email));
  const password = asString(fields.password);
  const errors: Record<string, string> = {};

  if (email === '') errors.email = 'Enter your email.';
  if (password === '') errors.password = 'Enter your password.';

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: { email, password } };
}
