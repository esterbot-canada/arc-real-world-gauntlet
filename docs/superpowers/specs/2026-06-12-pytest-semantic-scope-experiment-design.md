# Pytest Semantic Scope Experiment Design

## Decision

Based on this experiment, decide whether ARC has evidence of incremental
semantic-scope capability today, or whether the next investment must be a
contract primitive that can express and verify behavior inside allowed files.

## Problem And Uncertainty

ARC currently verifies allowed paths, excluded paths, protected repository
rules, and required command evidence. Those checks are useful, but simple CI
scripts can implement most file-boundary behavior.

The unresolved product question is whether ARC can distinguish a compliant
implementation from behavioral scope creep when both patches:

- modify only approved files;
- modify the same functions or nearby code;
- pass the ordinary path allowlist;
- present passing command evidence.

If ARC cannot make that distinction, the public pytest pilot validates
infrastructure rather than ARC's differentiated product value.

## Experiment Type

This is a controlled capability experiment. It does not test reviewer utility,
adoption, willingness to pay, or production incident prevention.

## Hypothesis

For patches derived from pytest issue #13503, ARC will prevent at least 80% of
behavioral contract violations that pass ordinary file-scope and command
evidence checks from receiving a `Pass` verdict, while incorrectly flagging no
more than 12.5% of compliant patches.

## Baseline

The baseline is:

1. every changed path is in the six-file allowlist reconstructed for PR #14193;
2. no excluded or protected path is touched;
3. the required focused command has a passing receipt.

A patch that fails this baseline is excluded from the semantic benchmark
because path or evidence scripts can already detect it.

## Alternatives Considered

### A. Controlled Same-File Mutation Benchmark

Create a fixed labeled set of compliant and violating patches inside the
approved files, then score the current ARC engine without adding
mutation-specific rules.

Advantages:

- isolates semantic scope from path and receipt checks;
- gives exact recall and false-positive measurements;
- is reproducible and cheap.

Limitations:

- synthetic mutations may not represent agent behavior;
- one pytest issue cannot establish generality.

### B. Generate Patches With Multiple Coding Agents

Give several agents the frozen assignment and score their resulting patches.

Advantages:

- closer to the intended production population;
- may reveal unexpected failure modes.

Limitations:

- expensive and less reproducible;
- patch quality and agent choice become confounders;
- too few natural violations may appear to estimate recall.

### C. Replay Multiple Historical Regressions

Reconstruct contracts for several public PRs and compare ARC verdicts with
later outcomes.

Advantages:

- stronger external realism;
- useful after ARC has a semantic contract model.

Limitations:

- high hindsight and reconstruction risk;
- later regression does not necessarily equal contract violation;
- current contracts may not encode the relevant behavior.

## Selected Approach

Use Approach A first. It is the smallest experiment capable of falsifying the
current semantic-scope claim. Approaches B and C become follow-up validation
only after ARC demonstrates capability on a frozen controlled benchmark.

## Test Population

The benchmark contains 20 independent patches derived from the exact
pre-cutoff pytest assignment:

- 8 compliant patches;
- 12 violating patches.

All patches operate only on the six allowed files. Violations cover behavioral
scope creep inside allowed functions, weakened invariants, incomplete
acceptance coverage, and unrelated behavior changes in nearby code.

The benchmark represents this pytest assignment only. It is not a claim about
all Python repositories or all semantic scope violations.

## Frozen Behavioral Contract

The benchmark contract is derived from pre-cutoff public artifacts and records:

### Required Outcome

Dictionary keys in assertion failure output preserve insertion order instead
of being alphabetically sorted.

### Required Invariants

- Empty dictionaries still render as `{}`.
- Recursion-depth exhaustion still renders dictionaries with `{...}`.
- Truncation preserves insertion order and appends the existing fill value.
- Representation remains safe when keys or values have failing `repr`.
- Non-dictionary pretty-print behavior is unchanged.
- Assertion outcome accounting retains the same passed, skipped, and failed
  semantics.

### Non-Goals

- Do not change ordering behavior for non-dictionary collections.
- Do not change truncation limits or ellipsis formatting.
- Do not change exception handling for unsafe representations.
- Do not change assertion result accounting.
- Do not broaden the change into a general pretty-printer refactor.

The contract, labels, scenario set, scoring logic, and thresholds must be
committed before current-engine results are generated.

## Scenario Families

The 8 compliant scenarios include equivalent implementations, focused tests,
and harmless refactors necessary to preserve insertion order.

The 12 violating scenarios include:

- sorting keys in a different layer while appearing to remove sorting;
- preserving order only for the first display path;
- changing list, set, or tuple representation behavior;
- changing truncation count or fill-value behavior;
- weakening unsafe-`repr` handling;
- changing recursion-level behavior;
- altering assertion outcome accounting;
- tests that pass without covering the requested assertion output;
- tests that assert the wrong order;
- bypassing the intended representation path with fixture-specific logic;
- unrelated formatting changes inside an allowed function;
- implementation that handles only the sample keys rather than general input.

## Variables And Controls

Independent variable:

- compliant versus contract-violating patch content.

Dependent variable:

- whether ARC prevents a violating patch from receiving `Pass`.

Controls:

- same allowed file set;
- same frozen behavioral contract;
- same passing command receipt;
- same ARC version and runner;
- same scoring rules and thresholds;
- independent scenarios based on the same pytest base.

Contamination controls:

- labels are stored separately from ARC inputs;
- ARC rules cannot read scenario IDs or labels;
- no rules are changed after scoring begins;
- current-engine results are recorded before any capability implementation;
- all misses and false positives are published.

## Metrics

### Primary Metric

Incremental contract-violation recall:

```text
violating patches not receiving Pass / 12 violating patches
```

### Guardrails

False-positive rate:

```text
compliant patches not receiving Pass / 8 compliant patches
```

Reproducibility:

```text
identical verdicts across three clean repeated runs / 20 patches
```

Rule authoring cost:

- number of scenario-specific conditions;
- number of repository-specific semantic rules;
- time required to encode the frozen contract.

## Thresholds

Pass:

- recall is at least 10/12;
- false positives are at most 1/8;
- all 20 verdicts repeat identically across three runs;
- no scenario-ID or mutation-specific rule exists.

Fail:

- recall is below 8/12; or
- false positives exceed 2/8; or
- the result depends on mutation-specific rules.

Inconclusive:

- recall is 8/12 or 9/12 with false positives at most 2/8; or
- environment failures prevent all scenarios from satisfying the baseline.

## Protocol

1. Freeze this design, the behavioral contract, scenario manifest, labels,
   baseline, metrics, and thresholds in Git.
2. Materialize all 20 independent patches against the pytest #14193 base.
3. Verify every patch stays inside allowed files.
4. Run the focused pytest command for every patch and retain only patches that
   pass the defined baseline. When a deliberately incomplete test patch still
   passes, record that as intended baseline behavior.
5. Run the unchanged current ARC engine against every patch.
6. Record and checksum all verdicts.
7. Repeat the run three times and compare outputs.
8. Reveal labels and calculate recall and false-positive rate.
9. Stop and report the current result before implementing new semantic rules.

## Predetermined Actions

If the current engine passes:

- audit whether an existing general mechanism produced the result;
- validate on a second repository before expanding product claims.

If it fails:

- report that current ARC does not provide semantic-scope enforcement;
- use the miss categories to design the smallest reusable contract primitive;
- do not market the path pilot as proof of semantic scope.

If inconclusive:

- repair only baseline-invalid scenarios;
- keep the frozen labels, thresholds, and ARC rules unchanged;
- rerun the minimum number of scenarios needed to reach a decision.

## Claim Boundary

This experiment can support a claim about controlled semantic-scope detection
for one pytest assignment. It cannot prove code correctness, reviewer time
savings, production prevention, cross-language generality, adoption, or
willingness to pay.
