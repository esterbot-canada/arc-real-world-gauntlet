#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseContractMarkdown } from '../lib/contracts/parser.ts';

function usage() {
  return `ARC contract validator

Usage:
  npm run validate:contract -- <contract.md>
  npm run validate:contract -- --file <contract.md>
  cat contract.md | npm run validate:contract -- --stdin

Options:
  --file <path>    Read contract markdown from file
  --stdin          Read contract markdown from stdin
  --help           Show this help
`;
}

function fail(message, details) {
  console.error(`ARC contract validation failed: ${message}`);
  if (details) console.error(details);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { file: null, stdin: false, help: false };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length || argv[index].startsWith('--')) fail(`${arg} requires a value.`, usage());
      return argv[index];
    };

    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--stdin') options.stdin = true;
    else if (arg === '--file' || arg === '-f') options.file = next();
    else if (arg.startsWith('--')) fail(`Unknown option: ${arg}`, usage());
    else positional.push(arg);
  }

  if (positional.length > 1) fail('Provide only one contract file path.', usage());
  if (!options.file && positional.length > 0) options.file = positional[0];
  return options;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function loadInput(options) {
  if (options.stdin && options.file) fail('Choose either --stdin or --file, not both.', usage());
  if (options.stdin) return readStdin();
  if (options.file) return readFile(options.file, 'utf8');
  fail('No contract input provided.', usage());
}

function hasCommandEvidence(testEntry) {
  const value = testEntry.trim().toLowerCase();
  if (!value) return false;
  if (value.includes('not run') || value.includes('no tests')) return true;
  if (/\b(npm|pnpm|yarn|node|pytest|vitest|jest|cargo|go test|python|bash|sh|tsc|next)\b/.test(value)) return true;
  if (/[/>]/.test(testEntry)) return true;
  return false;
}

function collectWarnings(contract) {
  const warnings = [];
  const tests = contract.tests_run ?? [];
  for (const entry of tests) {
    if (typeof entry === 'string' && entry.trim() && !hasCommandEvidence(entry)) {
      warnings.push(`tests_run entry is vague; prefer exact command/evidence: ${JSON.stringify(entry)}`);
    }
  }

  const rollback = contract.rollback_note?.trim().toLowerCase() ?? '';
  if (rollback && ['n/a', 'none', 'todo', 'tbd'].includes(rollback)) {
    warnings.push('rollback_note is vague; state the actual rollback path or explicitly say it was not tested/provided.');
  }

  return warnings;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  let markdown;
  try {
    markdown = await loadInput(options);
  } catch (error) {
    fail(`Could not read contract input${options.file ? ` from ${options.file}` : ''}.`, error instanceof Error ? error.message : String(error));
  }

  if (!markdown.trim()) fail('Contract input is empty.');

  const result = parseContractMarkdown(markdown);
  if (!result.ok) fail(result.message);

  const details = [];
  if (result.missingFields.length > 0) details.push(`Missing required fields: ${result.missingFields.join(', ')}`);
  if (result.invalidFields.length > 0) {
    details.push('Invalid fields:');
    for (const field of result.invalidFields) details.push(`- ${field.field}: ${field.reason}`);
  }
  if (result.unknownFields.length > 0) details.push(`Unknown fields are not allowed in dogfood contracts: ${result.unknownFields.join(', ')}`);

  if (details.length > 0) fail(result.validationStatus, details.join('\n'));

  const warnings = collectWarnings(result.contract);
  console.log('ARC contract validation passed');
  console.log(`task_title: ${result.contract.task_title}`);
  console.log(`status: ${result.contract.status}`);
  console.log(`risk_level: ${result.contract.risk_level}`);
  if (warnings.length > 0) {
    console.log('warnings:');
    for (const warning of warnings) console.log(`- ${warning}`);
  }
}

main();
