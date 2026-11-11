import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Transfer } from '@/lib/finance/debt-simplification';
import { TransactionGraph } from './transaction-graph';

const members = [
  { id: 'u-alice', name: 'Alice' },
  { id: 'u-bob', name: 'Bob' },
  { id: 'u-charlie', name: 'Charlie' },
  { id: 'u-dana', name: 'Dana' },
  { id: 'u-erin', name: 'Erin' },
];

/** simplifyDebts output for the #2 seed sample (Lake Tahoe Trip). */
const transfers: Transfer[] = [
  { fromMemberId: 'u-bob', toMemberId: 'u-alice', amountCents: 34500 },
  { fromMemberId: 'u-dana', toMemberId: 'u-alice', amountCents: 22900 },
  { fromMemberId: 'u-dana', toMemberId: 'u-charlie', amountCents: 4700 },
];

function graph() {
  return screen.getByRole('img', { name: 'Transaction graph' });
}

function nodeNames(column: 'payer' | 'receiver'): string[] {
  return Array.from(graph().querySelectorAll(`[data-column="${column}"]`)).map(
    (node) => node.textContent ?? '',
  );
}

function nodeX(name: string): number {
  const node = within(graph() as unknown as HTMLElement)
    .getByText(name)
    .closest('[data-column]');
  return Number(node?.querySelector('circle')?.getAttribute('cx'));
}

describe('TransactionGraph', () => {
  it('draws the transfers as an image with a text description of every transfer', () => {
    render(<TransactionGraph members={members} transfers={transfers} />);
    expect(graph()).toHaveAccessibleDescription(
      'Bob pays Alice $345.00. Dana pays Alice $229.00. Dana pays Charlie $47.00.',
    );
  });

  it('puts people who pay in one column and people who get paid in the other', () => {
    render(<TransactionGraph members={members} transfers={transfers} />);
    expect(nodeNames('payer')).toEqual(['Bob', 'Dana']);
    expect(nodeNames('receiver')).toEqual(['Alice', 'Charlie']);
    expect(nodeX('Bob')).toBeLessThan(nodeX('Alice'));
  });

  it('leaves out members who are not part of any transfer', () => {
    render(<TransactionGraph members={members} transfers={transfers} />);
    expect(within(graph() as unknown as HTMLElement).queryByText('Erin')).not.toBeInTheDocument();
  });

  it('draws one labelled arrow per transfer', () => {
    render(<TransactionGraph members={members} transfers={transfers} />);
    const edges = screen.getAllByTestId('graph-edge');
    expect(edges.map((edge) => edge.textContent)).toEqual([
      'Bob pays Alice $345.00$345.00',
      'Dana pays Alice $229.00$229.00',
      'Dana pays Charlie $47.00$47.00',
    ]);
    for (const edge of edges) {
      expect(edge.querySelector('line')).toHaveAttribute('marker-end');
    }
  });

  it('summarizes the number of transfers and the total amount', () => {
    render(<TransactionGraph members={members} transfers={transfers} />);
    expect(screen.getByText('3 transfers · $621.00 in total')).toBeInTheDocument();
  });

  it('uses the singular for a single transfer', () => {
    render(<TransactionGraph members={members} transfers={transfers.slice(0, 1)} />);
    expect(screen.getByText('1 transfer · $345.00 in total')).toBeInTheDocument();
  });

  it('grows taller when more people are involved, so labels never overlap', () => {
    const { unmount } = render(
      <TransactionGraph members={members} transfers={transfers.slice(0, 1)} />,
    );
    const shortHeight = Number(graph().getAttribute('viewBox')?.split(' ')[3]);
    unmount();
    render(<TransactionGraph members={members} transfers={transfers} />);
    const tallHeight = Number(graph().getAttribute('viewBox')?.split(' ')[3]);
    expect(tallHeight).toBeGreaterThan(shortHeight);
  });

  it('says so instead of drawing an empty graph when no transfers are needed', () => {
    render(<TransactionGraph members={members} transfers={[]} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('No transfers needed. Everyone is settled up.')).toBeInTheDocument();
  });

  it('shortens long names with an ellipsis and keeps the full name as a tooltip (#31 review)', () => {
    const longNames = [
      { id: 'u-a', name: 'Alexandria Montgomery-Smith' },
      { id: 'u-b', name: 'Alexandria Montgomery-Jones' },
    ];
    render(
      <TransactionGraph
        members={longNames}
        transfers={[{ fromMemberId: 'u-a', toMemberId: 'u-b', amountCents: 100 }]}
      />,
    );

    const payer = graph().querySelector('[data-column="payer"]');
    const receiver = graph().querySelector('[data-column="receiver"]');
    expect(payer?.querySelector('text')?.textContent).toBe('Alexandria Montg…');
    expect(payer?.querySelector('title')?.textContent).toBe('Alexandria Montgomery-Smith');
    expect(receiver?.querySelector('title')?.textContent).toBe('Alexandria Montgomery-Jones');
  });

  it('keeps short names as they are, without a tooltip', () => {
    render(<TransactionGraph members={members} transfers={transfers} />);
    expect(graph().querySelector('[data-column] title')).toBeNull();
  });

  it('labels a transfer to someone who is no longer listed as an unknown member', () => {
    render(
      <TransactionGraph
        members={members}
        transfers={[{ fromMemberId: 'u-bob', toMemberId: 'u-gone', amountCents: 100 }]}
      />,
    );
    expect(graph()).toHaveAccessibleDescription('Bob pays Unknown member $1.00.');
  });
});
