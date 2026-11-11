/** Validation for creating and joining groups (Issue #9). Pure: no I/O. */
import { bodyFields, optionalText, requiredText, result, type Errors, type InputResult } from './input-helpers';

export const MAX_GROUP_NAME_LENGTH = 100;
export const MAX_GROUP_DESCRIPTION_LENGTH = 500;
const MAX_INVITE_CODE_LENGTH = 100;

/** Body of `POST /api/v1/groups`. Anything else the client sends (archived, invite code) is ignored. */
export function validateGroupInput(body: unknown): InputResult<{ name: string; description: string | null }> {
  const errors: Errors = {};
  const fields = bodyFields(body, errors);
  const name = requiredText(fields.name, 'name', errors, MAX_GROUP_NAME_LENGTH);
  const description = optionalText(fields.description, 'description', errors, MAX_GROUP_DESCRIPTION_LENGTH);
  return result({ name, description }, errors);
}

/** Body of `POST /api/v1/groups/join`. */
export function validateJoinInput(body: unknown): InputResult<{ inviteCode: string }> {
  const errors: Errors = {};
  const fields = bodyFields(body, errors);
  const inviteCode = requiredText(fields.inviteCode, 'inviteCode', errors, MAX_INVITE_CODE_LENGTH);
  return result({ inviteCode }, errors);
}
