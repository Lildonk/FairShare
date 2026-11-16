import type { NextRequest } from 'next/server';
import { validateExportFormat } from '@/lib/api/ledger-input';
import { ledgerToCsv, ledgerToJson } from '@/lib/audit/ledger-export';
import { requireGroupMember } from '@/lib/auth/current-user';
import { ledgerRowsForGroup } from '@/lib/db/ledger';
import { HttpError, errorResponse } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

const CONTENT_TYPES = { csv: 'text/csv; charset=utf-8', json: 'application/json; charset=utf-8' } as const;

/**
 * GET /api/v1/groups/:groupId/export?format=csv|json: the group's ledger (expenses and payments) as
 * a download (#8). Members only; archived groups can still be exported. CSV cells that a spreadsheet
 * would run as formulas are neutralized, and amounts come from integer cents.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { group } = await requireGroupMember(request, (await params).groupId);
    const format = validateExportFormat(request.nextUrl.searchParams.get('format'));
    if (!format.ok) throw new HttpError(400, 'invalid_input', 'Check the highlighted fields.', format.errors);

    const rows = await ledgerRowsForGroup(group.id);
    const body = format.value === 'csv' ? ledgerToCsv(rows) : ledgerToJson(group.name, rows, new Date().toISOString());
    return new Response(body, {
      headers: {
        'content-type': CONTENT_TYPES[format.value],
        // The group ID, not its name, so the file name never needs escaping.
        'content-disposition': `attachment; filename="fairshare-ledger-${group.id}.${format.value}"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
