export const CONTRACT_REQUIRED_FIELDS = [
  'task_title',
  'status',
  'summary',
  'files_touched',
  'systems_touched',
  'tests_run',
  'risk_level',
  'open_questions',
  'rollback_note',
] as const;

export const CONTRACT_OPTIONAL_FIELDS = [
  'contract_type',
  'assumptions',
  'breaking_change_risk',
  'migration_changes',
  'config_changes',
  'external_effects',
  'next_steps',
  'agent',
] as const;

export const REVIEW_CONTRACT_STATUS = [
  'DONE',
  'DONE_WITH_CONCERNS',
  'BLOCKED',
  'NEEDS_CONTEXT',
] as const;

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

export const CONTRACT_TYPES = ['planning', 'implementation', 'deployment', 'qa_review', 'ops_fix', 'sample'] as const;

export const CONTRACT_VALIDATION_STATUS = [
  'Complete',
  'Incomplete / Needs Attention',
] as const;

export type ContractRequiredField = (typeof CONTRACT_REQUIRED_FIELDS)[number];
export type ContractOptionalField = (typeof CONTRACT_OPTIONAL_FIELDS)[number];
export type ReviewContractStatus = (typeof REVIEW_CONTRACT_STATUS)[number];
export type RiskLevel = (typeof RISK_LEVELS)[number];
export type ContractType = (typeof CONTRACT_TYPES)[number];
export type ContractValidationStatus = (typeof CONTRACT_VALIDATION_STATUS)[number];

export type AgentIdentity = Partial<{
  name: string;
  id: string;
  role: string;
  runtime: string;
  run_id: string;
  session_id: string;
}>;

export type AgentReviewContract = Partial<{
  task_title: string;
  status: ReviewContractStatus;
  summary: string;
  contract_type: ContractType;
  files_touched: string[];
  systems_touched: string[];
  tests_run: string[];
  risk_level: RiskLevel;
  open_questions: string[];
  assumptions: string[];
  rollback_note: string;
  breaking_change_risk: string;
  migration_changes: string;
  config_changes: string;
  external_effects: string;
  next_steps: string[];
  agent: AgentIdentity;
}>;

export type InvalidContractField = {
  field: string;
  reason: string;
};

export type ContractValidationResult = {
  isComplete: boolean;
  validationStatus: ContractValidationStatus;
  contract: AgentReviewContract;
  missingFields: ContractRequiredField[];
  invalidFields: InvalidContractField[];
  unknownFields: string[];
};

const ARRAY_FIELDS = new Set<string>([
  'files_touched',
  'systems_touched',
  'tests_run',
  'open_questions',
  'assumptions',
  'next_steps',
]);

const STRING_FIELDS = new Set<string>([
  'task_title',
  'status',
  'summary',
  'risk_level',
  'rollback_note',
  'breaking_change_risk',
  'migration_changes',
  'config_changes',
  'external_effects',
  'contract_type',
]);

const AGENT_FIELDS = new Set<string>(['name', 'id', 'role', 'runtime', 'run_id', 'session_id']);

const KNOWN_FIELDS = new Set<string>([
  ...CONTRACT_REQUIRED_FIELDS,
  ...CONTRACT_OPTIONAL_FIELDS,
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function missingRequiredField(data: Record<string, unknown>, field: ContractRequiredField): boolean {
  if (!(field in data)) return true;

  const value = data[field];
  if (STRING_FIELDS.has(field)) return !isNonEmptyString(value);
  if (ARRAY_FIELDS.has(field)) return !Array.isArray(value);

  return value === undefined || value === null;
}

function validateAgentField(value: unknown): InvalidContractField | null {
  if (!isPlainRecord(value)) {
    return { field: 'agent', reason: 'Expected an object with agent identity fields.' };
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return { field: 'agent', reason: 'Expected at least one agent identity field.' };
  }

  for (const [nestedField, nestedValue] of entries) {
    const field = `agent.${nestedField}`;
    if (!AGENT_FIELDS.has(nestedField)) {
      return { field, reason: 'Unknown agent identity field.' };
    }
    if (!isNonEmptyString(nestedValue)) {
      return { field, reason: 'Expected a non-empty string.' };
    }
  }

  return null;
}

function validateKnownField(field: string, value: unknown): InvalidContractField | null {
  if (field === 'agent') return validateAgentField(value);

  if (STRING_FIELDS.has(field) && !isNonEmptyString(value)) {
    return { field, reason: 'Expected a non-empty string.' };
  }

  if (ARRAY_FIELDS.has(field) && !isStringArray(value)) {
    return { field, reason: 'Expected an array of strings.' };
  }

  if (field === 'status' && typeof value === 'string' && !REVIEW_CONTRACT_STATUS.includes(value as ReviewContractStatus)) {
    return { field, reason: `Expected one of: ${REVIEW_CONTRACT_STATUS.join(', ')}.` };
  }

  if (field === 'risk_level' && typeof value === 'string' && !RISK_LEVELS.includes(value as RiskLevel)) {
    return { field, reason: `Expected one of: ${RISK_LEVELS.join(', ')}.` };
  }

  if (field === 'contract_type' && typeof value === 'string' && !CONTRACT_TYPES.includes(value as ContractType)) {
    return { field, reason: `Expected one of: ${CONTRACT_TYPES.join(', ')}.` };
  }

  return null;
}

export function validateContractData(input: unknown): ContractValidationResult {
  const invalidFields: InvalidContractField[] = [];

  if (!isPlainRecord(input)) {
    return {
      isComplete: false,
      validationStatus: 'Incomplete / Needs Attention',
      contract: {},
      missingFields: [...CONTRACT_REQUIRED_FIELDS],
      invalidFields: [{ field: '$root', reason: 'Expected a JSON object.' }],
      unknownFields: [],
    };
  }

  const data = input;
  const missingFields = CONTRACT_REQUIRED_FIELDS.filter((field) => missingRequiredField(data, field));
  const contract: AgentReviewContract = {};
  const unknownFields: string[] = [];

  for (const [field, value] of Object.entries(data)) {
    if (!KNOWN_FIELDS.has(field)) {
      unknownFields.push(field);
      continue;
    }

    const invalid = validateKnownField(field, value);
    if (invalid) {
      invalidFields.push(invalid);
      continue;
    }

    (contract as Record<string, unknown>)[field] = value;
  }

  const isComplete = missingFields.length === 0 && invalidFields.length === 0;

  return {
    isComplete,
    validationStatus: isComplete ? 'Complete' : 'Incomplete / Needs Attention',
    contract,
    missingFields,
    invalidFields,
    unknownFields,
  };
}
