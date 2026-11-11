import { NextResponse } from 'next/server';
import { openApiDocument } from '@/lib/api/openapi';

/** GET /api/v1/openapi.json: the OpenAPI 3.0 description of this API. Public. */
export function GET() {
  return NextResponse.json(openApiDocument);
}
