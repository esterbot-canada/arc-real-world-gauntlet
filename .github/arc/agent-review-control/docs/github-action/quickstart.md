# ARC GitHub Action quickstart

Goal: get one AI-generated PR protected by an ARC Trust Brief in about 10 minutes.

ARC checks whether the PR stayed inside the frozen `.aiplan` and produced trusted CI command receipts. It does not replace tests or human review.

## What you will install

```txt
.arc/plan.aiplan
.github/workflows/arc-pr-check.yml
.github/arc/agent-review-control/
```

V1 vendors the verifier into the repo so the proof works without a hosted service or Marketplace Action.

## 1. Copy ARC into your repo

From the ARC source repo:

```bash
mkdir -p YOUR_REPO/.github/arc
rsync -a \
  --exclude node_modules \
  --exclude .next \
  --exclude data \
  --exclude logs \
  --exclude tmp \
  --exclude '.env*' \
  apps/agent-review-control/ \
  YOUR_REPO/.github/arc/agent-review-control/
```

Inside `YOUR_REPO`:

```bash
mkdir -p .arc .github/workflows
cp .github/arc/agent-review-control/docs/github-action/example-plan.aiplan .arc/plan.aiplan
cp .github/arc/agent-review-control/docs/github-action/arc-pr-check.workflow.yml .github/workflows/arc-pr-check.yml
npm ci --prefix .github/arc/agent-review-control
```

## 2. Edit the frozen plan

Open `.arc/plan.aiplan` and set the boundaries for the next agent PR.

Small example:

```yaml
version: "1"
kind: "aiplan"
status: "frozen"

allowed_scope:
  files:
    - "src/signup/**"
    - "test/**"

excluded_scope:
  files:
    - "src/auth/**"

expected_evidence:
  required_commands:
    - "npm test"

freeze:
  created_by: "planner"
  frozen_at: "2026-05-24T00:00:00Z"
  contract_hash: "sha256:..."
```

Rules of thumb:

- Put only the files the agent is allowed to change in `allowed_scope.files`.
- Put dangerous or unrelated areas in `excluded_scope.files`.
- Include test files in allowed scope if the agent should update tests.
- Keep required commands boring and runnable in CI.

## 3. Recompute the plan hash

Run from your target repo root:

```bash
(
  cd .github/arc/agent-review-control
  node --input-type=module --eval '
import { readFileSync, writeFileSync } from "node:fs";
import { parseMinimalAiplanText } from "./lib/aiplan/minimal-parser.ts";
import { computeMinimalAiplanContractHash } from "./lib/aiplan/contract-hash.ts";
const planPath = "../../../.arc/plan.aiplan";
const raw = readFileSync(planPath, "utf8");
const parsed = parseMinimalAiplanText(raw);
if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
const hash = computeMinimalAiplanContractHash(parsed.plan);
writeFileSync(planPath, raw.replace(/contract_hash:\s*"sha256:[^"]+"/, `contract_hash: "${hash}"`));
console.log(hash);
'
)
```

Commit the install files and the frozen plan.

## 4. Open two tiny PRs

Use these to prove the gate works before trusting it on real work.

### Pass PR

Change only a file inside `allowed_scope.files`, and make sure the required command passes.

Expected result:

- ARC Trust Brief comment says `Pass`.
- GitHub check `ARC Trust Brief` passes.

### Blocked PR

Change a file inside `excluded_scope.files`.

Expected result:

- ARC Trust Brief comment says `Blocked`.
- GitHub check `ARC Trust Brief` fails.

## 5. Require the ARC check

In GitHub branch protection/rulesets for your default branch:

- enable required status checks
- require `ARC Trust Brief`

After that, `Needs Review` and `Blocked` ARC verdicts block merge. `Pass` allows merge unless another GitHub rule blocks it.

## Local smoke test

For local demos only, you can run ARC against a manual diff range:

```bash
node .github/arc/agent-review-control/scripts/arc-run-required-commands.mjs \
  --plan .arc/plan.aiplan \
  --out .arc/tmp/arc-command-receipts.json \
  --log-dir .arc/tmp/arc-command-logs

node .github/arc/agent-review-control/scripts/arc-pr-check.mjs \
  --plan .arc/plan.aiplan \
  --receipts .arc/tmp/arc-command-receipts.json \
  --out .arc/tmp/arc-trust-brief.md \
  --range main...HEAD \
  --allow-manual-range \
  --allow-needs-review-exit-0
```

Manual ranges are caller-provided evidence, so they cannot produce the same confidence as the GitHub PR workflow. In GitHub pull_request events, ARC loads `.arc/plan.aiplan` from the provider-verified base SHA, not from the PR head, so implementation PRs cannot rewrite the contract to fit their changes.

## Troubleshooting

- **ARC says files are outside scope:** add the intended paths to `allowed_scope.files`, then recompute the hash before implementation.
- **ARC says required command is missing:** make sure the command appears exactly in `expected_evidence.required_commands` and can run in GitHub Actions.
- **ARC blocks after plan edits in an implementation PR:** expected. ARC treats contract+implementation changes in the same PR as self-attestation. Freeze or update `.arc/plan.aiplan` before the implementation PR, then run implementation against that base-branch contract.
- **GitHub still blocks after ARC passes:** check other required reviews, CodeQL, rulesets, conversations, or branch protection rules.
