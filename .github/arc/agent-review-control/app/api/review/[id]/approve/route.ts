import { NextResponse } from 'next/server';
import { approveReviewItem } from '../../../../../lib/review/server-store.ts';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await Promise.resolve(context.params);
  const body = await request.json().catch(() => ({}));
  const item = approveReviewItem(id, body);
  if (!item) return NextResponse.json({ error: 'Review item not found.' }, { status: 404 });
  return NextResponse.json({ item });
}
