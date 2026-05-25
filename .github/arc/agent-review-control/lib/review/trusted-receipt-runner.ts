import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';

import type { MinimalAiplanV1 } from '../aiplan/minimal-schema.ts';
import type { CommandReceipt } from './command-receipts.ts';

export type TrustedReceiptRunResult = {
  receipts: CommandReceipt[];
  logs: Array<{ path: string; text: string }>;
};

export type RunTrustedReceiptsOptions = {
  plan: MinimalAiplanV1;
  logDir: string;
  cwd?: string;
  runCommand?: (command: string, index: number) => Promise<{ exitCode: number; output: string }>;
};

function slugCommand(command: string, index: number): string {
  const slug = command
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'command';
  return `${String(index + 1).padStart(2, '0')}-${slug}.log`;
}

function assertSafeRelativeDir(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/, '').trim();
  if (normalized.length === 0) throw new Error('logDir must be non-empty');
  if (normalized.startsWith('/')) throw new Error('logDir must be relative so receipts stay portable');
  if (normalized.includes('//')) throw new Error('logDir must not contain empty path segments');
  if (normalized.split('/').includes('..')) throw new Error('logDir must not contain path traversal segments');
  return normalized;
}

function defaultRunCommand(cwd?: string): (command: string) => Promise<{ exitCode: number; output: string }> {
  return (command: string) => new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, env: process.env });
    const chunks: Buffer[] = [];
    const collect = (chunk: Buffer) => chunks.push(chunk);
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => {
      resolve({ exitCode: 127, output: `${error.name}: ${error.message}\n` });
    });
    child.on('close', (code, signal) => {
      const output = Buffer.concat(chunks).toString('utf8');
      const signalText = signal ? `\n[arc] command terminated by signal ${signal}\n` : '';
      resolve({ exitCode: code ?? 1, output: `${output}${signalText}` });
    });
  });
}

export async function runTrustedReceipts(options: RunTrustedReceiptsOptions): Promise<TrustedReceiptRunResult> {
  const runner = options.runCommand ?? defaultRunCommand(options.cwd);
  const logDir = assertSafeRelativeDir(options.logDir);
  const receipts: CommandReceipt[] = [];
  const logs: Array<{ path: string; text: string }> = [];

  for (const [index, command] of options.plan.expected_evidence.required_commands.entries()) {
    const logPath = `${logDir}/${slugCommand(command, index)}`;
    const result = await runner(command, index);
    const text = `$ ${command}\n${result.output}`;
    logs.push({ path: logPath, text });
    receipts.push({ command, exitCode: result.exitCode, provenance: 'trusted_ci', logPath });
  }

  return { receipts, logs };
}

export async function writeTrustedReceiptRun(output: TrustedReceiptRunResult, receiptsPath: string): Promise<void> {
  await mkdir(dirname(receiptsPath), { recursive: true });
  await Promise.all(output.logs.map(async (log) => {
    await mkdir(dirname(log.path), { recursive: true });
    await writeFile(log.path, log.text, 'utf8');
  }));
  await writeFile(receiptsPath, `${JSON.stringify(output.receipts, null, 2)}\n`, 'utf8');
}
