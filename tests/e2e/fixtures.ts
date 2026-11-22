import { expect, type Page } from '@playwright/test';

/** Every account the E2E tests create uses this reserved domain, so teardown can find them. */
export const E2E_EMAIL_DOMAIN = 'e2e.test';
/** Groups the E2E tests create start with this, so teardown never touches seed groups. */
export const E2E_GROUP_PREFIX = 'E2E ';
export const PASSWORD = 'correct horse battery';

const runTag = Date.now().toString(36);
let counter = 0;

/** A fresh email address for this run, such as `nora.lx3k9a.1@e2e.test`. */
export function uniqueEmail(name: string): string {
  counter += 1;
  return `${name}.${runTag}.${counter}@${E2E_EMAIL_DOMAIN}`;
}

/** Registers through the UI and waits until the home page shows the new user as signed in. */
export async function registerThroughUi(page: Page, name: string, email: string): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText(`Signed in as ${name}`)).toBeVisible();
}

/** A fresh group name for this run, with the prefix the teardown looks for. */
export function uniqueGroupName(label: string): string {
  counter += 1;
  return `${E2E_GROUP_PREFIX}${label} ${runTag}-${counter}`;
}

/** Creates a group on /groups and returns the invite code the page shows for it. */
export async function createGroupThroughUi(page: Page, name: string): Promise<string> {
  await page.goto('/groups');
  await page.getByLabel('Group name').fill(name);
  await page.getByRole('button', { name: 'Create group' }).click();
  const created = page.getByRole('status').filter({ hasText: `Created ${name}.` });
  await expect(created).toBeVisible();
  const code = (await created.textContent())?.match(/invite code (\S+) so/)?.[1];
  if (!code) throw new Error('No invite code in the confirmation message');
  return code;
}

/** Joins a group on /groups with its invite code. */
export async function joinGroupThroughUi(page: Page, name: string, inviteCode: string): Promise<void> {
  await page.goto('/groups');
  await page.getByLabel('Invite code').fill(inviteCode);
  await page.getByRole('button', { name: 'Join group' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Joined ${name}.` })).toBeVisible();
}

/** Opens a group's dashboard from the /groups list. */
export async function openGroup(page: Page, name: string): Promise<void> {
  await page.goto('/groups');
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** Fills in and submits the sign-in form on the current /login page. */
export async function submitSignIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}
