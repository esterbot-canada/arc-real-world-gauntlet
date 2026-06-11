import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const GIT_DIFF_TIMEOUT_MS = 5000;

function normalizePath(path: string): string {
  let normalized = path.replaceAll('\\', '/').trim();
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  return normalized;
}

export function parseNameOnlyDiff(raw: string): string[] {
  return [...new Set(raw.split('\n').map(normalizePath).filter(Boolean))];
}

export type ChangedFileComparison = {
  matchingFiles: string[];
  unrelatedFiles: string[];
  missingContractFiles: string[];
};

export function compareChangedFilesToContract(input: { changedFiles: string[]; contractFiles: string[] }): ChangedFileComparison {
  const changedFiles = input.changedFiles.map(normalizePath).filter(Boolean);
  const contractFiles = input.contractFiles.map(normalizePath).filter(Boolean);
  const changedSet = new Set(changedFiles);
  const contractSet = new Set(contractFiles);

  return {
    matchingFiles: changedFiles.filter((file) => contractSet.has(file)),
    unrelatedFiles: changedFiles.filter((file) => !contractSet.has(file)),
    missingContractFiles: contractFiles.filter((file) => !changedSet.has(file)),
  };
}

export async function loadChangedFilesForRange(cwd: string, range: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['diff', '--name-only', range], {
    cwd,
    encoding: 'utf8',
    timeout: GIT_DIFF_TIMEOUT_MS,
  });
  return parseNameOnlyDiff(stdout);
}
