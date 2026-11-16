import { expect, test, type Page } from '@playwright/test';
import { E2E_GROUP_PREFIX, registerThroughUi, uniqueEmail } from './fixtures';

/**
 * The critical group workflow (#10): Register → Group → Expense → Settlement, with two real users
 * in separate browser sessions, through the UI only.
 */
test.describe('group workflow', () => {
  test('two people share an expense and settle up through the UI', async ({ browser }) => {
    const groupName = `${E2E_GROUP_PREFIX}Ski Trip ${Date.now().toString(36)}`;
    const alice = await browser.newContext();
    const bob = await browser.newContext();
    const alicePage = await alice.newPage();
    const bobPage = await bob.newPage();

    try {
      // Register: both people sign up and are signed in.
      await registerThroughUi(alicePage, 'Alice Flow', uniqueEmail('alice'));
      await registerThroughUi(bobPage, 'Bob Flow', uniqueEmail('bob'));

      // Group: Alice creates it and opens it; Bob joins with the invite code.
      await alicePage.goto('/groups');
      await alicePage.getByLabel('Group name').fill(groupName);
      await alicePage.getByRole('button', { name: 'Create group' }).click();
      await alicePage.getByRole('link', { name: groupName }).click();
      await expect(alicePage.getByRole('heading', { level: 1, name: groupName })).toBeVisible();
      const inviteCode = (await alicePage.locator('code').first().textContent())?.trim() ?? '';
      expect(inviteCode).not.toBe('');

      await bobPage.goto('/groups');
      await bobPage.getByLabel('Invite code').fill(inviteCode);
      await bobPage.getByRole('button', { name: 'Join group' }).click();
      await expect(bobPage.getByRole('link', { name: groupName })).toBeVisible();

      await alicePage.reload();
      await expect(alicePage.getByText('Alice Flow, Bob Flow')).toBeVisible();
      await expect(alicePage.getByText('No expenses yet. Add an expense to see who owes whom.')).toBeVisible();

      // Expense: Alice pays $90.01 for both, split equally; the extra cent goes to the payer.
      await alicePage.getByRole('button', { name: 'Add expense' }).click();
      const dialog = alicePage.getByRole('dialog', { name: 'Add expense' });
      await dialog.getByLabel('Description').fill('Lift tickets');
      await dialog.getByLabel('Amount').fill('90.01');
      await dialog.getByLabel('Paid by').selectOption({ label: 'Alice Flow' });
      await dialog.getByRole('radio', { name: 'Equal' }).check();
      const splitAmong = dialog.getByRole('group', { name: 'Split among' });
      await splitAmong.getByRole('checkbox', { name: 'Alice Flow' }).check();
      await splitAmong.getByRole('checkbox', { name: 'Bob Flow' }).check();
      await dialog.getByRole('button', { name: 'Add expense' }).click();
      await expect(dialog).toHaveCount(0);

      // Balances: Bob owes his $45.00 share; Alice gets it back.
      await expectBalances(alicePage, ['Alice Flow: gets back $45.00', 'Bob Flow: owes $45.00']);
      await expect(
        alicePage.getByRole('list', { name: 'Suggested transfers' }).getByText('Bob Flow pays Alice Flow $45.00'),
      ).toBeVisible();

      // Bob sees the same board after loading the group.
      await bobPage.getByRole('link', { name: groupName }).click();
      await expectBalances(bobPage, ['Alice Flow: gets back $45.00', 'Bob Flow: owes $45.00']);

      // Settlement: Alice, the receiver, records Bob's payment, so it counts at once.
      await alicePage.getByRole('button', { name: 'Record payment: Bob Flow pays Alice Flow $45.00' }).click();
      await expect(alicePage.getByText('Everyone is settled up.', { exact: true })).toBeVisible();

      // The payment was saved: both see everyone settled after a fresh load.
      for (const page of [alicePage, bobPage]) {
        await page.reload();
        await expectBalances(page, ['Alice Flow: settled up', 'Bob Flow: settled up']);
        await expect(page.getByText('Everyone is settled up.', { exact: true })).toBeVisible();
      }
    } finally {
      await alice.close();
      await bob.close();
    }
  });
});

async function expectBalances(page: Page, chips: string[]): Promise<void> {
  const balances = page.getByRole('list', { name: 'Member balances' });
  for (const chip of chips) {
    await expect(balances.getByText(chip)).toBeVisible();
  }
}
