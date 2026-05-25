# ARC Tester Quickstart

Use this when testing ARC with another person or another coding agent.

## 1. Install and start ARC

```bash
cd apps/agent-review-control
npm install
ARC_INGEST_TOKEN=dev-token npm run dev
```

ARC should start on:

```text
http://localhost:3060
```

`dev-token` is only for local testing. Outside throwaway local tests, use a long random token and never commit or share it.

For production-like local start after build:

```bash
npm run build
ARC_INGEST_TOKEN=dev-token npm run start
```

## 2. Create a sample contract

Save this as `tmp/sample-arc-contract.md`:

````markdown
# Agent Review Contract

Example tester contract for ARC auto-inject.

```json
{
  "task_title": "Add example tester contract",
  "status": "DONE",
  "summary": "Creates a sample contract so a tester can verify the ARC ingest and review flow.",
  "agent": {
    "name": "tester-agent",
    "role": "qa tester",
    "runtime": "manual",
    "run_id": "tester-001"
  },
  "files_touched": [
    "tmp/sample-arc-contract.md"
  ],
  "systems_touched": [
    "documentation",
    "contract-ingest"
  ],
  "tests_run": [
    "Manual ARC ingest smoke test"
  ],
  "risk_level": "low",
  "open_questions": [],
  "rollback_note": "Delete tmp/sample-arc-contract.md and remove the ARC review item."
}
```
````

## 3. Auto-inject the contract

In a second terminal:

```bash
cd apps/agent-review-control
ARC_INGEST_TOKEN=dev-token npm run inject -- --file tmp/sample-arc-contract.md --source tester --run-id tester-001 --agent-name tester-agent --agent-role "qa tester"
```

Expected output:

```text
ARC inject succeeded
id: <id>
reviewUrl: http://localhost:3060/review/<id>
compareReady: <true|false>
```

## 4. Review in ARC

Open the returned `reviewUrl`.

Check:
- Open reviewer/bot concerns
- summary
- agent identity
- files touched
- systems touched
- tests run
- risk reasons
- rollback note
- raw Markdown

Optional GitHub PR concern ingest:

```bash
npm run ingest:pr-concerns -- --review-id <id> --repo <owner/repo> --pr <number>
```

This uses `gh api` to fetch PR review comments, issue comments, and review states, then posts a compact concern summary to ARC.

Then mark it approved or rejected based on the Human Reviewer Guide.

## 5. Alternative: inject from stdin

```bash
cat tmp/sample-arc-contract.md | ARC_INGEST_TOKEN=dev-token npm run inject -- --stdin --source tester
```

## 6. Direct API test

```bash
curl -sS -X POST "http://localhost:3060/api/ingest/contracts" \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{
  "source": "tester",
  "runId": "curl-test-001",
  "rawInput": "# Agent Review Contract\n\n```json\n{\"task_title\":\"Curl tester contract\",\"status\":\"DONE\",\"summary\":\"Verifies direct API ingest.\",\"files_touched\":[\"tmp/curl.md\"],\"systems_touched\":[\"contract-ingest\"],\"tests_run\":[\"curl POST smoke test\"],\"risk_level\":\"low\",\"open_questions\":[],\"rollback_note\":\"Delete the test review item.\"}\n```"
}
JSON
```

## 7. Cleanup

From the dashboard, delete temporary test review items when you are done.

If you used temporary contract files, remove them:

```bash
rm -f tmp/sample-arc-contract.md
```

## Feedback questions for testers

After the loop, ask:
- Could you understand what ARC wanted you to do?
- Was the contract template easy to fill?
- Did the risk labels help your review decision?
- Did the auto-inject command feel simple enough?
- What part felt confusing or unnecessary?
