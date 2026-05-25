#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function usage() {
  console.error(`Usage: node scripts/arc-ingest-pr-concerns.mjs --review-id <arc-id> --repo <owner/repo> --pr <number> [--base-url <url>]

Fetches GitHub PR review comments/reviews with gh, normalizes them, and posts them to ARC's concerns endpoint.`);
}

function parseArgs(argv) {
  const options = { baseUrl: process.env.ARC_BASE_URL || 'http://localhost:3060' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--review-id') { options.reviewId = next; index += 1; continue; }
    if (arg === '--repo') { options.repo = next; index += 1; continue; }
    if (arg === '--pr') { options.pr = next; index += 1; continue; }
    if (arg === '--base-url') { options.baseUrl = next; index += 1; continue; }
    if (arg === '--help' || arg === '-h') { usage(); process.exit(0); }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.reviewId || !options.repo || !options.pr) throw new Error('Missing --review-id, --repo, or --pr.');
  return options;
}

function ghJson(path) {
  const result = spawnSync('gh', ['api', path], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `gh api failed for ${path}`);
  }
  return JSON.parse(result.stdout);
}

function concernFromComment(comment, source) {
  return {
    id: String(comment.id ?? comment.node_id ?? `${source}-${Math.random()}`),
    source,
    author: comment.user?.login,
    body: comment.body,
    path: comment.path,
    line: comment.line ?? comment.original_line,
    url: comment.html_url,
    state: comment.state,
    isBot: comment.user?.type === 'Bot',
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const [owner, name] = options.repo.split('/');
    if (!owner || !name) throw new Error('--repo must look like owner/repo.');

    const reviewComments = ghJson(`/repos/${owner}/${name}/pulls/${options.pr}/comments`);
    const issueComments = ghJson(`/repos/${owner}/${name}/issues/${options.pr}/comments`);
    const reviews = ghJson(`/repos/${owner}/${name}/pulls/${options.pr}/reviews`);

    const concerns = [
      ...reviewComments.map((comment) => concernFromComment(comment, comment.user?.type === 'Bot' ? 'bot_review' : 'human_review')),
      ...issueComments.map((comment) => concernFromComment(comment, comment.user?.type === 'Bot' ? 'bot_review' : 'human_review')),
      ...reviews
        .filter((review) => ['CHANGES_REQUESTED', 'COMMENTED'].includes(review.state))
        .map((review) => concernFromComment(review, review.user?.type === 'Bot' ? 'bot_review' : 'human_review')),
    ];

    const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/api/review/${options.reviewId}/concerns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ concerns }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `ARC returned ${response.status}`);

    console.log(`Ingested ${data.item.reviewerConcerns.openCount} open reviewer/bot concerns for ${options.repo}#${options.pr}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    usage();
    process.exit(1);
  }
}

main();
