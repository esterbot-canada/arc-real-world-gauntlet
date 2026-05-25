# ARC V1 GitHub Action install

This is the current V1 install path for the ARC Trust Packet verifier.

ARC checks whether an agent stayed inside the frozen `.aiplan` and produced required command receipts. CI still checks whether the code works.

## What this gives you

On every PR, GitHub runs ARC and posts a Trust Brief.

- `Pass`: changed files stayed inside approved scope and required trusted command receipts passed.
- `Needs Review`: something deterministic needs human inspection, like outside-allowed files or missing receipts.
- `Blocked`: the PR crossed an explicit frozen boundary, like touching excluded files or tampering with the plan hash.

For V1, both `Needs Review` and `Blocked` fail the GitHub check. If you make `ARC Trust Brief` a required status check, GitHub blocks merge.

## Tested proof

This flow was tested on `esterbot-canada/arc-manual-test`.

- PR #4 touched excluded `src/auth/session.mjs`: ARC check failed and GitHub merge state became `BLOCKED`.
- PR #5 stayed inside `src/signup/**` and `test/**`: ARC check passed and GitHub merge state became `CLEAN`.

## Install files

Your repo needs these files:

```txt
.arc/plan.aiplan
.github/workflows/arc-pr-check.yml
.github/arc/agent-review-control/...
```

The `.github/arc/agent-review-control` folder is the vendored ARC verifier package. It is not the final long-term packaging, but it is the smallest V1 install that works without a hosted service or published marketplace action.

## Step 1: add the frozen plan

Copy `docs/github-action/example-plan.aiplan` to your repo as:

```txt
.arc/plan.aiplan
```

Edit the file globs before freezing.

Example:

```yaml
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
```

Important: include test files in `allowed_scope.files` when the agent is expected to update tests. Otherwise ARC will correctly flag test changes as outside scope.

## Step 2: vendor the ARC verifier

For the current V1 proof package, copy this app into the target repo:

```txt
.github/arc/agent-review-control
```

Do not copy generated folders:

```txt
node_modules
.next
tmp
.env*
```

If you edited any frozen plan field in Step 1, recompute `freeze.contract_hash` before opening PRs. From the target repo root, after vendoring ARC, run:

```bash
npm ci --prefix .github/arc/agent-review-control
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
writeFileSync(planPath, raw.replace(/contract_hash:\\s*"sha256:[^"]+"/, `contract_hash: "${hash}"`));
console.log(hash);
'
)
```

## Step 3: add the workflow

Copy `docs/github-action/arc-pr-check.workflow.yml` to:

```txt
.github/workflows/arc-pr-check.yml
```

The job name must stay:

```txt
ARC Trust Brief
```

That is the status check name you require in branch protection.

## Step 4: protect the branch

In GitHub:

1. Open repository settings.
2. Go to Rules or Branch protection for `main`.
3. Require status checks before merging.
4. Select `ARC Trust Brief`.
5. Enable strict mode if you want branches up to date before merge.

CLI equivalent:

```bash
gh api --method PUT /repos/OWNER/REPO/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input protection.json
```

Where `protection.json` contains:

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["ARC Trust Brief"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": true
}
```

GitHub plan note: private repos may require GitHub Pro/Team for branch protection required checks. Public repos support this.

## Step 5: check for unrelated blockers

GitHub merge state can be blocked by things that are not ARC:

- required reviews
- CodeQL/code scanning
- code quality rules
- conversation resolution
- existing rulesets
- linear history requirements

If ARC passes but GitHub still says blocked, inspect rulesets and branch protection. ARC owns the `ARC Trust Brief` result, not every GitHub merge rule.

## Local smoke commands

Inside a repo with `.arc/plan.aiplan`:

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
  --allow-manual-range
```

Manual ranges are caller-provided evidence, so ARC will not treat them as provider-verified pass evidence. Real PR checks should use GitHub `pull_request` base/head SHAs from the event payload.

## V1 limitation

This install path is intentionally boring. It vendors the verifier instead of using a published GitHub Action. That makes the MVP self-contained and testable today. The next packaging step is a reusable action or release artifact.
