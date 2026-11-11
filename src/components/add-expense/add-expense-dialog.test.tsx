import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddExpenseDialog, type GroupMemberOption, type NewExpense } from './add-expense-dialog';

const members: GroupMemberOption[] = [
  { id: 'u-alice', name: 'Alice' },
  { id: 'u-bob', name: 'Bob' },
  { id: 'u-carol', name: 'Carol' },
];

function setup() {
  const onSubmit = vi.fn<(expense: NewExpense) => void>();
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(
    <AddExpenseDialog
      members={members}
      currentUserId="u-alice"
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
  return { user, onSubmit, onCancel };
}

function previewRows(): (string | null)[] {
  const list = screen.getByRole('list', { name: 'Allocation preview' });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

async function fillBasics(user: ReturnType<typeof userEvent.setup>, amount: string) {
  await user.type(screen.getByLabelText('Description'), 'Dinner');
  await user.type(screen.getByLabelText('Amount'), amount);
}

describe('AddExpenseDialog', () => {
  describe('form fields', () => {
    it('renders an accessible dialog with payer, amount, description, and participants', () => {
      setup();
      expect(screen.getByRole('dialog', { name: 'Add expense' })).toBeInTheDocument();
      expect(screen.getByLabelText('Description')).toBeInTheDocument();
      expect(screen.getByLabelText('Amount')).toBeInTheDocument();
      expect(screen.getByLabelText('Paid by')).toHaveValue('u-alice');
      const participants = screen.getByRole('group', { name: 'Split among' });
      for (const name of ['Alice', 'Bob', 'Carol']) {
        expect(within(participants).getByRole('checkbox', { name })).toBeChecked();
      }
    });

    it('offers EQUAL, EXACT, and PERCENTAGE modes with EQUAL selected by default', () => {
      setup();
      const modes = screen.getByRole('radiogroup', { name: 'Split type' });
      expect(within(modes).getByRole('radio', { name: 'Equal' })).toBeChecked();
      expect(within(modes).getByRole('radio', { name: 'Exact' })).not.toBeChecked();
      expect(within(modes).getByRole('radio', { name: 'Percentage' })).not.toBeChecked();
    });

    it('moves focus to the description field when it opens', () => {
      setup();
      expect(screen.getByLabelText('Description')).toHaveFocus();
    });
  });

  describe('EQUAL preview', () => {
    it('matches the mockup: $120.01 among three gives the payer the leftover cent', async () => {
      const { user } = setup();
      await user.type(screen.getByLabelText('Amount'), '120.01');
      expect(previewRows()).toEqual([
        'Alice (payer): $40.01',
        'Bob: $40.00',
        'Carol: $40.00',
      ]);
      expect(screen.getByRole('status')).toHaveTextContent('Total allocated: $120.01 of $120.01');
    });

    it('recalculates when a participant is removed', async () => {
      const { user } = setup();
      await user.type(screen.getByLabelText('Amount'), '120.01');
      await user.click(screen.getByRole('checkbox', { name: 'Carol' }));
      expect(previewRows()).toEqual(['Alice (payer): $60.01', 'Bob: $60.00']);
    });

    it('recalculates when the payer changes', async () => {
      const { user } = setup();
      await user.type(screen.getByLabelText('Amount'), '120.01');
      await user.selectOptions(screen.getByLabelText('Paid by'), 'u-bob');
      expect(previewRows()).toEqual(['Alice: $40.00', 'Bob (payer): $40.01', 'Carol: $40.00']);
    });

    it('spreads leftover cents by member ID when the payer is not splitting', async () => {
      const { user } = setup();
      await user.type(screen.getByLabelText('Amount'), '1.01');
      await user.click(screen.getByRole('checkbox', { name: 'Alice' }));
      expect(previewRows()).toEqual(['Bob: $0.51', 'Carol: $0.50']);
    });

    it('asks for an amount before showing a preview', () => {
      setup();
      expect(screen.getByRole('status')).toHaveTextContent('Enter an amount to see the split.');
    });
  });

  describe('mode switching', () => {
    it('shows per-person amount fields only in EXACT mode', async () => {
      const { user } = setup();
      expect(screen.queryByLabelText('Amount for Bob')).not.toBeInTheDocument();
      await user.click(screen.getByRole('radio', { name: 'Exact' }));
      expect(screen.getByLabelText('Amount for Alice')).toBeInTheDocument();
      expect(screen.getByLabelText('Amount for Bob')).toBeInTheDocument();
      expect(screen.getByLabelText('Amount for Carol')).toBeInTheDocument();
      await user.click(screen.getByRole('radio', { name: 'Equal' }));
      expect(screen.queryByLabelText('Amount for Bob')).not.toBeInTheDocument();
    });

    it('shows per-person percentage fields only in PERCENTAGE mode', async () => {
      const { user } = setup();
      await user.click(screen.getByRole('radio', { name: 'Percentage' }));
      expect(screen.getByLabelText('Percentage for Alice')).toBeInTheDocument();
      expect(screen.queryByLabelText('Amount for Alice')).not.toBeInTheDocument();
    });

    it('only shows per-person fields for people who are splitting', async () => {
      const { user } = setup();
      await user.click(screen.getByRole('radio', { name: 'Exact' }));
      await user.click(screen.getByRole('checkbox', { name: 'Carol' }));
      expect(screen.queryByLabelText('Amount for Carol')).not.toBeInTheDocument();
    });
  });

  describe('EXACT mode', () => {
    it('previews entered amounts and the running total', async () => {
      const { user } = setup();
      await user.type(screen.getByLabelText('Amount'), '100');
      await user.click(screen.getByRole('radio', { name: 'Exact' }));
      await user.type(screen.getByLabelText('Amount for Alice'), '60');
      await user.type(screen.getByLabelText('Amount for Bob'), '30');
      expect(previewRows()).toEqual(['Alice (payer): $60.00', 'Bob: $30.00', 'Carol: $0.00']);
      expect(screen.getByRole('status')).toHaveTextContent('Total allocated: $90.00 of $100.00');
    });

    it('blocks submission when exact amounts do not match the total', async () => {
      const { user, onSubmit } = setup();
      await fillBasics(user, '100');
      await user.click(screen.getByRole('radio', { name: 'Exact' }));
      await user.type(screen.getByLabelText('Amount for Alice'), '60');
      await user.type(screen.getByLabelText('Amount for Bob'), '30');
      await user.click(screen.getByRole('button', { name: 'Add expense' }));
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Exact amounts add up to $90.00, but the expense total is $100.00.',
      );
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('reports an invalid per-person amount', async () => {
      const { user, onSubmit } = setup();
      await fillBasics(user, '100');
      await user.click(screen.getByRole('radio', { name: 'Exact' }));
      await user.type(screen.getByLabelText('Amount for Bob'), 'abc');
      await user.click(screen.getByRole('button', { name: 'Add expense' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid amount for Bob.');
      expect(screen.getByLabelText('Amount for Bob')).toHaveAttribute('aria-invalid', 'true');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('submits exact amounts that add up to the total', async () => {
      const { user, onSubmit } = setup();
      await fillBasics(user, '100');
      await user.click(screen.getByRole('radio', { name: 'Exact' }));
      await user.type(screen.getByLabelText('Amount for Alice'), '60');
      await user.type(screen.getByLabelText('Amount for Bob'), '30');
      await user.type(screen.getByLabelText('Amount for Carol'), '10');
      await user.click(screen.getByRole('button', { name: 'Add expense' }));
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Dinner',
        amountCents: 10000,
        payerId: 'u-alice',
        splitType: 'EXACT',
        splits: [
          { userId: 'u-alice', owedCents: 6000, allocatedBps: null },
          { userId: 'u-bob', owedCents: 3000, allocatedBps: null },
          { userId: 'u-carol', owedCents: 1000, allocatedBps: null },
        ],
      });
    });
  });

  describe('PERCENTAGE mode', () => {
    it('previews cents from percentages and submits basis points', async () => {
      const { user, onSubmit } = setup();
      await fillBasics(user, '100');
      await user.click(screen.getByRole('radio', { name: 'Percentage' }));
      await user.type(screen.getByLabelText('Percentage for Alice'), '50');
      await user.type(screen.getByLabelText('Percentage for Bob'), '30');
      await user.type(screen.getByLabelText('Percentage for Carol'), '20');
      expect(previewRows()).toEqual(['Alice (payer): $50.00', 'Bob: $30.00', 'Carol: $20.00']);
      await user.click(screen.getByRole('button', { name: 'Add expense' }));
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Dinner',
        amountCents: 10000,
        payerId: 'u-alice',
        splitType: 'PERCENTAGE',
        splits: [
          { userId: 'u-alice', owedCents: 5000, allocatedBps: 5000 },
          { userId: 'u-bob', owedCents: 3000, allocatedBps: 3000 },
          { userId: 'u-carol', owedCents: 2000, allocatedBps: 2000 },
        ],
      });
    });

    it('accepts 33.33% three times within the 0.01% tolerance', async () => {
      const { user } = setup();
      await user.type(screen.getByLabelText('Amount'), '100');
      await user.click(screen.getByRole('radio', { name: 'Percentage' }));
      for (const name of ['Alice', 'Bob', 'Carol']) {
        await user.type(screen.getByLabelText(`Percentage for ${name}`), '33.33');
      }
      expect(previewRows()).toEqual(['Alice (payer): $33.34', 'Bob: $33.33', 'Carol: $33.33']);
      expect(screen.getByRole('status')).toHaveTextContent('Total allocated: $100.00 of $100.00');
    });

    it('blocks submission when percentages are outside the tolerance', async () => {
      const { user, onSubmit } = setup();
      await fillBasics(user, '100');
      await user.click(screen.getByRole('radio', { name: 'Percentage' }));
      await user.type(screen.getByLabelText('Percentage for Alice'), '50');
      await user.type(screen.getByLabelText('Percentage for Bob'), '40');
      expect(screen.getByRole('status')).toHaveTextContent('Percentages add up to 90.00%');
      await user.click(screen.getByRole('button', { name: 'Add expense' }));
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Percentages add up to 90.00%; they must total 100% (within 0.01%).',
      );
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('validation and submission', () => {
    it('shows accessible errors for an empty form and does not submit', async () => {
      const { user, onSubmit } = setup();
      await user.click(screen.getByRole('button', { name: 'Add expense' }));
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Enter a description.');
      expect(alert).toHaveTextContent('Enter an amount greater than $0.00');
      const description = screen.getByLabelText('Description');
      expect(description).toHaveAttribute('aria-invalid', 'true');
      expect(description).toHaveAccessibleDescription('Enter a description.');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('rejects an amount with more than two decimals', async () => {
      const { user, onSubmit } = setup();
      await fillBasics(user, '12.345');
      await user.click(screen.getByRole('button', { name: 'Add expense' }));
      expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'true');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('requires at least one participant', async () => {
      const { user, onSubmit } = setup();
      await fillBasics(user, '30');
      for (const name of ['Alice', 'Bob', 'Carol']) {
        await user.click(screen.getByRole('checkbox', { name }));
      }
      await user.click(screen.getByRole('button', { name: 'Add expense' }));
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Choose at least one person to split with.',
      );
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('submits a valid EQUAL expense with integer cents', async () => {
      const { user, onSubmit } = setup();
      await user.type(screen.getByLabelText('Description'), '  Dinner  ');
      await user.type(screen.getByLabelText('Amount'), '$120.01');
      await user.click(screen.getByRole('button', { name: 'Add expense' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Dinner',
        amountCents: 12001,
        payerId: 'u-alice',
        splitType: 'EQUAL',
        splits: [
          { userId: 'u-alice', owedCents: 4001, allocatedBps: null },
          { userId: 'u-bob', owedCents: 4000, allocatedBps: null },
          { userId: 'u-carol', owedCents: 4000, allocatedBps: null },
        ],
      });
    });

    it('calls onCancel from the Cancel button', async () => {
      const { user, onCancel } = setup();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when Escape is pressed', async () => {
      const { user, onCancel } = setup();
      await user.keyboard('{Escape}');
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('focus containment (#7)', () => {
    it('makes the rest of the page inert while open and restores it on close (#33 review)', () => {
      const page = document.createElement('main');
      const alreadyInert = document.createElement('aside');
      alreadyInert.setAttribute('inert', '');
      document.body.append(page, alreadyInert);

      const { unmount } = render(
        <AddExpenseDialog
          members={members}
          currentUserId="u-alice"
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(page).toHaveAttribute('inert');
      expect(screen.getByRole('dialog').closest('[inert]')).toBeNull();
      unmount();

      expect(page).not.toHaveAttribute('inert');
      expect(alreadyInert).toHaveAttribute('inert');
      page.remove();
      alreadyInert.remove();
    });

    it('keeps focus in the dialog when the backdrop is clicked, so Escape still closes it', async () => {
      const { user, onCancel } = setup();
      const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;

      await user.click(backdrop);
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
      await user.keyboard('{Escape}');

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('wraps Tab from the last control back to the first, so focus stays in the dialog', async () => {
      const { user } = setup();
      screen.getByRole('button', { name: 'Add expense' }).focus();
      await user.tab();
      expect(screen.getByLabelText('Description')).toHaveFocus();
    });

    it('wraps Shift+Tab from the first control to the last', async () => {
      const { user } = setup();
      expect(screen.getByLabelText('Description')).toHaveFocus();
      await user.tab({ shift: true });
      expect(screen.getByRole('button', { name: 'Add expense' })).toHaveFocus();
    });

    it('still moves through the controls normally inside the dialog', async () => {
      const { user } = setup();
      await user.tab();
      expect(screen.getByLabelText('Description')).not.toHaveFocus();
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    });

    it('returns focus to the control that opened it when it closes', () => {
      const opener = document.createElement('button');
      opener.textContent = 'Open';
      document.body.appendChild(opener);
      opener.focus();

      const { unmount } = render(
        <AddExpenseDialog
          members={members}
          currentUserId="u-alice"
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByLabelText('Description')).toHaveFocus();
      unmount();

      expect(opener).toHaveFocus();
      opener.remove();
    });
  });
});
