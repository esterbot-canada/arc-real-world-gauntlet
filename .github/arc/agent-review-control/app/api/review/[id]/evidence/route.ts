import { NextResponse } from 'next/server';
import { updateCompletionEvidence } from '../../../../../lib/review/server-store.ts';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await Promise.resolve(context.params);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const item = updateCompletionEvidence(id, body);
  if (!item) return NextResponse.json({ error: 'Review item not found.' }, { status: 404 });
  return NextResponse.json({ item });
}
