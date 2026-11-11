import { useId } from 'react';
import type { Transfer } from '@/lib/finance/debt-simplification';
import { formatCents } from '@/lib/finance/money-input';

export interface GraphMember {
  id: string;
  name: string;
}

export interface TransactionGraphProps {
  members: GraphMember[];
  /** Transfers from `simplifyDebts`, drawn in the order given. */
  transfers: Transfer[];
}

const WIDTH = 640;
const PAYER_X = 170;
const RECEIVER_X = 470;
const NODE_RADIUS = 16;
const ROW_HEIGHT = 64;
const TOP = 56;
const BOTTOM = 24;
/** Characters that fit beside a node at text-sm (about 146 units). */
const MAX_LABEL_CHARS = 16;

/** Shortens a long name with an ellipsis, counting characters rather than UTF-16 units. */
function shortLabel(name: string): string {
  const chars = Array.from(name);
  return chars.length > MAX_LABEL_CHARS ? `${chars.slice(0, MAX_LABEL_CHARS).join('').trimEnd()}…` : name;
}

/** A member's name beside their node; a shortened name keeps the full one as a tooltip. */
function NodeLabel({ name, ...position }: { name: string; x: number; y: number; textAnchor?: 'end' }) {
  const label = shortLabel(name);
  return (
    <>
      {label !== name && <title>{name}</title>}
      <text {...position} className="fill-gray-900 text-sm">
        {label}
      </text>
    </>
  );
}

/** Member IDs in order of first appearance. */
function uniqueInOrder(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

/**
 * Directed graph of settlement transfers (Issue #8): people who pay on the left,
 * people who get paid on the right, one labelled arrow per transfer.
 * The SVG carries a full text description, so the picture is never the only source.
 */
export function TransactionGraph({ members, transfers }: TransactionGraphProps) {
  // SVG references like url(#id) do not accept the colons React puts in generated IDs.
  const baseId = useId().replace(/:/g, '');
  const titleId = `${baseId}-title`;
  const descId = `${baseId}-desc`;
  const arrowId = `${baseId}-arrow`;

  if (transfers.length === 0) {
    return <p className="text-gray-600">No transfers needed. Everyone is settled up.</p>;
  }

  const names = new Map(members.map((m) => [m.id, m.name]));
  const nameOf = (id: string) => names.get(id) ?? 'Unknown member';
  const describe = (t: Transfer) =>
    `${nameOf(t.fromMemberId)} pays ${nameOf(t.toMemberId)} ${formatCents(t.amountCents)}`;

  const payers = uniqueInOrder(transfers.map((t) => t.fromMemberId));
  const receivers = uniqueInOrder(transfers.map((t) => t.toMemberId));
  const rows = Math.max(payers.length, receivers.length);
  const height = TOP + (rows - 1) * ROW_HEIGHT + NODE_RADIUS + BOTTOM;

  // Center the shorter column against the longer one.
  const yOf = (index: number, count: number) =>
    TOP + ((rows - count) * ROW_HEIGHT) / 2 + index * ROW_HEIGHT;
  const payerY = new Map(payers.map((id, i) => [id, yOf(i, payers.length)]));
  const receiverY = new Map(receivers.map((id, i) => [id, yOf(i, receivers.length)]));

  const totalCents = transfers.reduce((sum, t) => sum + t.amountCents, 0);
  const count = `${transfers.length} ${transfers.length === 1 ? 'transfer' : 'transfers'}`;

  return (
    <figure className="space-y-2">
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="h-auto w-full max-w-2xl"
      >
        <title id={titleId}>Transaction graph</title>
        <desc id={descId}>{transfers.map((t) => `${describe(t)}.`).join(' ')}</desc>
        <defs>
          <marker
            id={arrowId}
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-gray-500" />
          </marker>
        </defs>

        <text x={PAYER_X} y={24} textAnchor="middle" className="fill-gray-600 text-sm font-medium">
          Pays
        </text>
        <text x={RECEIVER_X} y={24} textAnchor="middle" className="fill-gray-600 text-sm font-medium">
          Gets paid
        </text>

        {transfers.map((t) => {
          const y1 = payerY.get(t.fromMemberId) as number;
          const y2 = receiverY.get(t.toMemberId) as number;
          const amount = formatCents(t.amountCents);
          return (
            <g key={`${t.fromMemberId}-${t.toMemberId}`} data-testid="graph-edge">
              <title>{describe(t)}</title>
              <line
                x1={PAYER_X + NODE_RADIUS}
                y1={y1}
                x2={RECEIVER_X - NODE_RADIUS - 2}
                y2={y2}
                markerEnd={`url(#${arrowId})`}
                className="stroke-gray-500"
                strokeWidth={2}
              />
              <text
                x={(PAYER_X + RECEIVER_X) / 2}
                y={(y1 + y2) / 2 - 6}
                textAnchor="middle"
                paintOrder="stroke"
                className="fill-gray-900 stroke-white text-sm font-semibold"
                strokeWidth={4}
              >
                {amount}
              </text>
            </g>
          );
        })}

        {payers.map((id) => (
          <g key={id} data-column="payer">
            <circle cx={PAYER_X} cy={payerY.get(id)} r={NODE_RADIUS} className="fill-red-50 stroke-red-700" strokeWidth={2} />
            <NodeLabel name={nameOf(id)} x={PAYER_X - NODE_RADIUS - 8} y={(payerY.get(id) as number) + 5} textAnchor="end" />
          </g>
        ))}
        {receivers.map((id) => (
          <g key={id} data-column="receiver">
            <circle cx={RECEIVER_X} cy={receiverY.get(id)} r={NODE_RADIUS} className="fill-emerald-50 stroke-emerald-700" strokeWidth={2} />
            <NodeLabel name={nameOf(id)} x={RECEIVER_X + NODE_RADIUS + 8} y={(receiverY.get(id) as number) + 5} />
          </g>
        ))}
      </svg>
      <figcaption className="text-sm text-gray-600">
        {`${count} · ${formatCents(totalCents)} in total`}
      </figcaption>
    </figure>
  );
}
