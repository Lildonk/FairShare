import { expect, test } from '@playwright/test';
import {
  createGroupThroughUi,
  joinGroupThroughUi,
  openGroup,
  registerThroughUi,
  submitSignIn,
  uniqueEmail,
  uniqueGroupName,
} from './fixtures';

// Seed account (see the README); the E2E database is always seeded first.
const SEED_ADMIN = { email: 'admin@fairshare.test', password: 'fairshare-demo' };

test.describe('who may see and change what', () => {
  test('a member who opens /admin is told it is for admins only', async ({ page }) => {
    await registerThroughUi(page, 'Mia Member', uniqueEmail('mia'));

    await page.goto('/admin');

    await expect(page.getByRole('heading', { level: 1, name: 'Admins only' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Groups' })).toHaveCount(0);
  });

  test('someone outside a group gets a not-found page for it, with nothing of the group shown', async ({ browser }) => {
    const owner = await (await browser.newContext()).newPage();
    const outsider = await (await browser.newContext()).newPage();
    const group = uniqueGroupName('Private');
    await registerThroughUi(owner, 'Olga Owner', uniqueEmail('olga'));
    await createGroupThroughUi(owner, group);
    await openGroup(owner, group);
    const groupUrl = owner.url();

    await registerThroughUi(outsider, 'Otto Outsider', uniqueEmail('otto'));
    const response = await outsider.goto(groupUrl);

    expect(response?.status()).toBe(404);
    await expect(outsider.getByText(group)).toHaveCount(0);
  });

  test('an admin archives a group, and its members can still read it but no longer change it', async ({ browser }) => {
    const member = await (await browser.newContext()).newPage();
    const admin = await (await browser.newContext()).newPage();
    const group = uniqueGroupName('Finished trip');
    await registerThroughUi(member, 'Rita Reader', uniqueEmail('rita'));
    const inviteCode = await createGroupThroughUi(member, group);

    // Sign in through /login?next=/admin and wait for it, so navigating doesn't cut off the sign-in.
    await admin.goto('/login?next=/admin');
    await submitSignIn(admin, SEED_ADMIN.email, SEED_ADMIN.password);
    await expect(admin.getByRole('heading', { level: 1, name: 'Admin' })).toBeVisible();
    await admin.getByRole('button', { name: `Archive ${group}` }).click();
    await admin.getByRole('button', { name: `Confirm archiving ${group}` }).click();
    await expect(admin.getByRole('status').filter({ hasText: `Archived ${group}.` })).toBeVisible();

    await openGroup(member, group);
    await expect(member.getByText('Archived: read-only')).toBeVisible();
    await expect(member.getByRole('button', { name: 'Add expense' })).toHaveCount(0);

    // Joining with its real invite code is refused too. (Next.js adds its own role="alert" route
    // announcer, so the alert is picked by its text.)
    const latecomer = await (await browser.newContext()).newPage();
    await registerThroughUi(latecomer, 'Leo Late', uniqueEmail('leo'));
    await latecomer.goto('/groups');
    await latecomer.getByLabel('Invite code').fill(inviteCode);
    await latecomer.getByRole('button', { name: 'Join group' }).click();
    await expect(latecomer.getByRole('alert').filter({ hasText: 'archived' })).toHaveText(
      'That group is archived, so it can’t take new members.',
    );
    await expect(latecomer.getByRole('link', { name: group })).toHaveCount(0);
  });
});

test('joining with an invite code adds the group to your list', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  const group = uniqueGroupName('Book club');
  await registerThroughUi(host, 'Hana Host', uniqueEmail('hana'));
  const code = await createGroupThroughUi(host, group);

  await registerThroughUi(guest, 'Gus Guest', uniqueEmail('gus'));
  await joinGroupThroughUi(guest, group, code);

  await expect(guest.getByRole('link', { name: group })).toBeVisible();
  await expect(guest.getByRole('listitem').filter({ hasText: group })).toContainText('2 members');
});
