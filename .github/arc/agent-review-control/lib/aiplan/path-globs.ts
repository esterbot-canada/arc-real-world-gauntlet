function normalizePath(path: string): string {
  let normalized = path.replaceAll('\\', '/').trim();
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  while (normalized.startsWith('/')) normalized = normalized.slice(1);
  return normalized;
}

function escapeRegexChar(char: string): string {
  return /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

export function globToRegex(glob: string): RegExp {
  const normalized = normalizePath(glob);
  let pattern = '';

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '*' && next === '*') {
      pattern += '.*';
      index += 1;
      continue;
    }

    if (char === '*') {
      pattern += '[^/]*';
      continue;
    }

    pattern += escapeRegexChar(char);
  }

  return new RegExp(`^${pattern}$`);
}

export function pathMatchesGlob(path: string, glob: string): boolean {
  return globToRegex(glob).test(normalizePath(path));
}

export function pathMatchesAnyGlob(path: string, globs: string[]): boolean {
  return globs.some((glob) => pathMatchesGlob(path, glob));
}
