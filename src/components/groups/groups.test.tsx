import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GroupSummary } from '@/lib/db/groups';
import { CreateGroupForm } from './create-group-form';
import { GroupList } from './group-list';
import { JoinGroupForm } from './join-group-form';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

const group = (overrides: Partial<GroupSummary> = {}): GroupSummary => ({
  id: 'g-1',
  name: 'Lake Tahoe Trip',
  description: null,
  currency: 'USD',
  isArchived: false,
  memberCount: 4,
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
  refresh.mockReset();
});

describe('GroupList', () => {
  it('links each group to its page, with its member count and an Archived label in text', () => {
    render(
      <GroupList
        groups={[group(), group({ id: 'g-2', name: 'Spring Break 2026', memberCount: 1, isArchived: true })]}
      />,
    );

    const list = screen.getByRole('list', { name: 'Your groups' });
    const [tahoe, spring] = within(list).getAllByRole('listitem');
    expect(within(tahoe).getByRole('link', { name: 'Lake Tahoe Trip' })).toHaveAttribute('href', '/groups/g-1');
    expect(tahoe).toHaveTextContent('4 members');
    expect(tahoe).not.toHaveTextContent('Archived');
    expect(within(spring).getByRole('link', { name: 'Spring Break 2026' })).toHaveAttribute('href', '/groups/g-2');
    expect(spring).toHaveTextContent('1 member');
    expect(spring).toHaveTextContent('Archived');
  });

  it('explains what to do when there are no groups', () => {
    render(<GroupList groups={[]} />);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText(/not in any groups yet/)).toBeInTheDocument();
  });
});

describe('CreateGroupForm', () => {
  it('creates the group, refreshes the list, and shows the invite code to share', async () => {
    const fetchSpy = mockFetch(201, { group: { id: 'g-9', name: 'Ski trip', inviteCode: 'code-123' } });
    render(<CreateGroupForm />);

    await userEvent.type(screen.getByLabelText('Group name'), 'Ski trip');
    await userEvent.type(screen.getByLabelText('Description (optional)'), 'February');
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/groups', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ski trip', description: 'February' }),
    });
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Created Ski trip. Share the invite code code-123 so others can join.');
    expect(screen.getByLabelText('Group name')).toHaveValue('');
  });

  it('shows the server’s field error next to the field', async () => {
    mockFetch(400, { code: 'invalid_input', message: 'Check the highlighted fields.', fields: { name: 'Use at most 100 characters.' } });
    render(<CreateGroupForm />);

    await userEvent.type(screen.getByLabelText('Group name'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));

    const name = screen.getByLabelText('Group name');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Use at most 100 characters.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows an alert when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    render(<CreateGroupForm />);

    await userEvent.type(screen.getByLabelText('Group name'), 'Ski trip');
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t create the group. Please try again.');
  });
});

describe('JoinGroupForm', () => {
  it('joins the group, refreshes the list, and says so', async () => {
    const fetchSpy = mockFetch(200, { group: { id: 'g-1', name: 'Lake Tahoe Trip' } });
    render(<JoinGroupForm />);

    await userEvent.type(screen.getByLabelText('Invite code'), '  code-123 ');
    await userEvent.click(screen.getByRole('button', { name: 'Join group' }));

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/groups/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: 'code-123' }),
    });
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Joined Lake Tahoe Trip.');
  });

  it.each([
    [404, { code: 'not_found', message: 'No group has this invite code.' }, 'No group has this invite code. Check it and try again.'],
    [409, { code: 'group_archived', message: 'Archived.' }, 'That group is archived, so it can’t take new members.'],
  ])('explains a %i answer', async (status, body, message) => {
    mockFetch(status, body);
    render(<JoinGroupForm />);

    await userEvent.type(screen.getByLabelText('Invite code'), 'code-123');
    await userEvent.click(screen.getByRole('button', { name: 'Join group' }));

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('asks for a code instead of sending an empty one', async () => {
    const fetchSpy = mockFetch(200, {});
    render(<JoinGroupForm />);

    await userEvent.click(screen.getByRole('button', { name: 'Join group' }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Invite code')).toHaveAccessibleDescription('Enter the invite code you were given.');
  });
});
