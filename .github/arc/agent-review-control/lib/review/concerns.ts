import type { ReviewerConcern, ReviewerConcernSeverity, ReviewerConcernSource, ReviewerConcernSummary } from './types.ts';

const HIGH_SIGNAL_KEYWORDS = [
  'security',
  'auth',
  'permission',
  'migration',
  'breaking',
  'regression',
  'rollback',
  'production',
  'data loss',
  'secret',
  'vulnerability',
];

const MEDIUM_SIGNAL_KEYWORDS = [
  'test',
  'edge case',
  'scope',
  'uncertain',
  'not sure',
  'assumption',
  'null',
  'undefined',
  'type',
  'performance',
  'dependency',
  'api',
];

const RESOLVED_STATES = new Set(['resolved', 'outdated', 'dismissed', 'closed', 'completed']);

export type RawReviewerConcernInput = {
  id?: unknown;
  source?: unknown;
  author?: unknown;
  body?: unknown;
  path?: unknown;
  line?: unknown;
  url?: unknown;
  state?: unknown;
  resolved?: unknown;
  isBot?: unknown;
};

function normalizeText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeLine(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function includesAny(text: string, keywords: string[]): string[] {
  const haystack = text.toLowerCase();
  return keywords.filter((keyword) => haystack.includes(keyword));
}

function sourceFor(input: RawReviewerConcernInput): ReviewerConcernSource {
  const source = normalizeText(input.source)?.toLowerCase();
  if (source === 'human_review' || source === 'bot_review' || source === 'check_annotation') return source;
  if (input.isBot === true) return 'bot_review';
  return 'human_review';
}

function isOpen(input: RawReviewerConcernInput): boolean {
  if (input.resolved === true) return false;
  const state = normalizeText(input.state)?.toLowerCase();
  return !state || !RESOLVED_STATES.has(state);
}

export function classifyConcernSeverity(body: string, source: ReviewerConcernSource): { severity: ReviewerConcernSeverity; keywords: string[] } {
  const highKeywords = includesAny(body, HIGH_SIGNAL_KEYWORDS);
  if (highKeywords.length > 0) return { severity: 'high', keywords: highKeywords };

  const mediumKeywords = includesAny(body, MEDIUM_SIGNAL_KEYWORDS);
  if (mediumKeywords.length > 0) return { severity: 'medium', keywords: mediumKeywords };

  return { severity: source === 'check_annotation' ? 'medium' : 'low', keywords: [] };
}

function concernSortWeight(concern: ReviewerConcern): number {
  const severityWeight: Record<ReviewerConcernSeverity, number> = { high: 3, medium: 2, low: 1 };
  const sourceWeight: Record<ReviewerConcernSource, number> = { human_review: 3, check_annotation: 2, bot_review: 1, unknown: 0 };
  return severityWeight[concern.severity] * 10 + sourceWeight[concern.source];
}

export function summarizeReviewerConcerns(rawConcerns: RawReviewerConcernInput[]): ReviewerConcernSummary {
  const topConcerns = rawConcerns
    .filter(isOpen)
    .map((input, index): ReviewerConcern | null => {
      const body = normalizeText(input.body);
      if (!body) return null;

      const source = sourceFor(input);
      const { severity, keywords } = classifyConcernSeverity(body, source);
      return {
        id: normalizeText(input.id) ?? `concern-${index + 1}`,
        source,
        author: normalizeText(input.author),
        body,
        path: normalizeText(input.path),
        line: normalizeLine(input.line),
        url: normalizeText(input.url),
        state: normalizeText(input.state),
        severity,
        keywords,
      };
    })
    .filter((concern): concern is ReviewerConcern => Boolean(concern))
    .sort((left, right) => concernSortWeight(right) - concernSortWeight(left))
    .slice(0, 6);

  return {
    ingestedAt: new Date().toISOString(),
    openCount: topConcerns.length,
    humanCount: topConcerns.filter((concern) => concern.source === 'human_review').length,
    botCount: topConcerns.filter((concern) => concern.source === 'bot_review').length,
    checkCount: topConcerns.filter((concern) => concern.source === 'check_annotation').length,
    topConcerns,
  };
}

export function emptyReviewerConcernSummary(): ReviewerConcernSummary {
  return {
    openCount: 0,
    humanCount: 0,
    botCount: 0,
    checkCount: 0,
    topConcerns: [],
  };
}
