import { validateContractData, type AgentReviewContract, type ContractValidationResult, type ContractValidationStatus, type InvalidContractField } from './schema.ts';

export type ContractParseErrorCode = 'JSON_BLOCK_NOT_FOUND' | 'INVALID_JSON';

export type ContractJsonExtractionResult =
  | {
      ok: true;
      rawJson: string;
      parsed: unknown;
    }
  | {
      ok: false;
      code: ContractParseErrorCode;
      message: string;
    };

export type ParsedContractResult =
  | {
      ok: true;
      contract: AgentReviewContract;
      rawInput: string;
      rawJson: string;
      rawData: unknown;
      validationStatus: ContractValidationStatus;
      isComplete: boolean;
      missingFields: ContractValidationResult['missingFields'];
      invalidFields: InvalidContractField[];
      unknownFields: string[];
    }
  | {
      ok: false;
      code: ContractParseErrorCode;
      message: string;
      rawInput: string;
      rawJson?: string;
    };

const FENCED_JSON_BLOCK = /```(?:json|contract-json|machine-readable-json)?\s*\n([\s\S]*?)\n```/gi;

function looksLikeJsonObject(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}');
}

export function extractContractJsonBlock(markdown: string): ContractJsonExtractionResult {
  const blocks = [...markdown.matchAll(FENCED_JSON_BLOCK)];
  const firstFencedBlock = blocks[0]?.[1]?.trim();
  const jsonBlock = blocks.find((match) => looksLikeJsonObject(match[1] ?? ''))?.[1]?.trim();
  const rawJson = jsonBlock ?? firstFencedBlock ?? (looksLikeJsonObject(markdown) ? markdown.trim() : undefined);

  if (!rawJson) {
    return {
      ok: false,
      code: 'JSON_BLOCK_NOT_FOUND',
      message: 'No machine-readable JSON block was found. Add a fenced ```json block containing the contract object.',
    };
  }

  try {
    return {
      ok: true,
      rawJson,
      parsed: JSON.parse(rawJson),
    };
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown JSON parse error.';
    return {
      ok: false,
      code: 'INVALID_JSON',
      message: `Invalid contract JSON: ${details}`,
    };
  }
}

export function parseContractMarkdown(markdown: string): ParsedContractResult {
  const extraction = extractContractJsonBlock(markdown);

  if (!extraction.ok) {
    return {
      ...extraction,
      rawInput: markdown,
    };
  }

  const validation = validateContractData(extraction.parsed);

  return {
    ok: true,
    contract: validation.contract,
    rawInput: markdown,
    rawJson: extraction.rawJson,
    rawData: extraction.parsed,
    validationStatus: validation.validationStatus,
    isComplete: validation.isComplete,
    missingFields: validation.missingFields,
    invalidFields: validation.invalidFields,
    unknownFields: validation.unknownFields,
  };
}
