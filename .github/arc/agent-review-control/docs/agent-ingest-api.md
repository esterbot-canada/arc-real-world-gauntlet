# ARC Agent Ingest API v1

Purpose: let coding agents submit an Agent Review Contract automatically after a run finishes, without making the human paste it into the inbox.

Related docs:
- [Agent Guide](./agent-guide.md)
- [Human Reviewer Guide](./human-reviewer-guide.md)
- [Tester Quickstart](./tester-quickstart.md)

## Security model

Agent writes use a dedicated endpoint and require a bearer token:

```bash
ARC_INGEST_TOKEN="change-me-long-random-token"
```

If `ARC_INGEST_TOKEN` is missing, the agent ingest endpoint refuses writes. This keeps the manual local UI separate from automated/external writes.

Use throwaway tokens like `dev-token` only for local testing. For any shared or exposed environment, use a long random token and never commit it.

## Endpoint

```http
POST /api/ingest/contracts
Authorization: Bearer $ARC_INGEST_TOKEN
Content-Type: application/json
```

Body:

````json
{
  "rawInput": "# Agent Review Contract\n\n```json\n{...}\n```",
  "source": "claude-code",
  "runId": "optional-agent-run-id"
}
````

Accepted aliases for `rawInput`: `input`, `markdown`. The contract JSON may include an optional `agent` object with `name`, `id`, `role`, `runtime`, `run_id`, and `session_id`. Contract identity wins; persisted ingest metadata fills `runtime` from `source` and `runId` from `runId` when missing.

Response:

```json
{
  "ok": true,
  "id": "review-item-id",
  "reviewUrl": "http://localhost:3060/review/review-item-id",
  "compareReady": true,
  "item": { "...": "hydrated review item with deterministic risk reasons" },
  "ingest": {
    "source": "claude-code",
    "runId": "optional-agent-run-id",
    "receivedAt": "2026-05-08T17:00:00.000Z"
  }
}
```

## Validate before upload

Dogfood agents should validate the contract locally before injection:

```bash
cd apps/agent-review-control
npm run validate:contract -- --file contract.md
```

Validation catches missing/invalid JSON, missing required fields such as `rollback_note`, invalid field types, and unknown fields. It also warns on vague test evidence. Fix only with truthful information; do not invent tests or rollback paths.

## Local auto-inject script

Preferred local flow:

```bash
cd apps/agent-review-control
npm run validate:contract -- --file contract.md
ARC_INGEST_TOKEN=dev-token npm run inject -- --file contract.md --source openclaw --run-id run-123 --agent-name backend-agent --agent-role implementation
```

From stdin:

```bash
cat contract.md | npm run validate:contract -- --stdin
cat contract.md | ARC_INGEST_TOKEN=dev-token npm run inject -- --stdin --source agent
```

Use `npm run inject -- --help` for all injection options.

## Minimal curl template

````bash
curl -sS -X POST "http://localhost:3060/api/ingest/contracts" \
  -H "Authorization: Bearer $ARC_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
  "source": "agent",
  "runId": "run-123",
  "rawInput": "# Agent Review Contract\n\n```json\n{\"task_title\":\"Example\",\"status\":\"DONE\",\"summary\":\"Example contract with enough detail for review.\",\"files_touched\":[\"app/page.tsx\"],\"systems_touched\":[\"ui\"],\"tests_run\":[\"npm test\"],\"risk_level\":\"low\",\"open_questions\":[],\"rollback_note\":\"Revert the changed file.\"}\n```"
}
JSON
````

## Bigger-picture rule

The ingest API does not decide whether work is safe. It only gets the contract into ARC. Safety stays with the deterministic rule engine plus human review:

agent run → contract upload → visible rule hits → human approval/blocking decision
