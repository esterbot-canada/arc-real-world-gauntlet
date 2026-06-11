# Method

## 1. Repository Snapshots

The pilot used local clones at these public upstream commits:

- `mdegans/misanthropic`, branch `dev`:
  `c285ea8e605f69f59b4b331d962871e989a02c9b`
- `mdegans/agora-agents`, branch `main`:
  `cb3f266907a45d11d07ec3906425ec541e095c1c`

No pilot commits were pushed to either upstream repository.

## 2. Frozen Contracts

For `misanthropic`:

```text
Allowed:  arc-pilot/**
Excluded: hooks/**
```

Contract hash:

```text
sha256:d5e23e080425a4aa960e84aa5e4ea385180f41c4dcc449bcce693a1779930c40
```

For `agora-agents`:

```text
Allowed:  arc-pilot/**
Excluded:
  souls/generated/*/signing_key.hex
  souls/archived/*/signing_key.hex
  souls/generated/*/agent_id.txt
  souls/archived/*/agent_id.txt
```

Contract hash:

```text
sha256:f2b8ecc46e52094a4200f11d8c47e887aa353dbfe46004b2890c04a40dfc91c8
```

The original contract files are under [contracts](contracts).

## 3. Synthetic Commits

Each scenario started from the relevant upstream base SHA and created one
independent commit. The commits were siblings, not a seven-commit chain.

The two permitted scenarios added:

```text
arc-pilot/normal-change.md
```

The five protected scenarios added one of:

```text
hooks/arc-pilot-probe
souls/generated/arc-pilot-probe/signing_key.hex
souls/archived/arc-pilot-probe/signing_key.hex
souls/generated/arc-pilot-probe/agent_id.txt
souls/archived/arc-pilot-probe/agent_id.txt
```

The exact commits are exported as email-format patches under
[evidence/commits](evidence/commits).

## 4. ARC Execution

For each scenario, the pilot command supplied:

- local repository checkout
- exact base SHA
- exact synthetic head SHA
- frozen contract
- empty command-receipt file
- output path for the Trust Brief

ARC derived the changed file from the Git range, compared it with allowed and
excluded path globs, checked the frozen contract hash, and generated a Markdown
Trust Brief.

The exact invocations and CLI verdicts are preserved under
[evidence/raw-logs](evidence/raw-logs).

The focused Node verifier path that generated these artifacts is preserved
under [reproducer](reproducer). The current Python verifier lives at the
repository root under `arc/`; it is the active implementation but is not being
misrepresented as the generator of these older pilot artifacts.

## 5. Result Interpretation

An excluded path produces `Blocked`, even when the change is only a harmless
synthetic line. ARC is verifying the assignment boundary, not judging the
content.

An allowed path did not produce `Pass` because:

- the diff range was locally supplied rather than GitHub-provider verified
- the contract came from local operator input
- no required command evidence was defined

That fail-closed behavior is intentional. ARC should not upgrade incomplete
provenance into a trusted result.

## 6. Repetition

The seven checks were rerun on June 11, 2026. The verdicts matched the first
run: five `Blocked`, two `Needs Review`.

The public packet contains the June 11 rerun outputs.
