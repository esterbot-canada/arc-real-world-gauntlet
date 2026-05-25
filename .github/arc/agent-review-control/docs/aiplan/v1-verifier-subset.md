# ARC V1 Verifier Subset

ARC V1 only verifies path globs and required command receipts. Other fields are planner notes for now.

The verifier answers two boring questions:

1. Did this PR touch files outside the frozen allowed scope or inside excluded scope?
2. Did the required command receipts exist and pass?

It does not judge whether the code is good. CI, tests, static analysis, reviewers, and humans still do that.

## Minimal `.aiplan`

```yaml
version: "1"
kind: "aiplan"
status: "frozen"

allowed_scope:
  files:
    - "src/signup/**"

excluded_scope:
  files:
    - "src/auth/**"
    - "src/session/**"

expected_evidence:
  required_commands:
    - "npm test -- SignupForm"

freeze:
  created_by: "planner"
  frozen_at: "2026-05-24T00:00:00Z"
  contract_hash: "sha256:..."
```

## Command receipts

```json
[
  {
    "command": "npm test -- SignupForm",
    "exitCode": 0,
    "provenance": "trusted_ci",
    "logPath": "logs/signup-test.log"
  }
]
```

`trusted_ci` receipts can support a clean Pass. `agent_reported` receipts are accepted as useful context, but the Trust Brief stays Needs Review because agent-written evidence can be forged.

## GitHub PR integration

The local action at `.github/actions/arc-pr-check` runs the deterministic verifier in PR context, appends the Trust Brief to the job summary, and can create/update a single PR comment using a stable ARC marker.

Expected workflow behavior:

- **Pass** exits 0.
- **Needs Review** exits 1 by default so required GitHub checks can block merge.
- **Blocked** exits 1.

For local demos/report-only jobs, `arc-pr-check.mjs` supports `--allow-needs-review-exit-0`, but the default GitHub workflow does not use it.

The sample workflow at `.github/workflows/arc-pr-check.yml` builds a trusted CI command receipt, runs ARC against the provider PR base/head event, and posts the Trust Brief back to the pull request.

The receipt step runs `npm run arc:run-required-commands -- --plan .arc/plan.aiplan --out tmp/arc-command-receipts.json`, so required CI commands come from the frozen contract itself. The workflow lets that step continue long enough to generate receipts and a Trust Brief, then fails the job afterward if any required command failed.

## Trust Brief output

The output stays short:

- Status
- Summary Reason
- Up to 3 Focus Questions
- Collapsible Receipts
