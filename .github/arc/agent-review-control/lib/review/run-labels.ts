import type { ReviewItem } from './types.ts';

export type RunLabel = {
  sequence: number;
  shortLabel: string;
  code: string;
  createdLabel: string;
  updatedLabel: string;
};

function padSequence(sequence: number): string {
  return sequence.toString().padStart(3, '0');
}

function dateCode(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'unknown-date';
  return `${date.getUTCFullYear()}${(date.getUTCMonth() + 1).toString().padStart(2, '0')}${date.getUTCDate().toString().padStart(2, '0')}`;
}

function timeLabel(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function runSequenceMap(items: Pick<ReviewItem, 'id' | 'createdAt'>[]): Map<string, number> {
  const ordered = [...items].sort((left, right) => {
    const createdDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (createdDelta !== 0) return createdDelta;
    return left.id.localeCompare(right.id);
  });

  return new Map(ordered.map((item, index) => [item.id, index + 1]));
}

export function runLabelFor(item: Pick<ReviewItem, 'id' | 'createdAt' | 'updatedAt'>, sequence: number): RunLabel {
  const padded = padSequence(sequence);
  return {
    sequence,
    shortLabel: `Run #${padded}`,
    code: `ARC-${dateCode(item.createdAt)}-${padded}`,
    createdLabel: timeLabel(item.createdAt),
    updatedLabel: timeLabel(item.updatedAt),
  };
}
