import { readFileSync } from 'node:fs';

export type ArcDiffSourceTrust = 'provider_verified' | 'caller_provided';

export type ArcDiffSource = {
  range: string;
  trust: ArcDiffSourceTrust;
  description: string;
  baseRef?: string;
  headRef?: string;
};

export type ResolveDiffSourceInput = {
  base?: string | null;
  head?: string | null;
  range?: string | null;
  allowManualRange?: boolean;
  env?: NodeJS.ProcessEnv;
};

function nonEmpty(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function looksLikeRef(value: string): boolean {
  if (value.startsWith('-')) return false;
  if (value.includes('..')) return false;
  if (/\s/.test(value)) return false;
  return /^[A-Za-z0-9_./:@{}~^+-]+$/.test(value);
}

function looksLikeFullSha(value: string): boolean {
  return /^[a-fA-F0-9]{40}$/.test(value.trim());
}

function safeRef(value: string, field: string): string {
  const trimmed = value.trim();
  if (!looksLikeRef(trimmed)) throw new Error(`Invalid ${field}; expected a safe git ref or SHA.`);
  return trimmed;
}

function readGithubPullRequestShas(eventPath: string): { base: string; head: string } | null {
  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf8')) as {
      pull_request?: { base?: { sha?: unknown }; head?: { sha?: unknown } };
    };
    const base = event.pull_request?.base?.sha;
    const head = event.pull_request?.head?.sha;
    if (typeof base === 'string' && typeof head === 'string' && base.trim() && head.trim()) {
      return { base, head };
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveDiffSource(input: ResolveDiffSourceInput): ArcDiffSource {
  const env = input.env ?? process.env;

  if (nonEmpty(env.GITHUB_EVENT_PATH)) {
    const shas = readGithubPullRequestShas(env.GITHUB_EVENT_PATH);
    if (shas) {
      const base = safeRef(shas.base, 'GitHub pull_request.base.sha');
      const head = safeRef(shas.head, 'GitHub pull_request.head.sha');
      if (!looksLikeFullSha(base) || !looksLikeFullSha(head)) {
        throw new Error('GitHub pull_request base/head must be immutable full commit SHAs.');
      }
      return { range: `${base}...${head}`, trust: 'provider_verified', description: `GitHub pull_request base/head: ${base}...${head}`, baseRef: base, headRef: head };
    }
  }

  if (nonEmpty(input.base) || nonEmpty(input.head)) {
    if (!nonEmpty(input.base) || !nonEmpty(input.head)) throw new Error('Both --base and --head are required when either is provided.');
    const base = safeRef(input.base, '--base');
    const head = safeRef(input.head, '--head');
    return { range: `${base}...${head}`, trust: 'caller_provided', description: `caller-provided base/head: ${base}...${head}`, baseRef: base, headRef: head };
  }

  if (nonEmpty(input.range)) {
    if (!input.allowManualRange) {
      throw new Error('Manual --range is caller-provided evidence. Use --base/--head from CI/provider data, or pass --allow-manual-range for local demos.');
    }
    const range = input.range.trim();
    if (range.startsWith('-') || /\s/.test(range)) throw new Error('Invalid --range; expected a safe git diff range.');
    return { range, trust: 'caller_provided', description: `caller-provided manual range: ${range}` };
  }

  throw new Error('Missing diff source. Provide --base/--head, run in a GitHub pull_request event, or use --range with --allow-manual-range for local demos.');
}
