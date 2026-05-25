#!/usr/bin/env node
const DEFAULT_BASE_URL = 'http://localhost:3060';
const DEFAULT_BASE_PATH_URL = 'http://localhost:3060/arc';

function usage() {
  return `ARC submit evidence

Usage:
  npm run submit:evidence -- --review-id <id> --summary <text> --test "npm test" --file apps/foo.ts --rollback-note <text>

Options:
  --review-id <id>        ARC review id to update (default: ARC_REVIEW_ID)
  --summary <text>        Completion summary
  --test <command/result> Test command/result; repeatable
  --file <path>           Changed file path; repeatable
  --rollback-note <text>  Rollback note
  --open-question <text>  Open question; repeatable
  --test-output <text>    Optional test output snippet
  --url <base-url>        ARC base URL (default: ARC_URL or ${DEFAULT_BASE_URL}; retries ${DEFAULT_BASE_PATH_URL} on local 404)
  --help                  Show this help
`;
}

function fail(message, details, code = 1) {
  console.error(`ARC evidence submit failed: ${message}`);
  if (details) console.error(details);
  process.exit(code);
}

function parseArgs(argv) {
  const options = {
    reviewId: process.env.ARC_REVIEW_ID || null,
    summary: null,
    testsRun: [],
    filesChanged: [],
    rollbackNote: null,
    openQuestions: [],
    testOutput: null,
    url: process.env.ARC_URL || DEFAULT_BASE_URL,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length || argv[index].startsWith('--')) fail(`${arg} requires a value.`, usage());
      return argv[index];
    };

    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--review-id') options.reviewId = next();
    else if (arg === '--summary') options.summary = next();
    else if (arg === '--test') options.testsRun.push(next());
    else if (arg === '--file') options.filesChanged.push(next());
    else if (arg === '--rollback-note') options.rollbackNote = next();
    else if (arg === '--open-question') options.openQuestions.push(next());
    else if (arg === '--test-output') options.testOutput = next();
    else if (arg === '--url') options.url = next();
    else fail(`Unknown option: ${arg}`, usage());
  }

  return options;
}

function endpoint(baseUrl, reviewId) {
  return `${baseUrl.replace(/\/$/, '')}/api/review/${encodeURIComponent(reviewId)}/evidence`;
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return '';
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

async function postEvidence(url, reviewId, payload) {
  return fetch(endpoint(url, reviewId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  if (!options.reviewId?.trim()) fail('Missing --review-id or ARC_REVIEW_ID.', usage());
  if (!options.summary?.trim()) fail('Missing --summary.', usage());

  const payload = {
    summary: options.summary,
    filesChanged: options.filesChanged,
    testsRun: options.testsRun,
    rollbackNote: options.rollbackNote ?? undefined,
    openQuestions: options.openQuestions,
    testOutput: options.testOutput ?? undefined,
  };

  let response;
  let usedUrl = options.url;
  try {
    response = await postEvidence(usedUrl, options.reviewId, payload);
    if (!process.env.ARC_URL && usedUrl === DEFAULT_BASE_URL && response.status === 404) {
      usedUrl = DEFAULT_BASE_PATH_URL;
      response = await postEvidence(usedUrl, options.reviewId, payload);
    }
  } catch (error) {
    fail('Could not reach ARC evidence endpoint.', `${error instanceof Error ? error.message : String(error)}\nEndpoint: ${endpoint(usedUrl, options.reviewId)}`);
  }

  const responseBody = await readResponseBody(response);
  if (!response.ok) fail(`ARC returned HTTP ${response.status}.`, responseBody);

  let data;
  try {
    data = responseBody ? JSON.parse(responseBody) : {};
  } catch {
    fail('ARC returned a non-JSON success response.', responseBody);
  }

  console.log('ARC evidence submitted');
  console.log(`id: ${data.item?.id ?? options.reviewId}`);
  console.log(`summary: ${data.item?.completionEvidence?.summary ?? options.summary}`);
  console.log(`tests: ${data.item?.completionEvidence?.testsRun?.length ?? options.testsRun.length}`);
  console.log(`files: ${data.item?.completionEvidence?.filesChanged?.length ?? options.filesChanged.length}`);
  console.log(`endpoint: ${endpoint(usedUrl, options.reviewId)}`);
}

main();
