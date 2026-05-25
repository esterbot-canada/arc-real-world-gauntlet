import { NextResponse } from 'next/server';
import { updateReviewStatus } from '../../../../lib/review/server-store.ts';

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

type PatchBody = {
  reviewStatus?: unknown;
  status?: unknown;
};

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await Promise.resolve(context.params);
  let body: PatchBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  try {
    const item = updateReviewStatus(id, body.reviewStatus ?? body.status);
    if (!item) return NextResponse.json({ error: 'Review item not found.' }, { status: 404 });
    return NextResponse.json({ item });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 400;
    const message = error instanceof Error ? error.message : 'Failed to update review status.';
    return NextResponse.json({ error: message }, { status });
  }
}
