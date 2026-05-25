import { parse } from 'yaml';

import { validateMinimalAiplan, type MinimalAiplanV1, type MinimalAiplanValidationError } from './minimal-schema.ts';

export type MinimalAiplanParseResult =
  | { ok: true; plan: MinimalAiplanV1; raw: string; errors: [] }
  | { ok: false; errors: MinimalAiplanValidationError[]; raw: string };

export function parseMinimalAiplanText(raw: string): MinimalAiplanParseResult {
  try {
    const parsed = parse(raw);
    const validation = validateMinimalAiplan(parsed);

    if (!validation.ok) {
      return { ok: false, errors: validation.errors, raw };
    }

    return { ok: true, plan: validation.plan, raw, errors: [] };
  } catch (error) {
    return {
      ok: false,
      raw,
      errors: [{ field: '$root', reason: error instanceof Error ? error.message : String(error) }],
    };
  }
}
