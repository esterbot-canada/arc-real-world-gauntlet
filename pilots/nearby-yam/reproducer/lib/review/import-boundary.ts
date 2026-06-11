import { dirname, join } from 'node:path/posix';

import { pathMatchesAnyGlob } from '../aiplan/path-globs.ts';

export type ImportBoundaryInput = {
  entryFiles: string[];
  fileTexts: Record<string, string>;
  excludedFiles: string[];
  maxDepth?: number;
};

export type ImportBoundaryViolation = {
  importer: string;
  specifier: string;
  resolvedPath: string;
  chain: string[];
};

export type ImportBoundaryResult = {
  violations: ImportBoundaryViolation[];
};

const LOCAL_IMPORT_PREFIX = './';
const LOCAL_PARENT_IMPORT_PREFIX = '../';
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];

function normalizePath(path: string): string {
  let normalized = path.replaceAll('\\', '/').trim();
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  while (normalized.startsWith('/')) normalized = normalized.slice(1);
  return normalized;
}

function isSafePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/').trim();
  if (normalized.length === 0) return false;
  if (normalized.startsWith('/')) return false;
  if (normalized.includes('//')) return false;
  if (normalized.split('/').includes('..')) return false;
  return true;
}

function isLocalSpecifier(specifier: string): boolean {
  return specifier.startsWith(LOCAL_IMPORT_PREFIX) || specifier.startsWith(LOCAL_PARENT_IMPORT_PREFIX);
}

export function extractLocalImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]?.trim();
      if (specifier && isLocalSpecifier(specifier)) specifiers.push(specifier);
    }
  }

  return [...new Set(specifiers)];
}

function resolveLocalImport(importer: string, specifier: string, knownFiles: Set<string>): string | null {
  const base = normalizePath(join(dirname(normalizePath(importer)), specifier));
  const candidates = EXTENSIONS.flatMap((extension) => {
    const candidate = `${base}${extension}`;
    return [candidate, `${candidate}/index.ts`, `${candidate}/index.tsx`, `${candidate}/index.js`, `${candidate}/index.jsx`, `${candidate}/index.mjs`, `${candidate}/index.cjs`];
  }).map(normalizePath);

  for (const candidate of candidates) {
    if (knownFiles.has(candidate)) return candidate;
  }

  return candidates.find(isSafePath) ?? null;
}

export function checkImportBoundary(input: ImportBoundaryInput): ImportBoundaryResult {
  const maxDepth = input.maxDepth ?? 1;
  const normalizedTexts = Object.fromEntries(Object.entries(input.fileTexts).map(([path, text]) => [normalizePath(path), text]));
  const knownFiles = new Set([...Object.keys(normalizedTexts), ...input.entryFiles.map(normalizePath)]);
  const violations: ImportBoundaryViolation[] = [];
  const visited = new Set<string>();

  function visit(file: string, chain: string[], depth: number): void {
    const normalizedFile = normalizePath(file);
    const visitKey = `${normalizedFile}:${depth}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);

    const source = normalizedTexts[normalizedFile];
    if (source === undefined) return;

    for (const specifier of extractLocalImportSpecifiers(source)) {
      const resolvedPath = resolveLocalImport(normalizedFile, specifier, knownFiles);
      if (!resolvedPath) continue;

      const nextChain = [...chain, resolvedPath];
      if (pathMatchesAnyGlob(resolvedPath, input.excludedFiles)) {
        violations.push({ importer: normalizedFile, specifier, resolvedPath, chain: nextChain });
        continue;
      }

      if (depth < maxDepth) visit(resolvedPath, nextChain, depth + 1);
    }
  }

  for (const entryFile of input.entryFiles.map(normalizePath)) {
    visit(entryFile, [entryFile], 0);
  }

  return { violations };
}
