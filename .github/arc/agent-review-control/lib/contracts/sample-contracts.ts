export const validContractMarkdown = `# Agent Review Contract

Implemented contract parsing and validation for Markdown handoffs.

\`\`\`json
{
  "task_title": "Add contract parser",
  "status": "DONE",
  "summary": "Adds pure parsing and validation for Markdown contracts with JSON blocks.",
  "agent": {
    "name": "parser-agent",
    "role": "contract implementation",
    "runtime": "openclaw",
    "run_id": "sample-run-001"
  },
  "files_touched": [
    "apps/agent-review-control/lib/contracts/parser.ts",
    "apps/agent-review-control/lib/contracts/schema.ts"
  ],
  "systems_touched": ["contract-ingest"],
  "tests_run": ["node --test --experimental-transform-types apps/agent-review-control/tests/contracts/parser.test.ts"],
  "risk_level": "medium",
  "open_questions": [],
  "assumptions": ["Contracts include one fenced JSON object."],
  "rollback_note": "Revert parser and schema files if ingest behavior regresses.",
  "next_steps": ["Wire parser into the inbox UI."]
}
\`\`\`
`;

export const incompleteContractMarkdown = `# Agent Review Contract

This handoff is intentionally incomplete and should not be auto-filled.

\`\`\`json
{
  "task_title": "Partial handoff",
  "status": "DONE_WITH_CONCERNS",
  "summary": "The agent reported a partial implementation but did not include test evidence or risk level.",
  "files_touched": ["apps/agent-review-control/lib/contracts/parser.ts"],
  "systems_touched": ["contract-ingest"]
}
\`\`\`
`;

export const invalidJsonContractMarkdown = `# Agent Review Contract

\`\`\`json
{
  "task_title": "Broken JSON",
  "status": "DONE",
\`\`\`
`;

export const highRiskConfigContractMarkdown = `# Agent Review Contract

\`\`\`json
{
  "task_title": "Change runtime config",
  "status": "DONE_WITH_CONCERNS",
  "summary": "Updates runtime configuration used by contract ingest.",
  "files_touched": ["apps/agent-review-control/next.config.js", "apps/agent-review-control/package.json"],
  "systems_touched": ["config", "contract-ingest"],
  "tests_run": [],
  "risk_level": "high",
  "open_questions": ["Confirm whether config defaults are safe for local-only use."],
  "config_changes": "Changed app runtime configuration.",
  "rollback_note": "Revert config and package changes."
}
\`\`\`
`;

export const sampleContracts = [
  validContractMarkdown,
  incompleteContractMarkdown,
  highRiskConfigContractMarkdown,
] as const;
