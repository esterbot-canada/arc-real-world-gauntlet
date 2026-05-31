# ARC Evidence Quality + Dependency Drift + Fallback Trust Brief Design

Date: 2026-05-30
Status: Approved

## Goal

Improve ARC using the first 10 gauntlet scenarios without expanding beyond the MVP wedge:

> Contract + Evidence + Verdict for AI-generated PRs.

ARC should not prove code correctness. ARC should verify whether the agent stayed inside the frozen assignment and produced the required evidence.

This slice fixes three concrete findings:

1. Scenarios #3 and #10 false-passed because `npm test` passed even though required acceptance evidence/tests were missing.
2. Dependency/package changes need a clear rule when they are necessary for tests but outside approved scope.
3. Scenarios #7 and #8 blocked correctly, but GitHub did not post a Trust Brief because receipt generation failed before brief rendering.

## Non-goals

- No dashboard.
- No AI/LLM code review.
- No semantic proof that tests fully prove behavior.
- No generic policy engine.
- No DAG orchestration.
- No auto-merge decisions.

## Design

### 1. Acceptance Evidence v1

Extend minimal `.aiplan` under `expected_evidence` with optional deterministic fields:

```yaml
expected_evidence:
  required_commands:
    - "npm test"
  required_changed_files:
    - "test/userService.test.mjs"
  required_test_patterns:
    - "retry succeeds"
    - "retry fails"
```

Behavior:

- If `required_changed_files` contains a path that did not change in the PR, add a focus question and mark `Needs Review`.
- If `required_test_patterns` contains a string or simple regex that is not found in changed test files, add a focus question and mark `Needs Review`.
- These checks do not prove correctness. They only prove expected acceptance-evidence artifacts are present.
- Existing plans that only include `required_commands` remain valid.

Trust Brief wording should avoid overclaiming:

- Good: "Required acceptance evidence files/patterns were present."
- Bad: "The feature is fully tested."

### 2. Dependency Drift Rule

Recognize dependency/package files as first-class review objects:

- `package.json`
- `package-lock.json`
- `pnpm-lock.yaml`
- `yarn.lock`

Behavior:

- If dependency files are explicitly allowed, they are okay.
- If dependency files are explicitly excluded, touching them is `Blocked`.
- If dependency files are outside allowed scope but not excluded, result is `Needs Review`.

Trust Brief wording:

> Dependency files changed outside approved scope. This may be necessary, but it was not pre-authorized.

Product rule:

> Necessary is not the same as authorized.

If a test requires a new dependency, the agent should stop and ask for an amended/frozen plan before changing package files.

### 3. Fallback Trust Brief for Invalid Plans

Current GitHub workflow can fail in receipt generation before `arc-pr-check` creates `.arc/tmp/arc-trust-brief.md`. This hides useful ARC feedback from PR reviewers.

Change behavior so invalid-plan/hash-mismatch failures still produce a Trust Brief comment.

Implementation direction:

- Let `arc-pr-check` tolerate missing receipts when the plan is already invalid or hash-mismatched.
- Alternatively, have receipt runner write a failure receipt/artifact and let `arc-pr-check` render the blocked brief.
- Prefer the smallest robust change: `arc-pr-check` reads the plan first, returns a blocked Trust Brief on plan parse/hash failure, and only requires receipts after the plan passes basic trust checks.

Expected result:

- Scenario #7 remains `Blocked` and posts a PR comment explaining broad wildcard plan rejection.
- Scenario #8 remains `Blocked` and posts a PR comment explaining frozen hash mismatch.

### 4. Deterministic Status Rules

`Blocked`:

- Invalid or non-frozen `.aiplan`.
- Frozen hash mismatch.
- Invalid changed paths.
- Explicit excluded-scope touch.

`Needs Review`:

- Manual/untrusted diff source.
- Outside allowed scope but not excluded.
- Dependency files changed outside allowed scope but not excluded.
- Missing required command receipt.
- Failed required command receipt.
- Agent-reported receipt instead of trusted CI receipt.
- Missing required changed file.
- Missing required test pattern.
- Empty diff with otherwise satisfied receipts.

`Pass`:

- Provider-verified diff.
- Frozen hash verified.
- Changed files are inside allowed scope.
- No excluded files touched.
- Required commands passed with trusted receipts.
- Required changed files are present.
- Required test patterns are present.

## Expected Gauntlet Changes

After implementation:

- Scenario #3: GitHub changes from false `Pass` to `Needs Review`.
- Scenario #10: GitHub changes from false `Pass` to `Needs Review`.
- Scenario #5/#6: remain `Blocked` when package/db files are explicitly excluded.
- Scenario #7/#8: remain `Blocked`, but now post clear Trust Brief comments.
- New dependency-needed-for-test scenario: `Needs Review` unless package files are explicitly allowed or excluded.

## Testing Plan

Add/update unit tests for:

- Optional `expected_evidence.required_changed_files` parsing.
- Optional `expected_evidence.required_test_patterns` parsing.
- Missing required changed file produces `Needs Review`.
- Missing required test pattern produces `Needs Review`.
- Present changed file and pattern can still `Pass`.
- Dependency file outside allowed scope produces dependency-specific `Needs Review` wording.
- Dependency file inside excluded scope remains `Blocked`.
- `arc-pr-check` with invalid plan and missing receipts still writes a blocked Trust Brief.
- `arc-pr-check` with hash mismatch and missing receipts still writes a blocked Trust Brief.

## Rollout

1. Implement parser/schema/hash changes while preserving backward compatibility.
2. Implement PR check evidence-quality checks.
3. Implement dependency-specific Trust Brief messaging.
4. Make `arc-pr-check` render blocked invalid-plan briefs without receipt file.
5. Update scenario #3/#10 plans with required changed files/patterns.
6. Re-run gauntlet checks for #3, #7, #8, #10 and create the dependency-needed-for-test scenario if useful.
