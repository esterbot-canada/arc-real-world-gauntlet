import { NextResponse } from 'next/server';
import { evaluatePushGate } from '../../../../lib/gate/policy.ts';
import { getReviewItem } from '../../../../lib/review/server-store.ts';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { reviewId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  if (typeof body.reviewId !== 'string' || body.reviewId.trim().length === 0) {
    return NextResponse.json({ error: 'reviewId is required.' }, { status: 400 });
  }

  const item = getReviewItem(body.reviewId.trim());
  if (!item) return NextResponse.json({ error: 'Review item not found.' }, { status: 404 });

  return NextResponse.json(evaluatePushGate(item));
}
