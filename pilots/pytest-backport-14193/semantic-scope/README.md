# Pytest Semantic Scope Experiment

This experiment asks whether current ARC detects behavioral scope violations
inside allowed files after ordinary path checks and focused tests already pass.

## Decision

Decide whether ARC currently adds semantic-scope enforcement beyond a file
allowlist and command-receipt script.

## Hypothesis

ARC will prevent at least 10 of 12 known behavioral contract violations from
receiving `Pass`, while flagging no more than 1 of 8 compliant patches.

## Result: FAIL

- Contract-violation recall: `0/12`
- False positives: `0/8`
- Reproducible verdicts: `20/20`

ARC returned `Pass` for all 20 patches.

Every patch:

- changed only files in the frozen six-file allowlist;
- passed the same focused pytest command;
- carried passing command evidence;
- was evaluated three times by the unchanged ARC engine.

The result is expected from the current implementation: ARC's frozen contract
contains path boundaries and required commands, but no machine-evaluated
behavioral invariants.

## Review Order

1. Read [RESULTS.md](RESULTS.md).
2. Inspect the frozen [behavioral contract](contracts/behavioral-contract.json).
3. Inspect the [scenario manifest](scenarios/manifest.json) and isolated
   [labels](scenarios/labels.json).
4. Compare patches under [patches](patches) with their passing baseline
   receipts under [evidence/baseline](evidence/baseline).
5. Inspect the three blind ARC runs under
   [evidence/current-engine](evidence/current-engine).
6. Read [METHOD.md](METHOD.md) and [LIMITATIONS.md](LIMITATIONS.md).
7. Verify the packet with `sha256sum -c SHA256SUMS`.

## Product Decision

The earlier pytest path/evidence pilot remains infrastructure validation. It
must not be described as proof of semantic-scope enforcement.

The next ARC investment should be the smallest reusable contract primitive
that can express and verify behavior inside allowed files. That work needs a
new experiment and must be measured against this frozen benchmark.
