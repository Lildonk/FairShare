import { expect, test } from '@playwright/test';
import { PASSWORD, registerThroughUi, submitSignIn, uniqueEmail } from './fixtures';

test.describe('registration, sign-in, and protected pages', () => {
  test('a new user registers, is signed in, signs out, and signs back in', async ({ page }) => {
    const email = uniqueEmail('nora');

    await registerThroughUi(page, 'Nora Newcomer', email);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByText('Signed in as')).toHaveCount(0);

    await page.goto('/login');
    await submitSignIn(page, email);
    await expect(page.getByText('Signed in as Nora Newcomer')).toBeVisible();
  });

  test('a wrong password is refused with a clear message, and no session is created', async ({ page, request }) => {
    const email = uniqueEmail('wanda');
    const registered = await request.post('/api/v1/auth/register', {
      data: { name: 'Wanda Wrong', email, password: PASSWORD },
    });
    expect(registered.status()).toBe(201);

    await page.goto('/login');
    await submitSignIn(page, email, 'not the password');

    await expect(page.getByText('Incorrect email or password.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/groups');
    await expect(page).toHaveURL(/\/login\?next=%2Fgroups$/);
  });

  test('a signed-out visitor to a protected page is sent to sign in, then back to that page', async ({ page, request }) => {
    const email = uniqueEmail('pat');
    await request.post('/api/v1/auth/register', { data: { name: 'Pat Protected', email, password: PASSWORD } });

    await page.goto('/groups');
    await expect(page).toHaveURL(/\/login\?next=%2Fgroups$/);

    await submitSignIn(page, email);
    await expect(page).toHaveURL(/\/groups$/);
  });
});
