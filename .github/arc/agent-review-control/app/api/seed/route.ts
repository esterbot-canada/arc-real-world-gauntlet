import { NextResponse } from 'next/server';
import { sampleContracts } from '../../../lib/contracts/sample-contracts.ts';
import { seedReviewItem } from '../../../lib/review/server-store.ts';

export const runtime = 'nodejs';

export async function POST() {
  const items = sampleContracts.map((sample) => seedReviewItem(sample));
  return NextResponse.json({ items, count: items.length });
}
