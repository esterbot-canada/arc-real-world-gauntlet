import { NextResponse } from 'next/server';
import { deleteReviewItem, getReviewItemWithGit } from '../../../../lib/review/server-store.ts';

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export const runtime = 'nodejs';

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await Promise.resolve(context.params);
  const item = await getReviewItemWithGit(id);

  if (!item) {
    return NextResponse.json({ error: 'Contract not found.' }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await Promise.resolve(context.params);
  const deleted = deleteReviewItem(id);

  if (!deleted) {
    return NextResponse.json({ error: 'Contract not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
