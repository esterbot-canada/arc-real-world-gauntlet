#!/usr/bin/env node
const DEFAULT_BASE_URL = 'http://localhost:3060';
const DEFAULT_BASE_PATH_URL = 'http://localhost:3060/arc';

function usage() {
  return `ARC gate check

Usage:
  npm run gate:check -- --review-id <id>

Options:
  --review-id <id>              ARC review id to check (default: ARC_REVIEW_ID)
  --url <base-url>              ARC base URL (default: ARC_URL or ${DEFAULT_BASE_URL}; retries ${DEFAULT_BASE_PATH_URL} on local 404)
  --allow-missing-server        Exit 0 if ARC server is unreachable (default: false)
  --help                        Show this help
`;
}

function fail(message, details, code = 1) {
  console.error(message);
  if (details) console.error(details);
  process.exit(code);
}

function parseArgs(argv) {
  const options = {
    reviewId: process.env.ARC_REVIEW_ID || null,
    url: process.env.ARC_URL || DEFAULT_BASE_URL,
    allowMissingServer: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length || argv[index].startsWith('--')) fail(`ARC gate check failed: ${arg} requires a value.`, usage());
      return argv[index];
    };

    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--review-id') options.reviewId = next();
    else if (arg === '--url') options.url = next();
    else if (arg === '--allow-missing-server') options.allowMissingServer = true;
    else fail(`ARC gate check failed: Unknown option: ${arg}`, usage());
  }

  return options;
}

function endpoint(baseUrl) {
  return `${baseUrl.replace(/\/$/, '')}/api/gate/check`;
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

async function postGateCheck(url, reviewId) {
  return fetch(endpoint(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewId }),
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  if (!options.reviewId?.trim()) fail('ARC gate check failed: Missing --review-id or ARC_REVIEW_ID.', usage());

  let response;
  let usedUrl = options.url;
  try {
    response = await postGateCheck(usedUrl, options.reviewId);
    if (!process.env.ARC_URL && usedUrl === DEFAULT_BASE_URL && response.status === 404) {
      usedUrl = DEFAULT_BASE_PATH_URL;
      response = await postGateCheck(usedUrl, options.reviewId);
    }
  } catch (error) {
    const details = `${error instanceof Error ? error.message : String(error)}\nEndpoint: ${endpoint(usedUrl)}`;
    if (options.allowMissingServer) {
      console.warn('ARC gate skipped: ARC server is unreachable and --allow-missing-server is set.');
      console.warn(details);
      return;
    }
    fail('ARC gate check failed: could not reach ARC server.', details, 2);
  }

  const responseBody = await readResponseBody(response);
  if (!response.ok) fail(`ARC gate check failed: ARC returned HTTP ${response.status}.`, responseBody, 2);

  let data;
  try {
    data = responseBody ? JSON.parse(responseBody) : {};
  } catch {
    fail('ARC gate check failed: ARC returned a non-JSON success response.', responseBody, 2);
  }

  if (data.allowed) {
    console.log('ARC gate passed');
    console.log(data.summary ?? 'Push is allowed.');
    process.exit(0);
  }

  console.error('ARC gate blocked push');
  console.error(data.summary ?? 'Push is not allowed.');
  for (const blocker of data.blockers ?? []) console.error(`- ${blocker}`);
  for (const warning of data.warnings ?? []) console.error(`warning: ${warning}`);
  process.exit(1);
}

main();
