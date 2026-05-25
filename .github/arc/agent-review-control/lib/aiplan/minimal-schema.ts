export type MinimalAiplanV1 = {
  version: '1';
  kind: 'aiplan';
  status: 'frozen';
  allowed_scope: { files: string[] };
  excluded_scope: { files: string[] };
  expected_evidence: { required_commands: string[] };
  freeze: {
    created_by: string;
    frozen_at: string;
    contract_hash: string;
  };
};

export type MinimalAiplanValidationError = {
  field: string;
  reason: string;
};

export type MinimalAiplanValidationResult =
  | { ok: true; plan: MinimalAiplanV1; errors: [] }
  | { ok: false; errors: MinimalAiplanValidationError[] };

const TOP_LEVEL_FIELDS = new Set(['version', 'kind', 'status', 'allowed_scope', 'excluded_scope', 'expected_evidence', 'freeze']);
const ALLOWED_SCOPE_FIELDS = new Set(['files']);
const EXCLUDED_SCOPE_FIELDS = new Set(['files']);
const EXPECTED_EVIDENCE_FIELDS = new Set(['required_commands']);
const FREEZE_FIELDS = new Set(['created_by', 'frozen_at', 'contract_hash']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringArray(value: unknown, options: { requireNonEmpty: boolean }): value is string[] {
  if (!Array.isArray(value)) return false;
  if (options.requireNonEmpty && value.length === 0) return false;
  return value.every(nonEmptyString);
}

function normalizedStringArray(value: string[]): string[] {
  return value.map((item) => item.trim());
}

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

function pushUnknownNestedFieldErrors(
  input: Record<string, unknown>,
  allowedFields: Set<string>,
  prefix: string,
  errors: MinimalAiplanValidationError[],
): void {
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) {
      errors.push({ field: `${prefix}.${field}`, reason: 'Unknown field in minimal V1 verifier contract.' });
    }
  }
}

function unsafeGlobReason(glob: string, options: { allowGlobalWildcard: boolean }): string | null {
  const value = glob.trim();
  if (value.length === 0) return 'Expected non-empty glob.';
  if (value.includes('\\')) return 'Use POSIX-style / path separators.';
  if (value.startsWith('/')) return 'Absolute paths are not allowed.';
  if (value.split('/').includes('..')) return 'Path traversal segments are not allowed.';
  if (value.includes('//')) return 'Empty path segments are not allowed.';
  if (!options.allowGlobalWildcard && (value === '*' || value === '**' || value === '**/*')) {
    return 'Allowed scope glob is too broad for a frozen verifier contract.';
  }
  return null;
}

function validateGlobArray(
  field: string,
  values: string[] | undefined,
  options: { allowGlobalWildcard: boolean },
  errors: MinimalAiplanValidationError[],
): string[] {
  const normalized = normalizedStringArray(values ?? []);
  if (hasDuplicates(normalized)) errors.push({ field, reason: 'Duplicate globs are not allowed.' });

  normalized.forEach((glob, index) => {
    const reason = unsafeGlobReason(glob, options);
    if (reason) errors.push({ field: `${field}[${index}]`, reason });
  });

  return normalized;
}

function validateCommandArray(field: string, values: string[] | undefined, errors: MinimalAiplanValidationError[]): string[] {
  const normalized = normalizedStringArray(values ?? []);
  if (hasDuplicates(normalized)) errors.push({ field, reason: 'Duplicate required commands are not allowed.' });
  return normalized;
}

function getRecord(root: Record<string, unknown>, field: string): Record<string, unknown> | null {
  const value = root[field];
  return isRecord(value) ? value : null;
}

function pushUnknownFieldErrors(input: Record<string, unknown>, errors: MinimalAiplanValidationError[]): void {
  for (const field of Object.keys(input)) {
    if (!TOP_LEVEL_FIELDS.has(field)) {
      errors.push({ field, reason: 'Unknown top-level field in minimal V1 verifier contract.' });
    }
  }
}

export function validateMinimalAiplan(input: unknown): MinimalAiplanValidationResult {
  const errors: MinimalAiplanValidationError[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: [{ field: '$root', reason: 'Expected object.' }] };
  }

  pushUnknownFieldErrors(input, errors);

  if (input.version !== '1') errors.push({ field: 'version', reason: 'Expected "1".' });
  if (input.kind !== 'aiplan') errors.push({ field: 'kind', reason: 'Expected "aiplan".' });
  if (input.status !== 'frozen') errors.push({ field: 'status', reason: 'Expected frozen.' });

  const allowedScope = getRecord(input, 'allowed_scope');
  const excludedScope = getRecord(input, 'excluded_scope');
  const expectedEvidence = getRecord(input, 'expected_evidence');
  const freeze = getRecord(input, 'freeze');

  if (allowedScope) pushUnknownNestedFieldErrors(allowedScope, ALLOWED_SCOPE_FIELDS, 'allowed_scope', errors);
  if (excludedScope) pushUnknownNestedFieldErrors(excludedScope, EXCLUDED_SCOPE_FIELDS, 'excluded_scope', errors);
  if (expectedEvidence) pushUnknownNestedFieldErrors(expectedEvidence, EXPECTED_EVIDENCE_FIELDS, 'expected_evidence', errors);
  if (freeze) pushUnknownNestedFieldErrors(freeze, FREEZE_FIELDS, 'freeze', errors);

  if (!allowedScope || !stringArray(allowedScope.files, { requireNonEmpty: true })) {
    errors.push({ field: 'allowed_scope.files', reason: 'Expected non-empty array of file globs.' });
  }

  if (!excludedScope || !stringArray(excludedScope.files, { requireNonEmpty: false })) {
    errors.push({ field: 'excluded_scope.files', reason: 'Expected array of file globs.' });
  }

  if (!expectedEvidence || !stringArray(expectedEvidence.required_commands, { requireNonEmpty: false })) {
    errors.push({ field: 'expected_evidence.required_commands', reason: 'Expected array of command strings.' });
  }

  const allowedFiles = allowedScope && stringArray(allowedScope.files, { requireNonEmpty: true })
    ? validateGlobArray('allowed_scope.files', allowedScope.files, { allowGlobalWildcard: false }, errors)
    : [];
  const excludedFiles = excludedScope && stringArray(excludedScope.files, { requireNonEmpty: false })
    ? validateGlobArray('excluded_scope.files', excludedScope.files, { allowGlobalWildcard: true }, errors)
    : [];
  const requiredCommands = expectedEvidence && stringArray(expectedEvidence.required_commands, { requireNonEmpty: false })
    ? validateCommandArray('expected_evidence.required_commands', expectedEvidence.required_commands, errors)
    : [];

  if (!freeze) {
    errors.push({ field: 'freeze', reason: 'Expected freeze metadata.' });
  } else {
    if (!nonEmptyString(freeze.created_by)) errors.push({ field: 'freeze.created_by', reason: 'Expected non-empty string.' });
    if (!nonEmptyString(freeze.frozen_at)) errors.push({ field: 'freeze.frozen_at', reason: 'Expected non-empty string.' });
    if (!nonEmptyString(freeze.contract_hash)) errors.push({ field: 'freeze.contract_hash', reason: 'Expected non-empty string.' });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    plan: {
      version: '1',
      kind: 'aiplan',
      status: 'frozen',
      allowed_scope: { files: allowedFiles },
      excluded_scope: { files: excludedFiles },
      expected_evidence: { required_commands: requiredCommands },
      freeze: {
        created_by: freeze!.created_by as string,
        frozen_at: freeze!.frozen_at as string,
        contract_hash: freeze!.contract_hash as string,
      },
    },
  };
}
