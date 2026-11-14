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

/** Fills in and submits the sign-in form on the current /login page. */
export async function submitSignIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}
