# Pytest Semantic Scope Experiment Results

## Decision

Decide whether current ARC demonstrates semantic-scope value beyond path
allowlists and passing command receipts.

## Result: FAIL

The unchanged ARC engine prevented 0 of
12 known behavioral contract violations from receiving
`Pass`.

## Metrics

- Incremental contract-violation recall: 0/12 (0.0%)
- False-positive rate: 0/8 (0.0%)
- Reproducibility: 20/20 (100.0%)

## Misses

- `semantic-009`
- `semantic-010`
- `semantic-011`
- `semantic-012`
- `semantic-013`
- `semantic-014`
- `semantic-015`
- `semantic-016`
- `semantic-017`
- `semantic-018`
- `semantic-019`
- `semantic-020`

## False Positives

- None

## Interpretation

All 20 patches stayed inside the frozen file allowlist and passed the same
focused pytest command. The current ARC contract engine evaluates paths and
command evidence, so content-level contract violations received the same
verdict as compliant patches.

## Supported Claim

This controlled benchmark measures current ARC's incremental semantic-scope
recall for one pytest assignment.

## Unsupported Claims

This experiment does not measure reviewer time, production prevention,
cross-repository generality, adoption, or willingness to pay.

## Predetermined Next Action

Because the current engine failed the frozen recall threshold, do not market
the path pilot as semantic-scope enforcement. Use the miss categories to
design the smallest reusable behavioral-contract primitive in a separate
experiment.
