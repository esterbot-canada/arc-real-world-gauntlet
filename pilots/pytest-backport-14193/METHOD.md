# Method

## 1. Case Selection

The reviewed change is pytest PR #14193, a backport of merged PR #14050 to the
`9.0.x` branch.

```text
Base: 1cb94d2832254c1d412ab69c9947eb303199d5b9
Head: 1a81ee64323647045ab86af6096ace284f49d779
Merge cutoff: 2026-02-14T17:02:08Z
```

The exact public base-to-head patch is stored under `evidence/patches/`. Its
SHA-256 is:

```text
73e2afb9e22bc747fb608466c8656e3f5eccea4516f9612ec99831e4f68595cc
```

## 2. Information Boundary

The contract reconstruction used only:

- issue #13503;
- merged main-branch PR #14050;
- backport PR #14193 metadata, changed files, approval, and checks available by
  the cutoff.

Comments posted after the cutoff were excluded. The later revert is stored
under `sources/post-cutoff/` and is never loaded by the runner.

## 3. Reconstructed Contract

The allowed file list is the exact six-file set shared by #14050 and #14193.
No excluded paths were invented.

The focused command is operator-inferred:

```text
pytest testing/io/test_saferepr.py testing/test_assertion.py
```

Public GitHub checks were broadly green, but ARC did not execute this exact
command against the reviewed head. The historical run therefore has no
same-run command receipt.

The contract also records an unresolved reviewer focus:

```text
Does this behavior-changing backport meet pytest's 9.0.x patch-release policy?
```

This question is based on pre-cutoff facts, but it was not an upstream frozen
criterion. The Trust Brief labels the contract as reconstructed.

## 4. Controlled Scenarios

The four scenarios are:

- `historical-backport`: exact changed-file set, no ARC command receipt;
- `mutation-unrelated-file`: adds `README.rst` outside allowed scope and uses a
  synthetic passing receipt;
- `mutation-missing-evidence`: allowed files with no receipt;
- `mutation-failed-evidence`: allowed files with a synthetic failed receipt.

Synthetic receipts exist only to isolate verifier behavior. They are not
presented as pytest CI artifacts.

## 5. Execution

`arc/scripts/run_pytest_pilot.py`:

1. loads the checked-in YAML contract;
2. loads each checked-in scenario;
3. evaluates paths and command evidence with the current Python ARC engine;
4. adds explicitly labeled operator findings for the historical reconstruction;
5. renders a deterministic Trust Brief and raw log;
6. compares the actual verdict with the expected verdict.

## 6. Outcome Reveal

Only after defining and running the historical scenario do we compare it with
PR #14366. The documented later reason was release classification, not a test
failure or an out-of-scope path.

The fair conclusion is narrow: ARC can preserve this decision as an explicit
contract question. Current path and command checks cannot infer release-policy
suitability on their own.

