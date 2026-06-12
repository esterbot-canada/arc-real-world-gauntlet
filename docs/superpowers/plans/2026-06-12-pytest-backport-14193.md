# Pytest Backport 14193 Retrospective Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a reproducible ARC retrospective for pytest backport PR #14193 with one historical scenario and three deterministic mutations.

**Architecture:** Store immutable public-source snapshots and fixtures under a dedicated pilot directory. A focused Python runner loads the frozen contract and scenario fixtures, invokes ARC's existing boundary evaluator, writes Trust Briefs, and checks expected verdicts without network access.

**Tech Stack:** Python 3.11+, pytest, PyYAML, ARC's existing `agent_work_evidence` package, Git/GitHub public artifacts.

---

## Chunk 1: Freeze Public Inputs

### Task 1: Capture upstream metadata and patch

**Files:**
- Create: `pilots/pytest-backport-14193/sources/pre-cutoff/issue-13503.json`
- Create: `pilots/pytest-backport-14193/sources/pre-cutoff/pr-14050.json`
- Create: `pilots/pytest-backport-14193/sources/pre-cutoff/pr-14193.json`
- Create: `pilots/pytest-backport-14193/sources/post-cutoff/pr-14366.json`
- Create: `pilots/pytest-backport-14193/evidence/patches/historical-backport.patch`

- [ ] Fetch canonical metadata with `gh api`.
- [ ] Record exact base and head SHAs for PR #14193.
- [ ] Export the exact base-to-head patch.
- [ ] Verify the patch applies to the recorded base.
- [ ] Keep post-cutoff revert data in a separate directory.

### Task 2: Write and hash the reconstructed contract

**Files:**
- Create: `pilots/pytest-backport-14193/contracts/pytest-backport-14193.aiplan`
- Create: `pilots/pytest-backport-14193/contracts/source-map.json`
- Create: `pilots/pytest-backport-14193/contracts/receipts.json`

- [ ] Derive the narrow scope and required command from pre-cutoff artifacts.
- [ ] Label every inferred field in `source-map.json`.
- [ ] Calculate the canonical contract SHA-256.
- [ ] Insert the hash into the frozen contract.
- [ ] Verify the contract parser accepts it.

## Chunk 2: Build Deterministic Scenarios

### Task 3: Add scenario fixtures and runner

**Files:**
- Create: `pilots/pytest-backport-14193/scenarios/manifest.json`
- Create: `pilots/pytest-backport-14193/scenarios/*.json`
- Create: `arc/scripts/run_pytest_pilot.py`
- Modify: `package.json`

- [ ] Write the historical fixture from the exact changed-file list.
- [ ] Write the unrelated-file mutation.
- [ ] Write the missing-evidence mutation.
- [ ] Write the failed-evidence mutation.
- [ ] Implement a runner using `evaluate_boundaries`.
- [ ] Render one Trust Brief per scenario.
- [ ] Add `arc:pytest-pilot` and include it in the aggregate gauntlet command.

### Task 4: Test the runner

**Files:**
- Create: `arc/tests/test_pytest_pilot.py`

- [ ] Write tests for the four expected verdicts.
- [ ] Assert post-cutoff files are not runner inputs.
- [ ] Assert the historical Trust Brief carries the reconstruction warning.
- [ ] Run focused tests.

## Chunk 3: Publish the Review Packet

### Task 5: Document method, result, and limitations

**Files:**
- Create: `pilots/pytest-backport-14193/README.md`
- Create: `pilots/pytest-backport-14193/METHOD.md`
- Create: `pilots/pytest-backport-14193/LIMITATIONS.md`
- Modify: `README.md`

- [ ] Explain the blinded cutoff and contract reconstruction.
- [ ] Report actual verdicts without hindsight claims.
- [ ] Compare the frozen focus questions with the later revert.
- [ ] Add the pilot to the repository map.

### Task 6: Generate immutable evidence

**Files:**
- Create: `pilots/pytest-backport-14193/evidence/raw-logs/*.log`
- Create: `pilots/pytest-backport-14193/evidence/trust-briefs/*.md`
- Create: `pilots/pytest-backport-14193/SHA256SUMS`

- [ ] Run the pilot runner.
- [ ] Save raw output and Trust Briefs.
- [ ] Generate checksums after all packet files are final.
- [ ] Verify `sha256sum -c SHA256SUMS`.

### Task 7: Verify and publish

- [ ] Run `npm run arc:gauntlet`.
- [ ] Run `npm test`.
- [ ] Run `uv run --project arc --extra dev pytest`.
- [ ] Review the diff for overclaiming and accidental post-cutoff leakage.
- [ ] Commit the pilot.
- [ ] Push the branch and open a pull request.

