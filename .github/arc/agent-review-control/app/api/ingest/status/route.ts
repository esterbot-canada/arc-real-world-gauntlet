import { NextResponse } from 'next/server';
import { appPath } from '../../../../lib/base-path.ts';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const tokenConfigured = Boolean(process.env.ARC_INGEST_TOKEN?.trim());
  const endpointPath = appPath('/api/ingest/contracts');

  return NextResponse.json({
    tokenConfigured,
    endpointPath,
    endpointUrl: new URL(endpointPath, request.url).toString(),
    auth: 'Authorization: Bearer $ARC_INGEST_TOKEN',
  });
}
