import { NextResponse } from 'next/server';
import { appPath } from '../../../../lib/base-path.ts';
import { authorizeIngestRequest } from '../../../../lib/ingest/auth.ts';
import { createReviewItemFromRawInput, listReviewItems } from '../../../../lib/review/server-store.ts';

export const runtime = 'nodejs';

type IngestPostBody = {
  rawInput?: unknown;
  input?: unknown;
  markdown?: unknown;
  source?: unknown;
  runId?: unknown;
};

function rawInputFromBody(body: IngestPostBody): string | null {
  const value = body.rawInput ?? body.input ?? body.markdown;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function reviewUrlFor(request: Request, id: string): string {
  return new URL(appPath(`/review/${id}`), request.url).toString();
}

export async function POST(request: Request) {
  const auth = authorizeIngestRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: IngestPostBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Request body must be JSON.' }, { status: 400 });
  }

  const rawInput = rawInputFromBody(body);
  if (!rawInput) {
    return NextResponse.json({ ok: false, error: 'rawInput must be a non-empty string.' }, { status: 400 });
  }

  try {
    const ingestMetadata = {
      source: optionalString(body.source),
      runId: optionalString(body.runId),
      receivedAt: new Date().toISOString(),
    };
    const item = createReviewItemFromRawInput(rawInput, ingestMetadata);
    const allItems = listReviewItems();

    return NextResponse.json(
      {
        ok: true,
        id: item.id,
        reviewUrl: reviewUrlFor(request, item.id),
        compareReady: allItems.length > 1,
        item,
        ingest: ingestMetadata,
      },
      { status: 201 }
    );
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    const message = error instanceof Error ? error.message : 'Failed to ingest contract.';
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
