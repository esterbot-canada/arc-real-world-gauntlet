# Pytest Semantic Scope Experiment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and run a frozen 20-scenario benchmark that measures whether the unchanged ARC engine adds semantic-scope detection beyond path allowlists and passing command evidence.

**Architecture:** Add an immutable benchmark packet under the existing pytest pilot, with labels isolated from ARC inputs. A focused runner validates that every scenario passes the path/evidence baseline, invokes the unchanged ARC evaluator, repeats scoring three times, then calculates recall and false-positive rate only after loading labels.

**Tech Stack:** Python 3.11+, pytest, PyYAML, Git patches, ARC's existing `agent_work_evidence` package.

---

## Chunk 1: Freeze The Benchmark

### Task 1: Define the machine-readable behavioral contract

**Files:**
- Create: `pilots/pytest-backport-14193/semantic-scope/contracts/behavioral-contract.json`
- Create: `pilots/pytest-backport-14193/semantic-scope/contracts/source-map.json`
- Test: `arc/tests/test_pytest_semantic_scope_experiment.py`

- [ ] **Step 1: Write the failing contract-shape test**

Assert that the behavioral contract contains:

```python
{
    "schema_version": 1,
    "status": "frozen",
    "required_outcomes": [...],
    "invariants": [...],
    "non_goals": [...],
    "allowed_files": [...],
}
```

Also assert that every contract item has a source or is labeled
`operator_inferred`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
uv run --project arc --extra dev pytest arc/tests/test_pytest_semantic_scope_experiment.py -v
```

Expected: failure because the contract files do not exist.

- [ ] **Step 3: Add the frozen contract and source map**

Encode only the outcomes, invariants, and non-goals approved in the design.
Use stable IDs such as `OUT-001`, `INV-001`, and `NG-001`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run the command from Step 2.

Expected: contract-shape test passes.

- [ ] **Step 5: Commit**

```bash
git add pilots/pytest-backport-14193/semantic-scope/contracts arc/tests/test_pytest_semantic_scope_experiment.py
git commit -m "test: freeze pytest semantic behavior contract"
```

### Task 2: Freeze the 20-scenario manifest and hidden labels

**Files:**
- Create: `pilots/pytest-backport-14193/semantic-scope/scenarios/manifest.json`
- Create: `pilots/pytest-backport-14193/semantic-scope/scenarios/labels.json`
- Create: `pilots/pytest-backport-14193/semantic-scope/scenarios/definitions/*.json`
- Modify: `arc/tests/test_pytest_semantic_scope_experiment.py`

- [ ] **Step 1: Write failing manifest-integrity tests**

Assert:

- exactly 20 scenarios exist;
- labels contain exactly 8 `compliant` and 12 `violating`;
- every scenario changes only one or more of the six allowed files;
- scenario definitions do not contain their label;
- IDs and labels are unique;
- every violation references at least one frozen contract item;
- compliant scenarios reference the outcomes or invariants they preserve.

- [ ] **Step 2: Run the focused test and verify it fails**

Expected: failure because scenario fixtures do not exist.

- [ ] **Step 3: Add scenario definitions and labels**

Each definition records:

```json
{
  "id": "semantic-001",
  "title": "descriptive title without class label",
  "patch": "../patches/semantic-001.patch",
  "changed_files": ["src/_pytest/_io/saferepr.py"],
  "required_command": "pytest testing/io/test_saferepr.py testing/test_assertion.py",
  "expected_baseline": "pass",
  "contract_items": ["OUT-001", "INV-002"]
}
```

Keep labels only in `labels.json`.

- [ ] **Step 4: Run the focused test and verify it passes**

- [ ] **Step 5: Commit**

```bash
git add pilots/pytest-backport-14193/semantic-scope/scenarios arc/tests/test_pytest_semantic_scope_experiment.py
git commit -m "test: freeze pytest semantic benchmark manifest"
```

## Chunk 2: Materialize Baseline-Passing Patches

### Task 3: Add independent patch fixtures

**Files:**
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-001.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-002.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-003.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-004.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-005.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-006.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-007.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-008.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-009.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-010.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-011.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-012.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-013.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-014.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-015.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-016.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-017.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-018.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-019.patch`
- Create: `pilots/pytest-backport-14193/semantic-scope/patches/semantic-020.patch`
- Modify: `arc/tests/test_pytest_semantic_scope_experiment.py`

- [ ] **Step 1: Write failing patch-integrity tests**

For every patch:

- it parses as a Git patch;
- all `diff --git` paths match the scenario definition;
- all paths are in the frozen allowlist;
- it has no scenario label or expected ARC verdict embedded in its text;
- it is independent and applies to the recorded pytest base.

- [ ] **Step 2: Run the focused test and verify it fails**

- [ ] **Step 3: Materialize eight compliant patches**

Cover equivalent implementations and focused test variants without weakening
the frozen invariants.

- [ ] **Step 4: Materialize twelve violating patches**

Cover the twelve violation families frozen in the design. Keep all changes
inside allowed files and functions.

- [ ] **Step 5: Run patch-integrity tests**

Expected: all 20 patch fixtures pass integrity checks.

- [ ] **Step 6: Commit**

```bash
git add pilots/pytest-backport-14193/semantic-scope/patches arc/tests/test_pytest_semantic_scope_experiment.py
git commit -m "test: add pytest same-file semantic patches"
```

### Task 4: Validate the baseline independently

**Files:**
- Create: `arc/scripts/validate_pytest_semantic_baseline.py`
- Create: `pilots/pytest-backport-14193/semantic-scope/evidence/baseline/.gitkeep`
- Modify: `arc/tests/test_pytest_semantic_scope_experiment.py`

- [ ] **Step 1: Write failing tests for the baseline validator**

The validator must reject scenarios that:

- touch a non-allowed path;
- fail to apply to the base;
- omit the passing receipt fixture;
- contain a failed receipt.

- [ ] **Step 2: Run tests and verify failure**

- [ ] **Step 3: Implement the baseline validator**

The validator:

1. creates a temporary checkout for each independent patch;
2. applies the patch to the recorded base;
3. verifies changed paths against the frozen allowlist;
4. runs the focused pytest command where feasible;
5. records exit code, duration, and output hash;
6. writes one baseline receipt per scenario;
7. refuses to score ARC if any scenario fails the baseline.

- [ ] **Step 4: Run all 20 baseline checks**

Run:

```bash
uv run --project arc python arc/scripts/validate_pytest_semantic_baseline.py
```

Expected: 20 baseline passes. If a scenario fails, repair only the scenario
implementation while preserving its frozen label and contract items.

- [ ] **Step 5: Commit receipts**

```bash
git add arc/scripts/validate_pytest_semantic_baseline.py arc/tests/test_pytest_semantic_scope_experiment.py pilots/pytest-backport-14193/semantic-scope/evidence/baseline
git commit -m "test: verify semantic benchmark baseline"
```

## Chunk 3: Score The Unchanged ARC Engine

### Task 5: Add a blind current-engine scorer

**Files:**
- Create: `arc/scripts/run_pytest_semantic_scope_experiment.py`
- Create: `pilots/pytest-backport-14193/semantic-scope/evidence/current-engine/.gitkeep`
- Modify: `arc/tests/test_pytest_semantic_scope_experiment.py`
- Modify: `package.json`

- [ ] **Step 1: Write failing scorer tests**

Assert that the scorer:

- loads scenario definitions but not `labels.json` during ARC evaluation;
- invokes the current `evaluate_boundaries` implementation unchanged;
- supplies the same allowed paths and passing command evidence;
- writes canonical per-scenario verdict records;
- produces identical output for repeated runs;
- cannot import scenario labels before the reveal phase.

- [ ] **Step 2: Run tests and verify failure**

- [ ] **Step 3: Implement blind scoring**

Write three run directories:

```text
evidence/current-engine/run-1/
evidence/current-engine/run-2/
evidence/current-engine/run-3/
```

Each scenario record contains only:

```json
{
  "scenario_id": "semantic-001",
  "arc_verdict": "pass",
  "finding_rule_ids": [],
  "engine_commit": "...",
  "contract_hash": "...",
  "input_hash": "..."
}
```

- [ ] **Step 4: Add package command**

Add:

```json
"arc:pytest-semantic": "uv run --project arc python arc/scripts/run_pytest_semantic_scope_experiment.py"
```

- [ ] **Step 5: Run focused tests**

- [ ] **Step 6: Commit**

```bash
git add arc/scripts/run_pytest_semantic_scope_experiment.py arc/tests/test_pytest_semantic_scope_experiment.py package.json pilots/pytest-backport-14193/semantic-scope/evidence/current-engine
git commit -m "test: add blind semantic scope scorer"
```

### Task 6: Reveal labels and calculate metrics

**Files:**
- Create: `arc/scripts/report_pytest_semantic_scope_experiment.py`
- Create: `pilots/pytest-backport-14193/semantic-scope/RESULTS.md`
- Create: `pilots/pytest-backport-14193/semantic-scope/evidence/metrics.json`
- Modify: `arc/tests/test_pytest_semantic_scope_experiment.py`

- [ ] **Step 1: Write failing metric tests**

Test:

```python
recall = violations_not_passed / 12
false_positive_rate = compliant_not_passed / 8
reproducibility = identical_verdicts / 20
```

Test the frozen pass, fail, and inconclusive thresholds exactly.

- [ ] **Step 2: Run tests and verify failure**

- [ ] **Step 3: Implement reveal and metric calculation**

The reporter loads the completed run records first, then loads `labels.json`.
It reports every scenario, including misses and false positives.

- [ ] **Step 4: Run the unchanged-engine experiment**

Run:

```bash
npm run arc:pytest-semantic
uv run --project arc python arc/scripts/report_pytest_semantic_scope_experiment.py
```

Expected: an honest `pass`, `fail`, or `inconclusive` result based on the
precommitted thresholds. Do not modify ARC rules after observing this result.

- [ ] **Step 5: Commit the immutable current-engine result**

```bash
git add arc/scripts/report_pytest_semantic_scope_experiment.py arc/tests/test_pytest_semantic_scope_experiment.py pilots/pytest-backport-14193/semantic-scope/RESULTS.md pilots/pytest-backport-14193/semantic-scope/evidence
git commit -m "experiment: record current ARC semantic scope result"
```

## Chunk 4: Publish Without Overclaiming

### Task 7: Document method and limitations

**Files:**
- Create: `pilots/pytest-backport-14193/semantic-scope/README.md`
- Create: `pilots/pytest-backport-14193/semantic-scope/METHOD.md`
- Create: `pilots/pytest-backport-14193/semantic-scope/LIMITATIONS.md`
- Create: `pilots/pytest-backport-14193/semantic-scope/SHA256SUMS`
- Modify: `pilots/pytest-backport-14193/README.md`
- Modify: `README.md`

- [ ] **Step 1: Document the decision and hypothesis**

Lead with the product decision, baseline, primary metric, and frozen threshold.

- [ ] **Step 2: Publish complete scenario results**

Include misses, false positives, exclusions, environment failures, and any
protocol deviations.

- [ ] **Step 3: State supported and unsupported claims**

Explicitly separate controlled capability from reviewer utility, production
prevention, adoption, and generality.

- [ ] **Step 4: Generate and verify checksums**

Run:

```bash
find pilots/pytest-backport-14193/semantic-scope -type f ! -name SHA256SUMS -print0 \
  | sort -z \
  | xargs -0 sha256sum > pilots/pytest-backport-14193/semantic-scope/SHA256SUMS
sha256sum -c pilots/pytest-backport-14193/semantic-scope/SHA256SUMS
```

- [ ] **Step 5: Run repository verification**

Run:

```bash
npm test
npm run arc:gauntlet
uv run --project arc --extra dev pytest
git diff --check
```

- [ ] **Step 6: Commit**

```bash
git add README.md pilots/pytest-backport-14193
git commit -m "docs: publish pytest semantic scope experiment"
```

### Task 8: Stop at the decision boundary

- [ ] **Step 1: Review the result against predetermined actions**

If current ARC fails, open a separate design cycle for the smallest reusable
semantic contract primitive. Do not implement it in this experiment branch.

- [ ] **Step 2: Review for overclaiming**

Reject wording that says ARC proves correctness, prevented the historical
revert, or generalizes beyond this controlled pytest assignment.

- [ ] **Step 3: Push the experiment branch and update the public PR**

Publish only after all checks pass and the complete current-engine result is
committed.
