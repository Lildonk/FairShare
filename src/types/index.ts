/**
 * Shared TypeScript types for FairShare.
 *
 * Money is represented as integer cents throughout the application
 * to avoid floating-point precision issues.
 */

/** Platform-wide user role; matches the Prisma `Role` enum (docs/FAIRSHARE_PRODUCT_SPEC.md#data-model-decisions). */
export type UserRole = 'MEMBER' | 'ADMIN';

/** Supported expense split modes. */
export type SplitMode = 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'ITEMIZED';

