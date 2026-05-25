export type CommandReceipt = {
  command: string;
  exitCode: number;
  logPath?: string;
  provenance?: 'trusted_ci' | 'agent_reported';
};

export type CommandReceiptCheckResult = {
  satisfiedCommands: string[];
  failedCommands: string[];
  missingCommands: string[];
};

export type CommandReceiptsParseResult =
  | { ok: true; receipts: CommandReceipt[]; errors: [] }
  | { ok: false; receipts: []; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeRelativeLogPath(value: string): boolean {
  const normalized = value.replaceAll('\\', '/').trim();
  if (normalized.length === 0) return false;
  if (normalized.startsWith('/')) return false;
  if (normalized.includes('//')) return false;
  if (normalized.split('/').includes('..')) return false;
  return true;
}

function isCommandReceipt(value: unknown): value is CommandReceipt {
  if (!isRecord(value)) return false;
  const allowedFields = new Set(['command', 'exitCode', 'logPath', 'provenance']);
  if (Object.keys(value).some((field) => !allowedFields.has(field))) return false;
  if (typeof value.command !== 'string' || value.command.trim().length === 0) return false;
  if (typeof value.exitCode !== 'number' || !Number.isInteger(value.exitCode)) return false;
  if (value.logPath !== undefined && (typeof value.logPath !== 'string' || !isSafeRelativeLogPath(value.logPath))) return false;
  if (value.provenance !== undefined && value.provenance !== 'trusted_ci' && value.provenance !== 'agent_reported') return false;
  return true;
}

export function parseCommandReceiptsText(raw: string): CommandReceiptsParseResult {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { ok: false, receipts: [], errors: ['Expected receipts JSON array.'] };

    const errors: string[] = [];
    parsed.forEach((item, index) => {
      if (!isCommandReceipt(item)) errors.push(`Invalid command receipt at index ${index}.`);
    });

    if (errors.length > 0) return { ok: false, receipts: [], errors };
    return {
      ok: true,
      receipts: parsed.map((receipt) => ({
        command: receipt.command.trim(),
        exitCode: receipt.exitCode,
        ...(receipt.logPath === undefined ? {} : { logPath: receipt.logPath.trim() }),
        ...(receipt.provenance === undefined ? {} : { provenance: receipt.provenance }),
      })),
      errors: [],
    };
  } catch (error) {
    return { ok: false, receipts: [], errors: [error instanceof Error ? error.message : String(error)] };
  }
}

export function checkRequiredCommandReceipts(input: { requiredCommands: string[]; receipts: CommandReceipt[] }): CommandReceiptCheckResult {
  const satisfiedCommands: string[] = [];
  const failedCommands: string[] = [];
  const missingCommands: string[] = [];

  for (const command of input.requiredCommands) {
    const normalizedCommand = command.trim();
    const receipts = input.receipts.filter((item) => item.command.trim() === normalizedCommand);
    if (receipts.length === 0) missingCommands.push(normalizedCommand);
    else if (receipts.some((receipt) => receipt.exitCode !== 0)) failedCommands.push(normalizedCommand);
    else satisfiedCommands.push(normalizedCommand);
  }

  return { satisfiedCommands, failedCommands, missingCommands };
}
