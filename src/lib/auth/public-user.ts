import type { Role, User } from '@prisma/client';

/** The only user fields the API returns. Never includes passwordHash or googleSub. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export function toPublicUser(user: Pick<User, 'id' | 'email' | 'name' | 'role'>): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
