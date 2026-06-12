# Pytest Backport 14193 Retrospective Design

## Objective

Run a public, reproducible ARC retrospective against `pytest-dev/pytest`
PR #14193 without claiming that ARC can predict code correctness or release
decisions.

The experiment asks whether ARC can accurately report assignment scope and
available verification evidence using only information available when the
backport merged. The later revert is an outcome comparison, not an input to
the verdict.

## Historical Boundary

- Upstream repository: `pytest-dev/pytest`
- Original issue: #13503
- Original main-branch PR: #14050
- Backport under review: #14193
- Backport merge cutoff: `2026-02-14T17:02:08Z`
- Later outcome: revert PR #14366

The frozen packet must separate:

1. pre-cutoff sources used to reconstruct the assignment;
2. the exact base/head commits and changed files;
3. evidence available at the reviewed commit;
4. post-cutoff outcome material used only after ARC's verdict is frozen.

## Contract

This is a reconstructed historical contract because pytest did not use ARC or
publish an `.aiplan`. The packet must label that limitation prominently.

The contract will capture:

- desired behavior from issue #13503 and PR #14050;
- backport target and non-goals;
- the narrow file scope implied by the approved original patch;
- required focused verification derived from the original PR and repository
  test layout;
- assumptions introduced by the pilot operator.

The contract file and its SHA-256 hash will be published. Contract assertions
must cite their source artifact.

## Scenarios

The pilot contains four deterministic scenarios:

1. `historical-backport`: the exact #14193 patch and available evidence.
2. `mutation-unrelated-file`: the historical patch plus an unrelated file.
3. `mutation-missing-evidence`: the historical scope with no required receipt.
4. `mutation-failed-evidence`: the historical scope with a failed required
   receipt.

The mutations test ARC's deterministic boundary behavior. They are not claims
about what pytest contributors actually submitted.

## Artifacts

Create `pilots/pytest-backport-14193/` containing:

- `README.md`: result and reviewer entry point;
- `METHOD.md`: cutoff, reconstruction, execution, and reveal procedure;
- `LIMITATIONS.md`: hindsight, provenance, and inference limits;
- `contracts/`: frozen `.aiplan`, source map, and receipts;
- `sources/pre-cutoff/`: issue and PR metadata used by the contract;
- `sources/post-cutoff/`: revert metadata, isolated from verdict inputs;
- `evidence/patches/`: exact upstream patch and controlled mutations;
- `evidence/raw-logs/`: verifier output;
- `evidence/trust-briefs/`: deterministic Markdown verdicts;
- `scenarios/manifest.json`: inputs, expected verdicts, and actual verdicts;
- `SHA256SUMS`: packet integrity.

## Execution

Add a focused runner that reads checked-in fixtures and uses the current Python
boundary evaluator. It must not fetch mutable network data during verification.
The runner writes Trust Briefs and exits nonzero when actual verdicts differ
from the manifest.

The repository gauntlet command will run both the existing fixtures and this
pilot. Tests will cover the scenario manifest and the reconstructed-contract
warning.

## Interpretation

ARC may report `Pass`, `Needs Review`, or `Blocked` only for deterministic
contract/evidence facts. It must not claim that it would have prevented the
later revert.

The reveal compares ARC's pre-cutoff focus questions with the documented
reason for #14366. A mismatch is a product learning, not a result to hide.

## Success Criteria

- A clean checkout reproduces all four verdicts.
- The historical scenario uses the exact public base/head diff.
- Every contract claim has a pre-cutoff source or is labeled operator-inferred.
- The post-cutoff revert is not consumed by the verifier.
- All three mutations are detected with the expected severity.
- The packet explicitly states that this is reconstructed, retrospective, and
  not evidence that ARC was installed on pytest.

