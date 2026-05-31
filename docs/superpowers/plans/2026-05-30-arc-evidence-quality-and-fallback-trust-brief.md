# ARC Evidence Quality and Fallback Trust Brief Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic acceptance-evidence checks, dependency drift wording, and invalid-plan fallback Trust Brief rendering to ARC.

**Architecture:** Extend the minimal `.aiplan` schema with optional evidence requirements, keep hashing deterministic/backward-compatible, and add checks inside the existing PR review pipeline. Make `arc-pr-check` parse/verify the plan before requiring receipts so invalid plans can still render blocked Trust Briefs.

**Tech Stack:** Node.js ESM scripts, TypeScript source under `.github/arc/agent-review-control/lib`, YAML parsing through existing parser, Node test runner.

---

## File Structure

- Modify: `.github/arc/agent-review-control/lib/aiplan/minimal-schema.ts`
  - Add optional `expected_evidence.required_changed_files` and `expected_evidence.required_test_patterns` validation.
- Modify: `.github/arc/agent-review-control/lib/aiplan/contract-hash.ts`
  - Include new optional fields in normalized hash input.
- Modify: `.github/arc/agent-review-control/lib/review/pr-check.ts`
  - Add required changed file checks.
  - Add required test pattern checks.
  - Add dependency drift-specific wording.
- Modify: `.github/arc/agent-review-control/scripts/arc-pr-check.mjs`
  - Read/parse/verify plan before requiring receipts.
  - If plan is invalid/hash-mismatched and receipts file is missing, still write blocked Trust Brief.
- Optional create: `.github/arc/agent-review-control/lib/review/acceptance-evidence.ts`
  - Helper for matching required changed files/patterns if `pr-check.ts` starts getting too large.
- Test files: inspect existing test layout first. Add tests beside current ARC verifier tests under `.github/arc/agent-review-control` using existing naming conventions.
- Modify: `.arc/scenarios/03-missing-required-tests/plan.aiplan`
  - Add acceptance evidence requirements that should make scenario #3 Needs Review.
- Modify: `.arc/scenarios/10-partial-implementation-missing-evidence/plan.aiplan`
  - Add acceptance evidence requirements that should make scenario #10 Needs Review.

## Chunk 1: Schema and Hash Support

### Task 1: Locate existing test patterns

**Files:**
- Inspect: `.github/arc/agent-review-control/package.json`
- Inspect: `.github/arc/agent-review-control/**/*test*`

- [ ] **Step 1: List tests**

Run:

```bash
cd /tmp/arc-real-world-gauntlet/.github/arc/agent-review-control
find . -maxdepth 4 -type f | sort | grep -E '(test|spec)'
cat package.json
```

Expected: identify exact test command and where parser/hash tests live.

### Task 2: Add failing schema tests for optional evidence fields

**Files:**
- Modify existing minimal schema/parser test file, likely under `.github/arc/agent-review-control/test` or `.github/arc/agent-review-control/lib/**`
- Modify later: `.github/arc/agent-review-control/lib/aiplan/minimal-schema.ts`

- [ ] **Step 1: Write tests for valid optional fields**

Add a test plan fixture with:

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

Assert parser returns:

```js
plan.expected_evidence.required_changed_files === ['test/userService.test.mjs']
plan.expected_evidence.required_test_patterns === ['retry succeeds', 'retry fails']
```

- [ ] **Step 2: Write tests for backward compatibility**

Plan with only:

```yaml
expected_evidence:
  required_commands:
    - "npm test"
```

Assert optional arrays default to `[]`.

- [ ] **Step 3: Write tests for invalid optional fields**

Assert these fail validation:

```yaml
required_changed_files: "test/foo.test.mjs"
required_test_patterns: [""]
```

Expected errors:

- `expected_evidence.required_changed_files: Expected array of path strings.`
- `expected_evidence.required_test_patterns: Expected array of non-empty strings.`

- [ ] **Step 4: Run focused tests and verify failure**

Run the exact test command discovered in Task 1.

Expected: new tests fail because fields are unknown or missing.

### Task 3: Implement schema support

**Files:**
- Modify: `.github/arc/agent-review-control/lib/aiplan/minimal-schema.ts`

- [ ] **Step 1: Extend type**

Change:

```ts
expected_evidence: { required_commands: string[] };
```

to:

```ts
expected_evidence: {
  required_commands: string[];
  required_changed_files: string[];
  required_test_patterns: string[];
};
```

- [ ] **Step 2: Extend allowed nested fields**

Add to expected evidence field set:

```ts
'required_changed_files'
'required_test_patterns'
```

- [ ] **Step 3: Validate optional path array**

Use the existing path/glob validation style. For `required_changed_files`, require relative safe paths, no absolute paths, no traversal. These are exact changed file paths, not globs.

- [ ] **Step 4: Validate optional pattern array**

Require array of non-empty strings. Do not implement regex yet unless existing code already has safe regex conventions. Treat values as case-insensitive substrings in this slice.

- [ ] **Step 5: Default omitted optional arrays to empty arrays**

When constructing validated plan, use:

```ts
required_changed_files: requiredChangedFiles,
required_test_patterns: requiredTestPatterns,
```

where missing values become `[]`.

- [ ] **Step 6: Run focused tests**

Expected: schema tests pass.

### Task 4: Add hash support for new fields

**Files:**
- Modify: `.github/arc/agent-review-control/lib/aiplan/contract-hash.ts`
- Test: existing hash test file

- [ ] **Step 1: Write failing hash test**

Create two otherwise-identical plans that differ only in `required_test_patterns`.

Assert computed hashes differ.

- [ ] **Step 2: Update hash normalization**

Include:

```ts
expected_evidence: {
  required_commands: [...plan.expected_evidence.required_commands],
  required_changed_files: [...plan.expected_evidence.required_changed_files],
  required_test_patterns: [...plan.expected_evidence.required_test_patterns],
}
```

- [ ] **Step 3: Run focused tests**

Expected: hash tests pass.

- [ ] **Step 4: Commit chunk 1**

```bash
git add .github/arc/agent-review-control/lib/aiplan .github/arc/agent-review-control/**/**test* .github/arc/agent-review-control/**/**spec*
git commit -m "Add acceptance evidence fields to aiplan schema"
```

## Chunk 2: PR Check Evidence Quality

### Task 5: Add required changed file checks

**Files:**
- Modify: `.github/arc/agent-review-control/lib/review/pr-check.ts`
- Test: existing PR check test file

- [ ] **Step 1: Write failing test**

Input:

- Plan requires `test/userService.test.mjs` in `required_changed_files`.
- Changed files only include `src/api/userService.mjs`.
- Trusted `npm test` receipt passes.

Expected:

- status `Needs Review`
- focus question includes missing required changed file
- receipt includes `Missing required changed file: test/userService.test.mjs`

- [ ] **Step 2: Implement check**

In `createArcPrCheck`, after scope checks:

```ts
for (const requiredFile of parsedPlan.plan.expected_evidence.required_changed_files) {
  if (!input.changedFiles.includes(requiredFile)) {
    focusQuestions.push(`Why was required evidence file \`${requiredFile}\` not changed? Impact: ARC cannot see the expected acceptance evidence in this PR.`);
    receipts.push(`Missing required changed file: ${requiredFile}`);
  }
}
```

- [ ] **Step 3: Run focused tests**

Expected: pass.

### Task 6: Add required test pattern checks

**Files:**
- Modify: `.github/arc/agent-review-control/lib/review/pr-check.ts`
- Possibly create: `.github/arc/agent-review-control/lib/review/acceptance-evidence.ts`
- Modify script if file content needs to be loaded: `.github/arc/agent-review-control/scripts/arc-pr-check.mjs`

- [ ] **Step 1: Decide input boundary**

Preferred: `arc-pr-check.mjs` reads content for changed test files and passes a map to `createArcPrCheck`:

```ts
changedFileContents?: Map<string, string>
```

If maps are awkward across JS/TS, pass plain object:

```ts
changedFileContents?: Record<string, string>
```

- [ ] **Step 2: Write failing test for missing pattern**

Input:

- Plan requires pattern `retry succeeds`.
- Changed files include `test/userService.test.mjs`.
- File content lacks `retry succeeds`.

Expected:

- status `Needs Review`
- focus question mentions missing required test pattern
- receipt includes `Missing required test pattern: retry succeeds`

- [ ] **Step 3: Write passing test for present pattern**

Same as above, but file content includes:

```js
test('retry succeeds after transient failure', async () => {})
```

Expected: no pattern focus question.

- [ ] **Step 4: Implement file content loading in script**

In `.github/arc/agent-review-control/scripts/arc-pr-check.mjs`, after changed files load:

- Filter changed files that look like tests or are required changed files:
  - path includes `.test.` or `.spec.`
  - or path starts with `test/`
- Read each existing file from working tree.
- Missing file content should become empty string and produce Needs Review when patterns cannot be found.

- [ ] **Step 5: Implement case-insensitive substring pattern check**

For each required pattern:

- Search across changed test/evidence file contents.
- Case-insensitive substring match.
- If missing, add focus question and receipt.

- [ ] **Step 6: Run focused tests**

Expected: pass.

### Task 7: Add dependency drift-specific wording

**Files:**
- Modify: `.github/arc/agent-review-control/lib/review/pr-check.ts`
- Test: existing PR check test file

- [ ] **Step 1: Write failing test for package outside allowed**

Input:

- Allowed files: `src/api/**`, `test/userService.test.mjs`
- Excluded files: none for packages
- Changed files: `src/api/userService.mjs`, `package.json`, `package-lock.json`
- Trusted `npm test` passes

Expected:

- status `Needs Review`
- focus question includes dependency-specific wording
- receipts include dependency files changed outside approved scope

- [ ] **Step 2: Write blocked test for package excluded**

Input:

- Excluded files include `package.json`
- Changed files include `package.json`

Expected: `Blocked` with existing excluded boundary reason.

- [ ] **Step 3: Implement package-file helper**

Use set:

```ts
const DEPENDENCY_FILES = new Set(['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);
```

When iterating `scope.outsideAllowed`, if file is dependency file and not excluded, use dependency wording instead of generic outside-scope wording.

- [ ] **Step 4: Run focused tests**

Expected: pass.

- [ ] **Step 5: Commit chunk 2**

```bash
git add .github/arc/agent-review-control/lib/review .github/arc/agent-review-control/scripts/arc-pr-check.mjs .github/arc/agent-review-control/**/**test* .github/arc/agent-review-control/**/**spec*
git commit -m "Add deterministic acceptance evidence checks"
```

## Chunk 3: Fallback Trust Brief for Invalid Plans

### Task 8: Make `arc-pr-check` tolerate missing receipts for invalid plans

**Files:**
- Modify: `.github/arc/agent-review-control/scripts/arc-pr-check.mjs`
- Test: script/integration test if existing; otherwise add unit-level CLI test if patterns exist

- [ ] **Step 1: Write failing CLI test or manual repro script**

Use scenario #7 plan or a temporary invalid plan with `allowed_scope.files: ["**"]`.

Run:

```bash
node .github/arc/agent-review-control/scripts/arc-pr-check.mjs \
  --plan .arc/scenarios/07-broad-weak-plan/plan.aiplan \
  --range main..HEAD \
  --allow-manual-range \
  --receipts .arc/tmp/does-not-exist.json \
  --out .arc/tmp/invalid-plan-brief.md
```

Expected after implementation:

- exits 1
- writes `.arc/tmp/invalid-plan-brief.md`
- brief says `ARC Trust Brief: Blocked`
- brief includes broad wildcard plan error

Before implementation, it likely exits 2 with missing receipts.

- [ ] **Step 2: Refactor script read order**

Current script reads plan, receipts, and changed files in one `Promise.all`. Change to:

1. Read plan text.
2. Resolve/load changed files.
3. Attempt preliminary `createArcPrCheck` path with empty receipts only if plan parse/hash fails.
4. Only read/parse receipts when plan is valid enough to need evidence checks.

Preferred simpler implementation:

- Add helper from review lib if needed:
  - `createArcPrCheck({ planText, changedFiles: [], receipts: [], diffSource })` already returns Blocked on invalid plan/hash before receipts matter.
- In script, catch missing receipt read.
- If receipt read fails, call `createArcPrCheck` with empty receipts.
- If result is `Blocked` due plan invalid/hash mismatch, write it.
- Otherwise fail with missing receipts as before.

- [ ] **Step 3: Preserve behavior for valid plan missing receipts**

Valid plan + missing receipts should still produce `Needs Review` or failure, not `Pass`.

Recommended: let `createArcPrCheck` render Needs Review with missing commands using empty receipts, then exit 1.

- [ ] **Step 4: Run scenario #7 local command**

Expected: blocked Trust Brief file exists.

- [ ] **Step 5: Run scenario #8 local command**

Expected: blocked Trust Brief file exists with hash mismatch.

- [ ] **Step 6: Commit chunk 3**

```bash
git add .github/arc/agent-review-control/scripts/arc-pr-check.mjs .github/arc/agent-review-control/**/**test* .github/arc/agent-review-control/**/**spec*
git commit -m "Render Trust Briefs for invalid aiplans without receipts"
```

## Chunk 4: Scenario Updates and Gauntlet Verification

### Task 9: Update scenario #3 and #10 plans

**Files:**
- Modify: `.arc/scenarios/03-missing-required-tests/plan.aiplan`
- Modify: `.arc/scenarios/10-partial-implementation-missing-evidence/plan.aiplan`
- Modify if needed: `.arc/scenarios/03-missing-required-tests/expected.json`
- Modify if needed: `.arc/scenarios/10-partial-implementation-missing-evidence/expected.json`

- [ ] **Step 1: Add evidence fields to scenario #3**

Under `expected_evidence`:

```yaml
  required_changed_files:
    - "test/settings.test.mjs"
  required_test_patterns:
    - "too short"
    - "too long"
```

- [ ] **Step 2: Recompute and update freeze hash for scenario #3**

Use existing hash utility or script pattern from repo. If no CLI exists, add a small one-off Node command importing `computeMinimalAiplanContractHash`.

- [ ] **Step 3: Add evidence fields to scenario #10**

Under `expected_evidence`:

```yaml
  required_changed_files:
    - "test/userService.test.mjs"
  required_test_patterns:
    - "retry succeeds"
    - "retry failure"
```

- [ ] **Step 4: Recompute and update freeze hash for scenario #10**

Expected: plan validates.

- [ ] **Step 5: Commit scenario updates**

```bash
git add .arc/scenarios/03-missing-required-tests/plan.aiplan .arc/scenarios/10-partial-implementation-missing-evidence/plan.aiplan
git commit -m "Tighten gauntlet acceptance evidence plans"
```

### Task 10: Run full verifier tests

**Files:**
- No edits unless failures reveal issues

- [ ] **Step 1: Run ARC verifier test suite**

```bash
cd /tmp/arc-real-world-gauntlet/.github/arc/agent-review-control
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run app tests**

```bash
cd /tmp/arc-real-world-gauntlet
npm test
```

Expected: app tests pass.

### Task 11: Re-run key gauntlet local checks

**Files:**
- No edits unless failures reveal issues

- [ ] **Step 1: Scenario #7 invalid plan fallback**

Run local `arc-pr-check` with scenario #7 plan and missing receipts.

Expected: `Blocked`, Trust Brief written.

- [ ] **Step 2: Scenario #8 hash mismatch fallback**

Use the existing PR branch or recreate tampered plan locally.

Expected: `Blocked`, Trust Brief written.

- [ ] **Step 3: Scenario #10 false pass fix**

Activate scenario #10 plan on main or run local manual range against existing branch after updating root plan.

Expected: local Trust Brief includes missing required changed file/test pattern. GitHub should become `Needs Review` after pushing updated workflow/plan.

### Task 12: Commit final verification notes

**Files:**
- Modify: `memory/2026-05-30.md` or current day file under `/home/simranjit/.openclaw/memory/`

- [ ] **Step 1: Journal results**

Append:

- commits created
- tests run
- gauntlet outcomes changed
- any remaining false-pass or UX gaps

- [ ] **Step 2: Commit code if memory is outside repo do not include it**

Only commit repo changes:

```bash
cd /tmp/arc-real-world-gauntlet
git status --short
git log --oneline -5
```

Expected: clean working tree after commits.

