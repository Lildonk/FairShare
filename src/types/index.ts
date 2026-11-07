/**
 * Shared TypeScript types for FairShare.
 *
 * Money is represented as integer cents throughout the application
 * to avoid floating-point precision issues.
 */

/** User roles within the platform. */
export type UserRole = 'user' | 'admin';

/** Supported expense split modes. */
export type SplitMode = 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'ITEMIZED';

