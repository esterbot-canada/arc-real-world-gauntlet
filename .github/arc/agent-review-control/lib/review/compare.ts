import type { ReviewItem } from './types.ts';

export type ReviewComparison = {
  older: ReviewItem;
  newer: ReviewItem;
  sharedFiles: string[];
  sharedSystems: string[];
  sharedBoundaries: string[];
  olderOnlyFiles: string[];
  newerOnlyFiles: string[];
  summary: string[];
};

function list(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.filter((item) => item.trim().length > 0) : [];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right.map(normalize));
  return [...new Set(left.filter((item) => rightSet.has(normalize(item))))];
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right.map(normalize));
  return left.filter((item) => !rightSet.has(normalize(item)));
}

function boundaryFor(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/').trim();
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) return normalized;
  const fileName = parts.at(-1) ?? '';
  return fileName.includes('.') ? parts.slice(0, -1).join('/') : parts.join('/');
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function compareReviewItems(left: ReviewItem, right: ReviewItem): ReviewComparison {
  const [older, newer] = new Date(left.createdAt).getTime() <= new Date(right.createdAt).getTime() ? [left, right] : [right, left];
  const olderFiles = list(older.contract.files_touched);
  const newerFiles = list(newer.contract.files_touched);
  const olderSystems = list(older.contract.systems_touched);
  const newerSystems = list(newer.contract.systems_touched);
  const sharedFiles = intersection(olderFiles, newerFiles);
  const sharedSystems = intersection(olderSystems, newerSystems);
  const sharedBoundaries = intersection(unique(olderFiles.map(boundaryFor)), unique(newerFiles.map(boundaryFor))).filter(
    (boundary) => !sharedFiles.some((file) => normalize(boundaryFor(file)) === normalize(boundary))
  );

  const summary: string[] = [];
  if (sharedFiles.length > 0) summary.push(`Both runs touch the same file(s): ${sharedFiles.join(', ')}.`);
  if (sharedBoundaries.length > 0) summary.push(`Both runs touch the same area(s): ${sharedBoundaries.join(', ')}.`);
  if (sharedSystems.length > 0) summary.push(`Both runs touch the same system(s): ${sharedSystems.join(', ')}.`);
  if (list(older.contract.tests_run).length > 0 && list(newer.contract.tests_run).length === 0) summary.push('Older run has test evidence; newer run does not.');
  if (list(older.contract.tests_run).length === 0 && list(newer.contract.tests_run).length > 0) summary.push('Newer run has test evidence; older run does not.');
  if (older.contract.rollback_note && !newer.contract.rollback_note) summary.push('Older run has a rollback note; newer run does not.');
  if (!older.contract.rollback_note && newer.contract.rollback_note) summary.push('Newer run has a rollback note; older run does not.');
  if (summary.length === 0) summary.push('No direct file, boundary, or system overlap detected between these runs.');

  return {
    older,
    newer,
    sharedFiles,
    sharedSystems,
    sharedBoundaries,
    olderOnlyFiles: difference(olderFiles, newerFiles),
    newerOnlyFiles: difference(newerFiles, olderFiles),
    summary,
  };
}
