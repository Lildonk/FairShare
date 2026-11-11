import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

// Compared against when an account has no password (or does not exist), so those sign-in
// attempts take as long as a wrong password and do not reveal which emails are registered.
const DUMMY_HASH = '$2b$12$1dEcGFA9mVjkVnhHQRjhC.D/qEmJI7cZ3rxGQhSaWjV5juKOWBmra';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== null && matches;
}
