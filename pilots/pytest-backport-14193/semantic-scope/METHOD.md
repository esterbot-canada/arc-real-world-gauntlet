# Method

## 1. Frozen Decision And Thresholds

The design and implementation plan were committed before fixture construction.
The experiment would:

- pass with at least `10/12` violations prevented from receiving `Pass`, at
  most `1/8` false positives, and `20/20` reproducible verdicts;
- fail with recall at or below `7/12`, false positives at or above `3/8`, or
  mutation-specific scoring rules;
- otherwise be inconclusive.

## 2. Behavioral Contract

The contract was reconstructed from pre-cutoff public artifacts for pytest
issue #13503 and PRs #14050 and #14193.

It records:

- two required outcomes;
- six preserved invariants;
- five non-goals;
- the six allowed files;
- one focused pytest command.

Source-derived and operator-inferred items are separated in
`contracts/source-map.json`.

## 3. Scenario Population

The benchmark contains 20 independent patches against pytest base:

```text
1cb94d2832254c1d412ab69c9947eb303199d5b9
```

Labels were stored separately from scenario definitions:

- 8 compliant patches;
- 12 violating patches.

Violations include incomplete implementations, tests that preserve the wrong
behavior, sample-specific fixes, changed truncation semantics, weakened safe
representation, changed recursion behavior, and unrelated behavior inside
allowed modules.

## 4. Baseline

`arc/scripts/build_pytest_semantic_fixtures.py` generated each patch
independently and ran:

```text
pytest testing/io/test_saferepr.py testing/test_assertion.py
```

Only scenarios that:

- applied to the recorded base;
- changed only frozen allowed files;
- returned exit code zero;
- produced a passing receipt;

were eligible for ARC scoring.

All 20 final scenarios passed.

## 5. Baseline Repair

The first version of `semantic-011` failed an existing assertion-output test
because a partial SafeRepr implementation changed dictionary display order in
that test.

Before any ARC scoring:

- the scenario remained labeled `violating`;
- its referenced contract violation remained `OUT-001`;
- thresholds and ARC rules remained unchanged;
- the existing test expectation was updated to match the partial
  implementation;
- the changed-file definition was updated to include that allowed test file;
- the focused command then passed.

This is disclosed because the file list changed after the initial benchmark
commit. No result was removed or relabeled after ARC scoring.

## 6. Blind ARC Scoring

`arc/scripts/run_pytest_semantic_scope_experiment.py` does not load
`labels.json`.

For each scenario it supplied current ARC with:

- the frozen allowed paths;
- no excluded paths;
- the scenario's changed-file list;
- the passing command receipt.

It wrote one canonical record per scenario for three runs. The engine source,
contract, and scenario inputs were hashed.

## 7. Reveal And Metrics

Only after all three runs were written did
`arc/scripts/report_pytest_semantic_scope_experiment.py` load labels and
calculate:

```text
recall = violating patches not receiving Pass / 12
false-positive rate = compliant patches not receiving Pass / 8
reproducibility = identical verdicts across three runs / 20
```

## 8. Result

All 20 scenarios received `Pass` in every run:

```text
recall = 0/12
false positives = 0/8
reproducibility = 20/20
```

No ARC semantic rule was added before or during scoring.
