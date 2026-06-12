# Pytest PR #14193 ARC Retrospective

This packet applies ARC retrospectively to
[`pytest-dev/pytest` PR #14193](https://github.com/pytest-dev/pytest/pull/14193),
a backport to the `9.0.x` maintenance branch.

Pytest did not use ARC for this pull request. The contract was reconstructed
from public artifacts available by the merge cutoff:
`2026-02-14T17:02:08Z`.

## Result

- Historical backport: `Needs Review`
- Unrelated-file mutation with passing evidence: `Needs Review`
- Missing-evidence mutation: `Needs Review`
- Failed-evidence mutation: `Blocked`

ARC did not label the historical code incorrect. The changed paths matched the
reconstructed scope and public CI was broadly green. It requested review
because:

1. no same-run ARC receipt existed for the exact focused command;
2. pytest never approved the reconstructed contract;
3. patch-release suitability was not encoded as a frozen decision.

The third point matched the later outcome. On April 7, 2026, maintainers
reverted the `9.0.x` backport because the behavior change was considered too
large for a patch release and could wait for `9.1.0`.

That comparison does not prove ARC predicted the revert. The release question
was added by the pilot operator from pre-cutoff facts: the maintenance branch
and behavior-changing assignment.

## Review Order

1. Read [METHOD.md](METHOD.md).
2. Inspect the [frozen contract](contracts/pytest-backport-14193.aiplan) and
   [source map](contracts/source-map.json).
3. Inspect the exact
   [base-to-head patch](evidence/patches/historical-backport.patch).
4. Read the
   [historical Trust Brief](evidence/trust-briefs/historical-backport.md).
5. Compare it with the isolated
   [post-cutoff outcome](sources/post-cutoff/pr-14366.json).
6. Read [LIMITATIONS.md](LIMITATIONS.md).
7. Run `sha256sum -c SHA256SUMS`.

## Reproduce

From the repository root:

```bash
npm run arc:pytest-pilot
```

The runner uses only checked-in fixtures. It does not fetch GitHub or consume
post-cutoff outcome data.

