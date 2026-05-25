import { NextResponse } from 'next/server';
import { createReviewItemFromRawInput, listReviewItemsWithGit, withGitReadiness } from '../../../lib/review/server-store.ts';

export const runtime = 'nodejs';

type ContractPostBody = {
  rawInput?: unknown;
  input?: unknown;
  markdown?: unknown;
};

function rawInputFromBody(body: ContractPostBody): string | null {
  const value = body.rawInput ?? body.input ?? body.markdown;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export async function GET() {
  return NextResponse.json({ items: await listReviewItemsWithGit() });
}

export async function POST(request: Request) {
  let body: ContractPostBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const rawInput = rawInputFromBody(body);
  if (!rawInput) {
    return NextResponse.json({ error: 'rawInput must be a non-empty string.' }, { status: 400 });
  }

  try {
    const item = await withGitReadiness(createReviewItemFromRawInput(rawInput));
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    const message = error instanceof Error ? error.message : 'Failed to create contract.';
    return NextResponse.json({ error: message }, { status });
  }
}
