#!/usr/bin/env node
import { copyFile, chmod, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function usage() {
  return `ARC git hook installer

Usage:
  npm run hook:install

Installs a local .git/hooks/pre-push hook that runs ARC gate checks.
The hook requires ARC_REVIEW_ID=<review-id> at push time.
`;
}

function fail(message, details) {
  console.error(`ARC hook install failed: ${message}`);
  if (details) console.error(details);
  process.exit(1);
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

async function git(args) {
  const { stdout } = await execFileAsync('git', args, { encoding: 'utf8', timeout: 5000 });
  return stdout.trim();
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }

  let repoRoot;
  let gitDir;
  try {
    repoRoot = await git(['rev-parse', '--show-toplevel']);
    gitDir = await git(['rev-parse', '--git-dir']);
  } catch (error) {
    fail('Could not find git repository root.', error instanceof Error ? error.message : String(error));
  }

  const absoluteGitDir = gitDir.startsWith('/') ? gitDir : join(repoRoot, gitDir);
  const hookPath = join(absoluteGitDir, 'hooks', 'pre-push');
  await mkdir(dirname(hookPath), { recursive: true });

  let backupPath = null;
  if (existsSync(hookPath)) {
    backupPath = `${hookPath}.arc-backup.${timestamp()}`;
    await copyFile(hookPath, backupPath);
  }

  const appDir = relative(repoRoot, process.cwd()).replaceAll('\\', '/') || 'apps/agent-review-control';
  const hook = `#!/bin/sh
if [ -z "$ARC_REVIEW_ID" ]; then
  echo "ARC gate blocked push: ARC_REVIEW_ID is not set."
  echo "Set ARC_REVIEW_ID=<review-id> after Human Approved review, then push again."
  exit 1
fi
cd "${appDir}" || exit 1
npm run gate:check -- --review-id "$ARC_REVIEW_ID"
`;

  await writeFile(hookPath, hook, 'utf8');
  await chmod(hookPath, 0o755);

  console.log('ARC pre-push hook installed');
  console.log(`hook: ${hookPath}`);
  if (backupPath) console.log(`backup: ${backupPath}`);
  console.log('Set ARC_REVIEW_ID=<review-id> before pushing ARC-gated work.');
}

main();
