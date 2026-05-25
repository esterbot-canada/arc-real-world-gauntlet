import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const GIT_COMMAND_TIMEOUT_MS = 5000;

export type GitChangeKind = 'modified' | 'deleted' | 'untracked' | 'added' | 'renamed' | 'copied' | 'unknown';

export type GitChange = {
  path: string;
  indexStatus: string;
  workingTreeStatus: string;
  kind: GitChangeKind;
};

export type GitReadinessState =
  | 'clean_repo'
  | 'review_ready'
  | 'blocked_dirty_repo'
  | 'partial_match'
  | 'no_matching_diff'
  | 'unknown';

export type GitRepositorySnapshot = {
  branch?: string;
  repoRoot?: string;
  headSha?: string;
  changes: GitChange[];
};

export type GitRepositorySnapshotError = { error: string };

export type GitReadinessSnapshot = {
  state: GitReadinessState;
  summary: string;
  branch?: string;
  repoRoot?: string;
  headSha?: string;
  isDirty: boolean;
  changes: GitChange[];
  contractFiles: string[];
  matchingFiles: string[];
  unrelatedDirtyFiles: string[];
  missingContractFiles: string[];
  guidance: string[];
  inspectedAt: string;
  error?: string;
};

type EvaluateGitReadinessInput = GitRepositorySnapshot & {
  contractFiles: string[];
};

function normalizeGitPath(path: string): string {
  let normalized = path.replaceAll('\\', '/');
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  return normalized;
}

function classifyStatus(indexStatus: string, workingTreeStatus: string): GitChangeKind {
  const status = `${indexStatus}${workingTreeStatus}`;
  if (status === '??') return 'untracked';
  if (status.includes('R')) return 'renamed';
  if (status.includes('C')) return 'copied';
  if (status.includes('D')) return 'deleted';
  if (status.includes('A')) return 'added';
  if (status.includes('M')) return 'modified';
  return 'unknown';
}

export function parsePorcelainStatus(raw: string): GitChange[] {
  const entries = raw.split('\0').filter((entry) => entry.length > 0);
  const changes: GitChange[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const indexStatus = entry.slice(0, 1);
    const workingTreeStatus = entry.slice(1, 2);
    const path = normalizeGitPath(entry.slice(3));
    const kind = classifyStatus(indexStatus, workingTreeStatus);

    if ((kind === 'renamed' || kind === 'copied') && index + 1 < entries.length) {
      index += 1;
    }

    changes.push({ path, indexStatus, workingTreeStatus, kind });
  }

  return changes;
}

function unknownGitReadiness(contractFiles: string[], error: string): GitReadinessSnapshot {
  return {
    state: 'unknown',
    summary: 'Unable to inspect git state.',
    changes: [],
    contractFiles: contractFiles.map(normalizeGitPath).filter((path) => path.length > 0),
    matchingFiles: [],
    unrelatedDirtyFiles: [],
    missingContractFiles: [],
    isDirty: false,
    guidance: ['Unable to inspect git state automatically; run git status manually before review.'],
    inspectedAt: new Date().toISOString(),
    error,
  };
}

export function evaluateGitReadinessForSnapshot(
  snapshot: GitRepositorySnapshot | GitRepositorySnapshotError,
  contractFiles: string[],
): GitReadinessSnapshot {
  if ('error' in snapshot) {
    return unknownGitReadiness(contractFiles, snapshot.error);
  }

  return evaluateGitReadiness({
    ...snapshot,
    contractFiles,
  });
}

export function evaluateGitReadiness(input: EvaluateGitReadinessInput): GitReadinessSnapshot {
  const contractFiles = input.contractFiles.map(normalizeGitPath).filter((path) => path.length > 0);
  const changes = input.changes.map((change) => ({
    ...change,
    path: normalizeGitPath(change.path),
  }));

  const contractFileSet = new Set(contractFiles);
  const dirtyFileSet = new Set(changes.map((change) => change.path));
  const matchingFiles = changes.filter((change) => contractFileSet.has(change.path)).map((change) => change.path);
  const unrelatedDirtyFiles = changes.filter((change) => !contractFileSet.has(change.path)).map((change) => change.path);
  const missingContractFiles = contractFiles.filter((path) => !dirtyFileSet.has(path));

  let state: GitReadinessState;
  let summary: string;
  let guidance: string[];

  if (changes.length === 0 && contractFiles.length === 0) {
    state = 'clean_repo';
    summary = 'Repository is clean.';
    guidance = ['No git changes or contract files were found.'];
  } else if (matchingFiles.length === 0) {
    state = 'no_matching_diff';
    summary = 'No git changes match this contract.';
    guidance = ['No dirty files match the contract; confirm the contract is current before review.'];
  } else if (unrelatedDirtyFiles.length > 0) {
    state = 'blocked_dirty_repo';
    summary = 'Unrelated dirty files block review.';
    guidance = ['Clean, stash, or commit unrelated dirty files before review.'];
  } else if (missingContractFiles.length > 0) {
    state = 'partial_match';
    summary = 'Git changes partially match this contract.';
    guidance = ['Some contract files are not present in the dirty diff; update the contract or inspect git status.'];
  } else {
    state = 'review_ready';
    summary = 'Git changes match this contract.';
    guidance = ['All dirty files match the contract and the repository is ready for review.'];
  }

  return {
    state,
    summary,
    branch: input.branch,
    repoRoot: input.repoRoot,
    headSha: input.headSha,
    isDirty: changes.length > 0,
    changes,
    contractFiles,
    matchingFiles,
    unrelatedDirtyFiles,
    missingContractFiles,
    guidance,
    inspectedAt: new Date().toISOString(),
  };
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf8', timeout: GIT_COMMAND_TIMEOUT_MS });
  return stdout.trimEnd();
}

export async function loadGitRepositorySnapshot(
  cwd = process.cwd(),
): Promise<GitRepositorySnapshot | GitRepositorySnapshotError> {
  try {
    const [rawStatus, branch, repoRoot, headSha] = await Promise.all([
      git(cwd, ['status', '--porcelain=v1', '-z']),
      git(cwd, ['branch', '--show-current']),
      git(cwd, ['rev-parse', '--show-toplevel']),
      git(cwd, ['rev-parse', '--short=12', 'HEAD']),
    ]);

    return {
      changes: parsePorcelainStatus(rawStatus),
      branch,
      repoRoot,
      headSha,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function loadGitReadiness(
  contractFiles: string[],
  cwd = process.cwd(),
): Promise<GitReadinessSnapshot> {
  return evaluateGitReadinessForSnapshot(await loadGitRepositorySnapshot(cwd), contractFiles);
}
