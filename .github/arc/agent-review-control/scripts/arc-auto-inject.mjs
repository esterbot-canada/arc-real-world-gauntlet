#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const DEFAULT_INGEST_URL = 'http://localhost:3060/api/ingest/contracts';
const DEFAULT_BASE_PATH_INGEST_URL = 'http://localhost:3060/arc/api/ingest/contracts';

function usage() {
  return `ARC auto-inject

Usage:
  npm run inject -- <contract.md>
  npm run inject -- --file <contract.md>
  cat contract.md | npm run inject -- --stdin

Options:
  --file <path>       Read contract markdown from file
  --stdin             Read contract markdown from stdin
  --source <label>    Source label (default: ARC_SOURCE or "agent")
  --run-id <id>       Optional ingest run id fallback (default: ARC_RUN_ID)
  --agent-name <name> Optional contract agent.name (default: ARC_AGENT_NAME)
  --agent-id <id>     Optional contract agent.id (default: ARC_AGENT_ID)
  --agent-role <role> Optional contract agent.role (default: ARC_AGENT_ROLE)
  --agent-runtime <r> Optional contract agent.runtime (default: ARC_AGENT_RUNTIME)
  --agent-session-id <id> Optional contract agent.session_id (default: ARC_AGENT_SESSION_ID)
  --url <url>         Ingest endpoint (default: ARC_INGEST_URL or ${DEFAULT_INGEST_URL}; retries ${DEFAULT_BASE_PATH_INGEST_URL} on local 404)
  --help              Show this help

Required environment:
  ARC_INGEST_TOKEN    Bearer token configured on the ARC server
`;
}

function fail(message, details) {
  console.error(`ARC inject failed: ${message}`);
  if (details) console.error(details);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    file: null,
    stdin: false,
    source: process.env.ARC_SOURCE || 'agent',
    runId: process.env.ARC_RUN_ID || null,
    agentName: process.env.ARC_AGENT_NAME || null,
    agentId: process.env.ARC_AGENT_ID || null,
    agentRole: process.env.ARC_AGENT_ROLE || null,
    agentRuntime: process.env.ARC_AGENT_RUNTIME || null,
    agentSessionId: process.env.ARC_AGENT_SESSION_ID || null,
    url: process.env.ARC_INGEST_URL || DEFAULT_INGEST_URL,
    help: false,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length || argv[index].startsWith('--')) {
        fail(`${arg} requires a value.`, usage());
      }
      return argv[index];
    };

    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--stdin') options.stdin = true;
    else if (arg === '--file' || arg === '-f') options.file = next();
    else if (arg === '--source') options.source = next();
    else if (arg === '--run-id') options.runId = next();
    else if (arg === '--agent-name') options.agentName = next();
    else if (arg === '--agent-id') options.agentId = next();
    else if (arg === '--agent-role') options.agentRole = next();
    else if (arg === '--agent-runtime') options.agentRuntime = next();
    else if (arg === '--agent-session-id') options.agentSessionId = next();
    else if (arg === '--url') options.url = next();
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

async function loadRawInput(options) {
  if (options.stdin && options.file) {
    fail('Choose either --stdin or --file, not both.', usage());
  }

  if (options.stdin) return readStdin();
  if (options.file) return readFile(options.file, 'utf8');
  fail('No contract input provided.', usage());
}

function mergeAgentIntoContractMarkdown(markdown, agent) {
  const fencedJson = /```(?:json|contract-json|machine-readable-json)?\s*\n([\s\S]*?)\n```/i;
  const match = markdown.match(fencedJson);
  const rawJson = match?.[1]?.trim() ?? (markdown.trim().startsWith('{') && markdown.trim().endsWith('}') ? markdown.trim() : null);
  if (!rawJson) fail('Could not find a contract JSON object to merge agent identity into.');

  let contract;
  try {
    contract = JSON.parse(rawJson);
  } catch (error) {
    fail('Could not parse contract JSON while merging agent identity.', error instanceof Error ? error.message : String(error));
  }
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) fail('Contract JSON must be an object to merge agent identity.');

  contract.agent = { ...(contract.agent ?? {}), ...agent };
  const mergedJson = JSON.stringify(contract, null, 2);
  if (!match) return mergedJson;
  return markdown.slice(0, match.index) + match[0].replace(match[1], mergedJson) + markdown.slice((match.index ?? 0) + match[0].length);
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

async function inject() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const token = process.env.ARC_INGEST_TOKEN?.trim();
  if (!token) {
    fail('ARC_INGEST_TOKEN is required. Set it to the same token configured on the ARC server.');
  }

  let rawInput;
  try {
    rawInput = await loadRawInput(options);
  } catch (error) {
    fail(`Could not read contract input${options.file ? ` from ${options.file}` : ''}.`, error instanceof Error ? error.message : String(error));
  }

  if (!rawInput.trim()) fail('Contract input is empty.');

  const payload = {
    rawInput,
    source: options.source,
  };
  if (options.runId) payload.runId = options.runId;

  const agent = {};
  if (options.agentName) agent.name = options.agentName;
  if (options.agentId) agent.id = options.agentId;
  if (options.agentRole) agent.role = options.agentRole;
  if (options.agentRuntime) agent.runtime = options.agentRuntime;
  if (options.runId) agent.run_id = options.runId;
  if (options.agentSessionId) agent.session_id = options.agentSessionId;

  if (Object.keys(agent).length > 0) {
    rawInput = mergeAgentIntoContractMarkdown(rawInput, agent);
    payload.rawInput = rawInput;
  }

  async function postToArc(url) {
    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  let response;
  let usedUrl = options.url;
  try {
    response = await postToArc(usedUrl);
    if (!process.env.ARC_INGEST_URL && usedUrl === DEFAULT_INGEST_URL && response.status === 404) {
      usedUrl = DEFAULT_BASE_PATH_INGEST_URL;
      response = await postToArc(usedUrl);
    }
  } catch (error) {
    const hint = `Endpoint: ${usedUrl}\nIs ARC running, and is ARC_INGEST_URL correct?`;
    fail('Could not reach ARC ingest endpoint.', `${error instanceof Error ? error.message : String(error)}\n${hint}`);
  }

  const responseBody = await readResponseBody(response);
  if (!response.ok) {
    fail(`ARC returned HTTP ${response.status}.`, responseBody);
  }

  let data;
  try {
    data = responseBody ? JSON.parse(responseBody) : {};
  } catch {
    fail('ARC returned a non-JSON success response.', responseBody);
  }

  console.log('ARC inject succeeded');
  console.log(`id: ${data.id ?? data.item?.id ?? '(missing)'}`);
  console.log(`reviewUrl: ${data.reviewUrl ?? '(missing)'}`);
  console.log(`compareReady: ${Boolean(data.compareReady)}`);
  console.log(`source: ${options.source}`);
  if (options.runId) console.log(`runId: ${options.runId}`);
  if (options.agentName || options.agentId || options.agentRole || options.agentRuntime || options.agentSessionId) console.log('agentIdentity: included');
  console.log(`endpoint: ${usedUrl}`);
  if (options.file) console.log(`input: ${basename(options.file)}`);
}

inject();
