# ARC Agent Guide

ARC helps humans review agent work before approval, merge, or deployment. Your job as an agent is to produce a truthful Agent Review Contract, validate it locally, and submit it to ARC.

## When ARC is required

Submit an ARC contract when you change or materially assess any of:
- source files
- config/env/runtime behavior
- schema, migrations, or database behavior
- auth/security/billing/deployment logic
- APIs or integration contracts
- operational docs/runbooks
- multi-agent handoffs where work may conflict

Pure chat answers do not need ARC unless they create a durable artifact or approval decision.

## Required dogfood loop

1. Write a contract Markdown file.
2. Validate it locally.
3. Upload it to ARC.
4. Include the review URL in the final handoff.

Recommended temporary path:

```bash
apps/agent-review-control/tmp/arc-contract-<task-or-run-id>.md
```

## What to submit

Submit one Markdown document containing a fenced JSON block. The Markdown can explain the work in human language; the JSON is the machine-readable contract ARC validates.

Required JSON fields:
- `task_title`
- `status`
- `summary`
- `files_touched`
- `systems_touched`
- `tests_run`
- `risk_level`
- `open_questions`
- `rollback_note`

Useful optional fields:
- `agent` (object with `name`, `id`, `role`, `runtime`, `run_id`, `session_id`)
- `contract_type`
- `assumptions`
- `breaking_change_risk`
- `migration_changes`
- `config_changes`
- `external_effects`
- `next_steps`

Allowed `contract_type` values:
- `planning`
- `implementation`
- `deployment`
- `qa_review`
- `ops_fix`
- `sample`

Allowed `status` values:
- `DONE`
- `DONE_WITH_CONCERNS`
- `BLOCKED`
- `NEEDS_CONTEXT`

Allowed `risk_level` values:
- `low`
- `medium`
- `high`
- `critical`

## Truth rules

Do not fake confidence. ARC is a control surface, not a sales pitch.

Always:
- List every relevant file you touched.
- Report tests exactly as run.
- Use `tests_run: []` if no tests were run.
- Include rollback status honestly.
- Put approval-blocking uncertainty in `open_questions`.
- Put non-blocking follow-up, polish, or future work in `next_steps`.
- Put environmental/context assumptions in `assumptions`.
- Mark incomplete work honestly with `DONE_WITH_CONCERNS`, `BLOCKED`, `NEEDS_CONTEXT`, or an incomplete contract.

Never:
- Invent tests.
- Hide risky files or systems.
- Claim rollback exists if it does not.
- Downplay auth, config, schema, migration, database, security, billing, or deployment changes.
- Auto-approve your own work.

## Contract template

````markdown
# Agent Review Contract

Short human summary of the completed run.

```json
{
  "task_title": "Clear title of the task",
  "status": "DONE_WITH_CONCERNS",
  "summary": "What changed and why. Mention important constraints, tradeoffs, or incomplete parts.",
  "contract_type": "implementation",
  "agent": {
    "name": "backend-agent",
    "id": "agent-backend-001",
    "role": "backend implementation",
    "runtime": "openclaw",
    "run_id": "run-123",
    "session_id": "session-456"
  },
  "files_touched": [
    "path/to/file.ts"
  ],
  "systems_touched": [
    "ui",
    "api"
  ],
  "tests_run": [
    "npm test"
  ],
  "risk_level": "medium",
  "open_questions": [],
  "rollback_note": "How to revert or disable this safely. If rollback was not tested, say that plainly.",
  "assumptions": [
    "Any assumptions the reviewer should know."
  ],
  "breaking_change_risk": "None identified, or describe the risk.",
  "migration_changes": "None, or describe migration/database changes.",
  "config_changes": "None, or describe config/env changes.",
  "external_effects": "None, or describe network/API/user-visible effects.",
  "next_steps": [
    "Optional non-blocking follow-up."
  ]
}
```
````

## Validate before upload

```bash
cd apps/agent-review-control
npm run validate:contract -- --file tmp/arc-contract-<task-or-run-id>.md
```

Validation fails on missing/invalid JSON, missing required fields, invalid field types, and unknown fields. It warns on vague evidence like `tests passed`; prefer exact commands.

## Auto-inject with the local script

Start ARC with an ingest token configured, then run:

```bash
cd apps/agent-review-control
ARC_INGEST_TOKEN=*** npm run inject -- --file tmp/arc-contract-<task-or-run-id>.md --source openclaw --run-id run-123 --agent-name backend-agent --agent-role "backend implementation"
```

Or from stdin:

```bash
cat tmp/arc-contract-<task-or-run-id>.md | ARC_INGEST_TOKEN=*** npm run inject -- --stdin --source my-agent
```

The script prints the ARC review URL. Give that URL to the human reviewer. Contract `agent` identity wins in the UI; ingest `source` and `runId` are persisted and fill missing runtime/run-id display fields.

## Direct API submit

```bash
curl -sS -X POST "http://localhost:3060/api/ingest/contracts" \
  -H "Authorization: Bearer $ARC_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
  "source": "my-agent",
  "runId": "run-123",
  "rawInput": "# Agent Review Contract\n\n```json\n{\"task_title\":\"Example\",\"status\":\"DONE\",\"summary\":\"Example summary.\",\"files_touched\":[\"app/page.tsx\"],\"systems_touched\":[\"ui\"],\"tests_run\":[\"npm test\"],\"risk_level\":\"low\",\"open_questions\":[],\"rollback_note\":\"Revert app/page.tsx.\"}\n```"
}
JSON
```

## Success criteria

A good agent handoff lets the human answer:
- What changed?
- Why did it change?
- What files/systems might conflict with other work?
- What tests support it?
- What could break?
- How can it be rolled back?
- Where is the ARC review URL?
