# ARC Verifier

This is the current deterministic Python implementation of ARC's narrow
Contract + Evidence + Verdict workflow.

It checks:

- changed files against frozen allowed and excluded scope
- repository protected-path rules
- required commands executed by ARC against the reviewed commit
- selected TypeScript import boundaries
- evidence provenance in a canonical JSON and Markdown Trust Brief

It does not judge code quality or replace CI and human review.

## Test

```bash
uv run --project arc --extra dev pytest
```

## GitHub PR Usage

```bash
uv run --project arc agent-evidence pr owner/repo 123 \
  --repo-root /path/to/checkout \
  --contract /path/to/checkout/.arc/contract.json \
  --rules /path/to/checkout/.arc/rules.json \
  --verify-required-commands \
  --trust-out trust-brief.md \
  --trust-json-out trust-brief.json
```

The `gh` CLI must be installed and authenticated. With
`--verify-required-commands`, ARC refuses a dirty checkout and requires local
`HEAD` to equal the reviewed PR head SHA.

## Trust Brief Authorship

`trust-brief.json` is canonical. Markdown is rendered deterministically from
the same document. Evidence is labeled:

- `arc_verified`
- `agent_reported`
- `operator_supplied`

Human interpretation belongs outside the canonical artifact.

The checked-in [SWE-bench dogfood](dogfood/pytest-dev__pytest-11148) shows an
honest blocked run where the generated patch targeted the wrong repository
path and verification failed.
