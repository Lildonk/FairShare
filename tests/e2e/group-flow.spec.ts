import { expect, test } from '@playwright/test';
import {
  createGroupThroughUi,
  joinGroupThroughUi,
  openGroup,
  registerThroughUi,
  uniqueEmail,
  uniqueGroupName,
} from './fixtures';

// The critical workflow from AGENTS.md: Register → Group → Expense → Settlement, with two people in
// two separate browser sessions.
test('two people share an expense and settle up: register, create and join a group, add an expense, record the payment', async ({
  browser,
}) => {
  const ana = await (await browser.newContext()).newPage();
  const ben = await (await browser.newContext()).newPage();
  const group = uniqueGroupName('Ski trip');

  await registerThroughUi(ana, 'Ana Organizer', uniqueEmail('ana'));
  const inviteCode = await createGroupThroughUi(ana, group);
  await expect(ana.getByRole('link', { name: group })).toBeVisible();

  await registerThroughUi(ben, 'Ben Joiner', uniqueEmail('ben'));
  await joinGroupThroughUi(ben, group, inviteCode);
  await expect(ben.getByRole('link', { name: group })).toBeVisible();

  // Ana adds a $90.01 dinner she paid for, split equally: she takes the leftover cent.
  await openGroup(ana, group);
  await ana.getByRole('button', { name: 'Add expense' }).click();
  const dialog = ana.getByRole('dialog');
  await dialog.getByLabel('Description').fill('Dinner');
  await dialog.getByLabel('Amount', { exact: true }).fill('90.01');
  await dialog.getByLabel('Paid by').selectOption({ label: 'Ana Organizer' });
  await expect(dialog.getByRole('list', { name: 'Allocation preview' })).toContainText('$45.01');
  await dialog.getByRole('button', { name: 'Add expense' }).click();

  await expect(ana.getByText('Ana Organizer: gets back $45.00')).toBeVisible();
  await expect(ana.getByText('Ben Joiner: owes $45.00')).toBeVisible();

  // Ben sees the same balances and the transfer that settles them, but he isn't the one who
  // records it here: Ana, the receiver, does, so it is confirmed at once.
  await openGroup(ben, group);
  await expect(ben.getByText('Ben Joiner: owes $45.00')).toBeVisible();
  await expect(ben.getByRole('list', { name: 'Suggested transfers' })).toContainText('Ben Joiner pays Ana Organizer $45.00');

  await ana.getByRole('button', { name: 'Record payment: Ben Joiner pays Ana Organizer $45.00' }).click();
  await expect(ana.getByText('Ana Organizer: settled up')).toBeVisible();
  await expect(ana.getByText('Ben Joiner: settled up')).toBeVisible();

  // The settled state is stored, not just shown: a fresh load in Ben's session agrees.
  await ben.reload();
  await expect(ben.getByText('Ben Joiner: settled up')).toBeVisible();
  await expect(ben.getByText('Ana Organizer: settled up')).toBeVisible();
  await expect(ben.getByRole('button', { name: /^Record payment/ })).toHaveCount(0);
});
