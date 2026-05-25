import { pathMatchesAnyGlob } from '../aiplan/path-globs.ts';

export type ScopeCheckInput = {
  allowedFiles: string[];
  excludedFiles: string[];
  changedFiles: string[];
};

export type ScopeCheckResult = {
  allowedChanged: string[];
  outsideAllowed: string[];
  excludedTouched: string[];
  invalidChangedFiles: string[];
};

function normalizePath(path: string): string {
  let normalized = path.replaceAll('\\', '/').trim();
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  while (normalized.startsWith('/')) normalized = normalized.slice(1);
  return normalized;
}

function invalidPathReason(path: string): string | null {
  const normalized = path.replaceAll('\\', '/').trim();
  if (normalized.length === 0) return 'empty path';
  if (normalized.startsWith('/')) return 'absolute path';
  if (normalized.split('/').includes('..')) return 'path traversal';
  if (normalized.includes('//')) return 'empty path segment';
  return null;
}

function uniqueNormalized(paths: string[]): string[] {
  return [...new Set(paths.map(normalizePath).filter(Boolean))];
}

export function checkScopeAgainstPlan(input: ScopeCheckInput): ScopeCheckResult {
  const invalidChangedFiles = uniqueNormalized(input.changedFiles.filter((file) => invalidPathReason(file)));
  const invalidSet = new Set(invalidChangedFiles);
  const changedFiles = uniqueNormalized(input.changedFiles).filter((file) => !invalidSet.has(file));

  return {
    allowedChanged: changedFiles.filter((file) => pathMatchesAnyGlob(file, input.allowedFiles)),
    outsideAllowed: changedFiles.filter((file) => !pathMatchesAnyGlob(file, input.allowedFiles)),
    excludedTouched: changedFiles.filter((file) => pathMatchesAnyGlob(file, input.excludedFiles)),
    invalidChangedFiles,
  };
}
